/**
 * Observational Memory (OM) runtime.
 *
 * Long threads eventually exceed the model window. The old approach in
 * `Controller` was a hard cut: drop the oldest messages and prepend a
 * "[N messages folded]" note containing the first user request. That loses
 * everything the agent learned along the way — which files it read, which
 * approaches already failed — so the model re-reads the same files and repeats
 * the same mistakes, costing more tokens than the note saved.
 *
 * OM replaces the cut with a rolling summary produced by an LLM. Two levels:
 *
 * - **Observer** reads raw messages and appends concrete observations
 *   ("auth lives in src/auth/session.ts", "user asked for pnpm").
 * - **Reflector** folds a long observation log into a shorter one once it grows
 *   past `observationTokens`, so the log does not grow without bound.
 *
 * The blocking tension is latency: running the Observer on every step adds an
 * LLM round-trip to every turn. So work is staged by token thresholds:
 *
 * | depth            | trigger                                  | blocks the reply |
 * |------------------|------------------------------------------|------------------|
 * | buffered         | `messageTokens * bufferTokens`           | no               |
 * | activation       | `messageTokens`                          | no (uses buffer) |
 * | synchronous      | `messageTokens * blockAfter`             | yes              |
 *
 * `bufferActivation` is the numeric budget of buffered observations to admit
 * when crossing `messageTokens`: the buffer usually holds more than is needed,
 * and spending it all at once would crowd out recent turns, so the remainder
 * stays queued for the next crossing.
 */

import type { ObservationalMemoryConfig } from "../../memory/types.js"
import { TokenCounter } from "../../memory/token-counter.js"
import { truncateStringForTokenEstimate } from "../../utils/token-estimator.js"

/** Shape of the observations row, kept loose to match the store's own type. */
export interface ObservationalRecord {
	activeObservations: string
	observationTokenCount?: number
	generationCount?: number
	observedMessageIds?: string[] | null
	bufferedObservations?: string | null
	bufferedObservationTokens?: number | null
	bufferedMessageIds?: string[] | null
	lastObservedAt?: Date | string | null
	lastReflectionAt?: Date | string | null
}

export interface ObservationMessage {
	id?: string
	role: string
	content?: any
}

export interface ObservationModel {
	generate(args: {
		prompt: string
		system?: string
		maxTokens?: number
	}): Promise<{ text: string }>
}

/**
 * Resolves the model config entry (`model` may be a model instance or a
 * factory receiving the request context) into something with `generate()`.
 */
export function resolveObservationModel(
	model: ObservationalMemoryConfig["observation"] extends {
		model?: infer M
	}
		? M
		: unknown,
	requestContext?: any,
): ObservationModel | null {
	const resolved =
		typeof model === "function" ? (model as any)({ requestContext }) : model
	if (!resolved) return null
	if (typeof resolved.generate === "function") return resolved
	return null
}

/**
 * Normalises `blockAfter`, which may be a multiplier of `messageTokens`
 * (`2`) or an absolute token count (`>= 100`).
 *
 * Both meanings are needed: a multiplier scales with the configured window,
 * while an absolute count pins the ceiling regardless of configuration.
 */
export function resolveBlockAfter(
	blockAfter: number | undefined,
	baseTokens: number,
	fallbackRatio: number,
): number {
	const ratio =
		typeof blockAfter === "number" &&
		Number.isFinite(blockAfter) &&
		blockAfter > 0
			? blockAfter
			: fallbackRatio
	if (ratio >= 100) return ratio
	return Math.floor(baseTokens * ratio)
}

/** Renders messages into the plain transcript the Observer reads. */
export function formatTranscript(messages: ObservationMessage[]): string {
	return messages
		.map((m) => {
			const c = m.content
			let text = ""
			if (typeof c === "string") {
				text = c
			} else if (Array.isArray(c)) {
				text = c
					.map((p: any) =>
						p?.type === "text" ? (p.text ?? "") : p?.text ? String(p.text) : "",
					)
					.join("\n")
			} else if (c && typeof c === "object") {
				text = typeof c.content === "string" ? c.content : ""
			}
			return `${m.role}: ${text}`.trim()
		})
		.join("\n\n")
}

export const OBSERVER_SYSTEM_PROMPT = `You maintain a running memory of a coding session.
Extract only durable, verifiable facts that a future turn would need and could not cheaply re-derive:
decisions made, file paths that matter, constraints the user stated, approaches that failed and why.
Skip greetings, restated instructions, and step-by-step narration.
Write terse bullet points, one fact per line. Do not invent anything not present in the transcript.`

