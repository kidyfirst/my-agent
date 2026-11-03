import type {
	AssistantStreamRecord,
	RecordedRuntime,
	ReplayEntry,
	ReplayScript,
	ReplayToolResult,
	SessionEvent,
} from "./types.js"
import { buildMessageParts } from "../graph/llm-stream.js"

export function expandAssistantStream(records: AssistantStreamRecord[]): any[] {
	const chunks: any[] = []
	let hasFinish = false

	for (const rec of records) {
		if (rec.type === "text-chunks") {
			for (const text of rec.texts) {
				chunks.push({
					type: "text-delta",
					textDelta: text,
					delta: text,
				})
			}
		} else if (rec.type === "reasoning-chunks") {
			for (const text of rec.texts) {
				chunks.push({
					type: "reasoning",
					textDelta: text,
					delta: text,
				})
			}
		} else if (rec.type === "tool-call-chunks") {
			for (let i = 0; i < rec.ids.length; i++) {
				let parsedArgs: any = {}
				try {
					parsedArgs = JSON.parse(rec.args[i] || "{}")
				} catch {
					parsedArgs = rec.args[i]
				}
				chunks.push({
					type: "tool-call",
					toolCallId: rec.ids[i],
					toolName: rec.names[i],
					args: parsedArgs,
				})
			}
		} else if (rec.type === "chunk") {
			const c = rec.chunk as any
			if (c && (c.type === "finish" || c.finishReason)) {
				hasFinish = true
			}
			chunks.push(c)
		}
	}

	if (!hasFinish) {
		chunks.push({
			type: "finish",
			finishReason: "stop",
			usage: {
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
			},
		})
	}

	return chunks
}