export const REFLECTOR_SYSTEM_PROMPT = `You are compacting a coding session's observation log.
Merge duplicates, drop facts that later observations superseded or contradicted, and keep every
constraint the user stated plus every file path needed to resume work.
Preserve concrete identifiers verbatim. Output terse bullet points only.`

/**
 * Counts how many of the trailing messages fall within `tokenBudget`, so the
 * window is measured in tokens rather than message count.
 */
export function selectRecentMessages<T extends ObservationMessage>(
	messages: T[],
	tokenBudget: number,
	counter: TokenCounter,
): { recent: T[]; folded: T[]; tokens: number } {
	let tokens = 0
	let startIndex = messages.length
	for (let i = messages.length - 1; i >= 0; i--) {
		const cost = counter.estimateTokens(formatTranscript([messages[i]]))
		if (tokens + cost > tokenBudget) break
		tokens += cost
		startIndex = i
	}
	// A window that begins on a tool result has lost the call that produced it;
	// providers reject an orphaned tool result, so start at the next message.
	while (startIndex < messages.length && messages[startIndex].role === "tool") {
		startIndex++
	}
	return {
		recent: messages.slice(startIndex),
		folded: messages.slice(0, startIndex),
		tokens,
	}
}

export interface ObservationStepResult {
	/** Observation text to persist as the new active log. */
	activeObservations: string
	/** Messages newly consumed by this observation, for dedupe on the next pass. */
	observedMessageIds: string[]
	/** Observations deferred past `bufferActivation`, awaiting a later crossing. */
	bufferedObservations?: string | null
	bufferedObservationTokens?: number
	kind: "none" | "observed" | "reflected"
	blocked: boolean
}

/**
 * Runs one Observer/Reflector pass.
 *
 * Returns `kind: "none"` when under the buffering threshold, which is the
 * common case and must stay cheap: no model is resolved and no token counting
 * beyond the caller's own budget happens here.
 */
export async function runObservationStep(args: {
	config: ObservationalMemoryConfig
	record: ObservationalRecord | null
	messages: ObservationMessage[]
	pendingTokens: number
	counter?: TokenCounter
	requestContext?: any
	foldedMessageIds?: string[] | Set<string>
}): Promise<ObservationStepResult> {
	const { config, record, messages, pendingTokens } = args
	const counter = args.counter ?? new TokenCounter()
	const obs = config?.observation
	const ref = config?.reflection
	const messageTokens = obs?.messageTokens ?? 30_000
	const observationTokens = ref?.observationTokens ?? 40_000

	const existing = record?.activeObservations?.trim() || ""
	const existingCount =
		record?.observationTokenCount ?? counter.estimateTokens(existing)

	// Reflection is checked first: once the log itself is oversized, appending
	// more to it only makes the next request bigger.
	const reflectionThreshold = resolveBlockAfter(
		ref?.blockAfter,
		observationTokens,
		1.1,
	)
	if (
		existing &&
		existingCount > reflectionThreshold &&
		typeof ref?.model !== "undefined"
	) {
		const model = resolveObservationModel(ref.model as any, args.requestContext)
		if (model) {
			const result = await model.generate({
				system: REFLECTOR_SYSTEM_PROMPT,
				prompt: existing,
				maxTokens: Math.max(256, Math.floor(observationTokens / 4)),
			})
			const reflected = (result?.text || "").trim()
			if (reflected) {
				return {
					activeObservations: reflected,
					observedMessageIds: record?.observedMessageIds ?? [],
					kind: "reflected",
					blocked: true,
				}
			}
		}
	}

	const bufferTrigger = Math.floor(
		messageTokens *
			(obs?.bufferTokens && obs.bufferTokens > 0 ? obs.bufferTokens : 1 / 5),
	)
	if (pendingTokens < bufferTrigger) {
		return {
			activeObservations: existing,
			observedMessageIds: record?.observedMessageIds ?? [],
			kind: "none",
			blocked: false,
		}
	}

	if (typeof obs?.model === "undefined") {
		return {
			activeObservations: existing,
			observedMessageIds: record?.observedMessageIds ?? [],
			kind: "none",
			blocked: false,
		}
	}
	const model = resolveObservationModel(obs.model as any, args.requestContext)
	if (!model) {
		return {
			activeObservations: existing,
			observedMessageIds: record?.observedMessageIds ?? [],
			kind: "none",
			blocked: false,
		}
	}

	// Only messages not already folded into the log or compacted into history ranges are worth re-reading.
	const seen = new Set(record?.observedMessageIds ?? [])
	const folded =
		args.foldedMessageIds instanceof Set
			? args.foldedMessageIds
			: new Set(args.foldedMessageIds ?? [])
	const fresh = messages.filter(
		(m) => !m.id || (!seen.has(m.id) && !folded.has(m.id)),
	)
	if (fresh.length === 0) {
		return {
			activeObservations: existing,
			observedMessageIds: record?.observedMessageIds ?? [],
			kind: "none",
			blocked: false,
		}
	}

	const transcript = formatTranscript(fresh)
	const result = await model.generate({
		system: OBSERVER_SYSTEM_PROMPT,
		prompt: existing
			? `Existing observations:\n${existing}\n\nNew transcript:\n${transcript}`
			: `New transcript:\n${transcript}`,
		maxTokens: Math.max(256, Math.floor(messageTokens / 4)),
	})
	const observed = (result?.text || "").trim()
	if (!observed) {
		return {
			activeObservations: existing,
			observedMessageIds: record?.observedMessageIds ?? [],
			kind: "none",
			blocked: false,
		}
	}
	const activation = resolveBlockAfter(obs?.blockAfter, messageTokens, 2)
	const blocked = pendingTokens >= activation

	// `bufferActivation` caps how much one crossing may admit into the active
	// log. The remainder is *deferred*, not dropped: admitting the whole
	// observation at once would push recent turns out of the window, which is
	// precisely what observation is meant to prevent.
	//
	// Splitting happens on line boundaries only. Observations are bullet lists,
	// and a character-wise cut would sever a fact mid-sentence, leaving both
	// halves unusable.
	const existingBuffer = record?.bufferedObservations?.trim() || ""
	const queued = existingBuffer ? `${existingBuffer}\n${observed}` : observed
	const activationBudget =
		typeof obs?.bufferActivation === "number" && obs.bufferActivation > 0
			? Math.floor(obs.bufferActivation)
			: Infinity
	const { admitted, deferred } = splitByTokenBudget(
		queued,
		activationBudget,
		counter,
	)
	// When the budget admits nothing, `admitted` is empty and joining it onto the
	// existing log would leave a trailing blank line that the Observer then reads
	// back as content on the next pass.
	const combined = admitted
		? existing
			? `${existing}\n\n${admitted}`
			: admitted
		: existing

	return {
		activeObservations: combined,
		observedMessageIds: [
			...new Set([
				...(record?.observedMessageIds ?? []),
				...fresh.map((m) => m.id!).filter(Boolean),
			]),
		],
		// Messages stay "observed" once their text is in either the active log or
		// the buffer; deferring is a placement decision, not a reason to re-read
		// the same transcript on the next pass.
		bufferedObservations: deferred || null,
		bufferedObservationTokens: deferred ? counter.estimateTokens(deferred) : 0,
		kind: "observed",
		blocked,
	}
}