export function deriveReplayScript(jsonlContent: string): ReplayScript {
	const trimmed = jsonlContent.trim()
	const events: SessionEvent[] = []

	if (trimmed.startsWith("[")) {
		try {
			const parsed = JSON.parse(trimmed)
			if (Array.isArray(parsed)) {
				events.push(...parsed)
			}
		} catch (err) {
			throw new Error(
				`Failed to parse JSON recording: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	} else {
		const lines = trimmed
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const rawLine = lines[lineIndex]
			try {
				events.push(JSON.parse(rawLine))
			} catch (err) {
				throw new Error(
					`Failed to parse JSONL line ${lineIndex + 1}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
	}

	let session: ReplayScript["session"]
	let systemPrompt: string | undefined
	let tools: ReplayScript["tools"]
	let stepLimit: number | undefined
	let runtime: RecordedRuntime | undefined
	const entries: ReplayEntry[] = []

	let currentRunId = "default-run"
	let currentThreadId = "default-thread"
	let pendingToolResults: ReplayToolResult[] = []

	for (let i = 0; i < events.length; i++) {
		const event = events[i]

		if (event.type === "session") {
			session = {
				version: event.version,
				id: event.id,
				createdAt: event.createdAt,
				cwd: event.cwd,
				model: event.model,
				recording: event.recording,
				runtime: event.runtime,
			}
		} else if (event.type === "run/start") {
			currentRunId = event.data.runId
			currentThreadId = event.data.threadId
			systemPrompt = event.data.systemPrompt
			tools = event.data.tools
			stepLimit = event.data.stepLimit
			// Per-run wins over the file header: the user may have switched model
			// or mode between runs of the same thread.
			if (event.data.runtime) runtime = event.data.runtime
		} else if (event.type === "tool/result") {
			pendingToolResults.push({
				turn: event.data.turn,
				step: event.data.step,
				toolCallId: event.data.toolCallId,
				toolName: event.data.toolName,
				input: event.data.input,
				output: event.data.output,
				isError: event.data.isError,
			})
		} else if (event.type === "assistant/stream") {
			const stream = event.data.stream
			// Validate stream has valid chunks
			if (!stream || !Array.isArray(stream)) {
				throw new Error(
					`Invalid assistant/stream at event ${i + 1}: stream array missing.`,
				)
			}

			// Validate finish per §5.1:
			const hasFinishChunk = stream.some(
				(r) =>
					r.type === "chunk" &&
					((r.chunk as any)?.type === "finish" ||
						Boolean((r.chunk as any)?.finishReason)),
			)
			if (!hasFinishChunk && !event.data.finishReason) {
				throw new Error(
					`Replay validation error at event ${i + 1}: assistant/stream missing finish chunk or finishReason. Use replay.override.json to supply missing termination.`,
				)
			}

			entries.push({
				runId: currentRunId,
				threadId: currentThreadId,
				turn: event.data.turn,
				step: event.data.step,
				streamRecords: stream,
				finishReason: event.data.finishReason,
				toolResults: [...pendingToolResults],
			})
			pendingToolResults = []
		}
	}

	return {
		session,
		systemPrompt,
		tools,
		stepLimit,
		runtime: runtime ?? session?.runtime,
		entries,
	}
}

export interface ReplayModelOptions {
	speed?: "instant" | "realtime"
	/**
	 * What to do when the cursor runs past the last entry. `"error"` (default)
	 * keeps the strict "one recording = one playback" contract; `"wrap"` starts
	 * the recording over so the same file can drive more than one run.
	 */
	onExhausted?: "error" | "wrap"
}

export interface ReplayLanguageModel {
	specificationVersion: "v3"
	modelId: string
	provider: string
	doStream: (callOptions?: any) => Promise<{ stream: ReadableStream<any> }>
	assertConsumed: () => void
	getConsumedCount: () => number
	getTotalCount: () => number
	/** Rewind to the first entry so the same recording can play again. */
	reset: () => void
}

export function createReplayModel(
	scriptOrEntries: ReplayScript | ReplayEntry[],
	options: ReplayModelOptions = {},
): ReplayLanguageModel {
	const entries = Array.isArray(scriptOrEntries)
		? scriptOrEntries
		: scriptOrEntries.entries

	let cursor = 0

	const model: ReplayLanguageModel = {
		specificationVersion: "v3",
		modelId: "replay-offline-model",
		provider: "replay",
		async doStream() {
			if (entries.length === 0) {
				throw new Error("Replay script is empty: the recording has no steps.")
			}
			if (cursor >= entries.length) {
				if (options.onExhausted !== "wrap") {
					throw new Error(
						`Replay script exhausted: attempted step ${cursor + 1}, but only ${entries.length} entries exist in recording.`,
					)
				}
				// Playing the same file again must work: a replayed recording is a
				// loop, not a single-use ticket.
				cursor = 0
			}
			const entry = entries[cursor++]
			const chunks = expandAssistantStream(entry.streamRecords)

			const stream = new ReadableStream({
				async start(controller) {
					for (const chunk of chunks) {
						if (options.speed === "realtime" && chunk.type === "text-delta") {
							await new Promise((r) => setTimeout(r, 10))
						}
						controller.enqueue(chunk)
					}
					controller.close()
				},
			})

			return { stream }
		},
		assertConsumed() {
			if (cursor < entries.length) {
				throw new Error(
					`Replay script not fully consumed: expected ${entries.length} steps, but only consumed ${cursor}.`,
				)
			}
		},
		getConsumedCount() {
			return cursor
		},
		getTotalCount() {
			return entries.length
		},
		reset() {
			cursor = 0
		},
	}

	return model
}

/**
 * Creates isolated tools for replay mode, protecting real workspaces from side-effects.
 * - `execute_command`: does not execute command, returns recorded tool output.
 * - Write tools (`write_file`, `string_replace_lsp`): virtualized / skipped.
 */
export function createReplayTools(
	tools: Record<string, any>,
	toolResults: ReplayToolResult[],
): Record<string, any> {
	const isolated: Record<string, any> = {}

	for (const [name, tool] of Object.entries(tools)) {
		if (name === "execute_command") {
			isolated[name] = {
				...tool,
				execute: async (args: any) => {
					const matched =
						toolResults.find(
							(r) =>
								r.toolName === "execute_command" &&
								typeof args?.command === "string" &&
								typeof (r.input as any)?.command === "string" &&
								args.command.trim() === (r.input as any).command.trim(),
						) || toolResults.find((r) => r.toolName === "execute_command")

					if (matched) {
						return matched.output
					}
					return {
						stdout:
							"[REPLAY] Simulated command execution (output not found in recording)",
						stderr: "",
						exitCode: 0,
					}
				},
			}
		} else if (name === "write_file" || name === "string_replace_lsp") {
			isolated[name] = {
				...tool,
				execute: async () => {
					return {
						success: true,
						message: `[REPLAY] Write tool '${name}' isolated; disk unchanged.`,
					}
				},
			}
		} else {
			isolated[name] = tool
		}
	}

	return isolated
}

/**
 * The per-playback id suffix, e.g. `pbmg2k1` in
 * `replay-assistant-<runId>-0-pbmg2k1`. Rows written before playbacks carried
 * a suffix return null, so callers can treat them as one legacy batch.
 */
export function replayPlaybackKey(
	id: string | null | undefined,
): string | null {
	if (typeof id !== "string") return null
	const match = /^replay-(?:user|assistant)-.+-pb([a-z0-9]+)$/.exec(id)
	return match ? match[1] : null
}

/**
 * Reconstructs standard conversation messages (user input, assistant thinking, tool calls,
 * tool results, and final assistant response) from session recording JSON or JSONL content.
 *
 * `startAt` overrides the recording's own timestamps so the reconstructed block lands at
 * the end of a thread that already has real messages, instead of interleaving with them.
 *
 * `playbackId` gives the reconstructed rows fresh ids. The message id is the only durable
 * provenance marker (there is no metadata column), so without a per-playback id a second
 * replay of the same file writes byte-identical rows with identical ids — an upsert that
 * changes nothing, which looks exactly like "this recording cannot be replayed".
 */
export function reconstructMessagesFromRecording(
	jsonOrJsonlContent: string,
	targetThreadId: string,
	resourceId = "default",
	startAt?: number,
	options: { playbackId?: string } = {},
): any[] {
	const trimmed = jsonOrJsonlContent.trim()
	const events: any[] = []

	if (trimmed.startsWith("[")) {
		try {
			const parsed = JSON.parse(trimmed)
			if (Array.isArray(parsed)) {
				events.push(...parsed)
			}
		} catch (err) {
			throw new Error(
				`Failed to parse JSON recording: ${err instanceof Error ? err.message : String(err)}`,
			)
		}
	} else {
		const lines = trimmed
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			try {
				events.push(JSON.parse(lines[lineIndex]))
			} catch (err) {
				console.warn(
					`Skipping invalid JSONL line ${lineIndex + 1}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
	}

	if (events.length === 0) return []

	let sessionCreatedAt = Date.now()
	if (typeof startAt === "number" && Number.isFinite(startAt)) {
		sessionCreatedAt = startAt
	} else {
		const sessionEv = events.find((e) => e.type === "session")
		if (sessionEv && sessionEv.createdAt) {
			sessionCreatedAt = sessionEv.createdAt
		}
	}

	interface RunGroup {
		runId: string
		userPrompt?: string
		streamRecords: AssistantStreamRecord[]
		toolResults: Array<{
			toolCallId: string
			toolName: string
			input: unknown
			output: unknown
			isError: boolean
		}>
	}

	const runs: RunGroup[] = []
	let currentRun: RunGroup | null = null

	for (const ev of events) {
		if (ev.type === "run/start") {
			currentRun = {
				runId: ev.data?.runId || `run-${runs.length + 1}`,
				userPrompt: ev.data?.userPrompt,
				streamRecords: [],
				toolResults: [],
			}
			runs.push(currentRun)
		} else if (ev.type === "assistant/stream") {
			if (!currentRun) {
				currentRun = {
					runId: `run-${runs.length + 1}`,
					streamRecords: [],
					toolResults: [],
				}
				runs.push(currentRun)
			}
			if (Array.isArray(ev.data?.stream)) {
				currentRun.streamRecords.push(...ev.data.stream)
			}
		} else if (ev.type === "tool/result") {
			if (!currentRun) {
				currentRun = {
					runId: `run-${runs.length + 1}`,
					streamRecords: [],
					toolResults: [],
				}
				runs.push(currentRun)
			}
			currentRun.toolResults.push({
				toolCallId: ev.data?.toolCallId || "",
				toolName: ev.data?.toolName || "",
				input: ev.data?.input,
				output: ev.data?.output,
				isError: Boolean(ev.data?.isError),
			})
		}
	}

	const messages: any[] = []
	// Normalised so `replayPlaybackKey` can recognise the suffix regardless of
	// whether the caller already prefixed it.
	const rawPlaybackId = options.playbackId?.trim()
	const playbackSuffix = rawPlaybackId
		? `-${rawPlaybackId.startsWith("pb") ? rawPlaybackId : `pb${rawPlaybackId}`}`
		: ""

	for (let i = 0; i < runs.length; i++) {
		const run = runs[i]
		const promptText = (run.userPrompt ?? "").trim()

		// 1. User message — only when the recording actually captured it. Older
		// files have no `userPrompt`, and inventing a placeholder question makes
		// the replay look like the user typed something they never did.
		if (promptText) {
			messages.push({
				id: `replay-user-${run.runId}-${i}${playbackSuffix}`,
				role: "user",
				type: "user",
				content: {
					format: 2,
					parts: [{ type: "text", text: promptText }],
					content: promptText,
				},
				threadId: targetThreadId,
				resourceId,
				createdAt: new Date(sessionCreatedAt + i * 2000),
			})
		}

		// 2. Assistant message
		let assistantText = ""
		let reasoningText = ""
		const executedTools: Array<{
			id: string
			name: string
			args: any
			result?: any
			isError?: boolean
		}> = []

		for (const rec of run.streamRecords) {
			if (rec.type === "text-chunks") {
				assistantText += rec.texts.join("")
			} else if (rec.type === "reasoning-chunks") {
				reasoningText += rec.texts.join("")
			} else if (rec.type === "tool-call-chunks") {
				for (let k = 0; k < rec.ids.length; k++) {
					const id = rec.ids[k]
					const name = rec.names[k]
					let parsedArgs: any = {}
					try {
						parsedArgs =
							typeof rec.args[k] === "string"
								? JSON.parse(rec.args[k] || "{}")
								: rec.args[k]
					} catch {
						parsedArgs = rec.args[k]
					}
					const existing = executedTools.find((t) => t.id === id)
					if (!existing) {
						executedTools.push({ id, name, args: parsedArgs })
					}
				}
			} else if (rec.type === "chunk") {
				const c = rec.chunk as any
				if (c?.type === "text-delta") {
					// AI SDK v6 names the field `delta`; older recordings used
					// `textDelta`, and some carry `text`.
					assistantText += c.delta ?? c.textDelta ?? c.text ?? ""
				} else if (c?.type === "reasoning") {
					reasoningText += c.delta ?? c.textDelta ?? c.text ?? ""
				} else if (c?.type === "tool-call") {
					const existing = executedTools.find((t) => t.id === c.toolCallId)
					if (!existing) {
						executedTools.push({
							id: c.toolCallId,
							name: c.toolName,
							args: c.args,
						})
					}
				}
			}
		}

		for (const tr of run.toolResults) {
			const existing = executedTools.find((t) => t.id === tr.toolCallId)
			if (existing) {
				existing.result = tr.output
				existing.isError = tr.isError
			} else {
				executedTools.push({
					id: tr.toolCallId,
					name: tr.toolName,
					args: tr.input,
					result: tr.output,
					isError: tr.isError,
				})
			}
		}

		const { parts, cleanText, activeThinking } = buildMessageParts(
			assistantText,
			reasoningText,
			executedTools,
		)

		const assistantMsg = {
			id: `replay-assistant-${run.runId}-${i}${playbackSuffix}`,
			role: "assistant",
			type: "assistant",
			content: {
				format: 2,
				parts:
					parts.length > 0
						? parts
						: cleanText
							? [{ type: "text", text: cleanText }]
							: [],
				content: cleanText,
				reasoning: activeThinking || undefined,
			},
			threadId: targetThreadId,
			resourceId,
			createdAt: new Date(sessionCreatedAt + i * 2000 + 1000),
			durationMs: 1500,
		}
		messages.push(assistantMsg)
	}

	return messages
}