/**
 * Splits `text` into the longest prefix of whole lines that fits `budget`.
 *
 * Returns the remainder unchanged when even the first line exceeds the budget:
 * admitting nothing but deferring everything beats truncating the first fact.
 */
export function splitByTokenBudget(
	text: string,
	budget: number,
	counter: TokenCounter,
): { admitted: string; deferred: string } {
	const trimmed = text.trim()
	if (!trimmed) return { admitted: "", deferred: "" }
	if (!Number.isFinite(budget)) return { admitted: trimmed, deferred: "" }

	const lines = trimmed.split("\n")
	let admittedLines = 0
	let tokens = 0
	for (let i = 0; i < lines.length; i++) {
		const cost = counter.estimateTokens(lines[i])
		if (tokens + cost > budget) break
		tokens += cost
		admittedLines = i + 1
	}
	return {
		admitted: lines.slice(0, admittedLines).join("\n").trim(),
		deferred: lines.slice(admittedLines).join("\n").trim(),
	}
}

export const DEFAULT_MAX_OBSERVATIONAL_TOKENS = 4_000

/**
 * Wraps the observation log for injection into the system prompt.
 *
 * The wrapper states that the log is a summary, because a model told nothing
 * will treat a partially-remembered detail as ground truth and act on a stale
 * file path instead of re-reading it.
 *
 * Enforces an upper-bound token cap (default 4,000 tokens) to prevent
 * unbounded observation growth from blowing the model's context window.
 */
export function formatObservationalMemory(
	observations: string | null,
	maxTokens: number = DEFAULT_MAX_OBSERVATIONAL_TOKENS,
): string | null {
	const text = observations?.trim()
	if (!text) return null
	const header = `# Observational Memory\n\nThe following is a compacted record of earlier work in this session. It is a summary, not a verbatim transcript: re-read files before editing them rather than trusting a path or line number from memory.\n\n`
	const full = `${header}${text}`
	return truncateStringForTokenEstimate(full, maxTokens, false)
}
