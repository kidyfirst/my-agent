/**
 * Thinking / reasoning-effort wiring.
 *
 * `thinkingLevel` is stored in harness state and toggled from the status bar, but
 * it only takes effect when it reaches the provider as a request option. Each
 * provider spells this differently, so the level is translated per provider and
 * injected as `providerOptions` on every call.
 */

import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh"

/** Providers whose thinking knob we know how to drive. */
export type ThinkingProvider = "deepseek" | "openai" | "anthropic"

/** OpenAI reasoning models accept these efforts verbatim. */
const OPENAI_EFFORT: Record<ThinkingLevel, string> = {
	off: "none",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "xhigh",
}
/**
 * DeepSeek accepts low/high/max and folds the rest: `minimal` and `low` both mean
 * "low", `medium`, `high` and `xhigh` all mean "high", `max` and `ultra` mean
 * "max". Thinking is on by default, so it is switched off via the `thinking`
 * request option rather than an effort level — `none` is not a valid
 * `reasoning_effort`.
 *
 * Source: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
 */
const DEEPSEEK_EFFORT: Record<Exclude<ThinkingLevel, "off">, string> = {
	low: "low",
	medium: "high",
	high: "high",
	xhigh: "high",
}

/** Anthropic has no effort levels, only a token budget (minimum is 1024). */
const ANTHROPIC_BUDGET: Record<Exclude<ThinkingLevel, "off">, number> = {
	low: 2048,
	medium: 8192,
	high: 16384,
	xhigh: 32000,
}

function normalizeLevel(level?: string): ThinkingLevel {
	const normalized = (level ?? "").toLowerCase()
	if (
		normalized === "low" ||
		normalized === "medium" ||
		normalized === "high" ||
		normalized === "xhigh"
	) {
		return normalized
	}
	return "off"
}

function thinkingProviderOptions(
	provider: ThinkingProvider,
	level: ThinkingLevel,
): Record<string, Record<string, unknown>> | null {
	if (provider === "anthropic") {
		if (level === "off") return null
		return {
			anthropic: {
				thinking: {
					type: "enabled",
					budgetTokens: ANTHROPIC_BUDGET[level],
				},
			},
		}
	}
	// OpenAI models disagree on whether "none" is a valid effort (it 400s on older
	// reasoning models), so "off" falls back to whatever the model defaults to.
	if (provider === "openai") {
		if (level === "off") return null
		return { openai: { reasoningEffort: OPENAI_EFFORT[level] } }
	}
	// DeepSeek has thinking on by default and expects it to be declared explicitly;
	// `off` disables it through that flag since `reasoning_effort` has no "none".
	// The key must be the provider name passed to createOpenAICompatible, which is
	// also where that provider looks up request-level options.
	if (level === "off") {
		return { deepseek: { thinking: { type: "disabled" } } }
	}
	return {
		deepseek: {
			reasoningEffort: DEEPSEEK_EFFORT[level],
			thinking: { type: "enabled" },
		},
	}
}
/**
 * DeepSeek rejects a follow-up request in a tool-call chain unless every assistant
 * message that carried a chain of thought sends its `reasoning_content` back. An
 * empty string is meaningful and must survive, but `createOpenAICompatible` drops
 * it behind a truthiness check — spreading it through the message's provider
 * metadata is the one path that keeps it.
 *
 * Source: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
 */
const REASONING_METADATA_KEY = "openaiCompatible"

/**
 * `createOpenAICompatible` reads message metadata from the camelCased provider
 * name, while request-level options (thinking, reasoningEffort) come from the raw
 * provider name. Both spellings are needed; this resolves the metadata half.
 */
function attachReasoningContent(prompt: unknown[]): void {
	for (const msg of prompt as any[]) {
		if (!Array.isArray(msg?.content)) continue
		const reasoning = msg.content
			.filter((part: any) => part?.type === "reasoning")
			.map((part: any) => (typeof part.text === "string" ? part.text : ""))
			.join("")
		if (!msg.content.some((part: any) => part?.type === "reasoning")) continue
		msg.providerOptions = {
			...(msg.providerOptions ?? {}),
			[REASONING_METADATA_KEY]: {
				...(msg.providerOptions?.[REASONING_METADATA_KEY] ?? {}),
				reasoning_content: reasoning,
			},
		}
	}
}

/**
 * `createOpenAICompatible` requires message content to be an array of parts and
 * throws on a bare string, which `coreMessages` still produces for plain text.
 */
function normalizeUserContent(prompt: unknown[]): void {
	for (const msg of prompt as any[]) {
		if (msg?.role === "user" && typeof msg.content === "string") {
			msg.content = [{ type: "text", text: msg.content }]
		}
	}
}

/**
 * Wraps a language model so every request carries the thinking options for the
 * given level. Returns the model untouched when the provider isn't supported or
 * the level is `off` on a provider that is thinking-off by default (Anthropic).
 */
export function withThinkingOptions<T>(
	model: T,
	provider: ThinkingProvider,
	level?: string,
): T {
	const options = thinkingProviderOptions(provider, normalizeLevel(level))
	// DeepSeek and OpenAI always need the wrapper (DeepSeek for reasoning_content
	// round-tripping and prompt shape, OpenAI for v3/v4 prompt compatibility).
	if (!options && provider !== "deepseek" && provider !== "openai") return model

	const middleware: LanguageModelMiddleware = {
		specificationVersion: "v3",
		transformParams: async ({ params }) => {
			if (Array.isArray(params.prompt)) {
				for (const msg of params.prompt) {
					if (Array.isArray(msg.content)) {
						for (const part of msg.content) {
							if (part.type === "file") {
								if (provider === "anthropic" && typeof part.data === "string") {
									;(part as any).data = { type: "data", data: part.data }
								} else if (
									provider !== "anthropic" &&
									typeof (part as any).data === "object" &&
									(part as any).data?.type === "data"
								) {
									;(part as any).data = (part as any).data.data
								}
							}
						}
					}
				}
				if (provider === "deepseek") {
					normalizeUserContent(params.prompt)
					attachReasoningContent(params.prompt)
				}
			}
			const existing = (params as any).providerOptions ?? {}
			const merged: Record<string, Record<string, unknown>> = { ...existing }
			for (const [name, values] of Object.entries(options ?? {})) {
				merged[name] = { ...(existing[name] ?? {}), ...values }
			}
			const next: any = { ...params, providerOptions: merged }
			// Anthropic rejects a non-default temperature while thinking is on.
			if (provider === "anthropic") delete next.temperature
			return next
		},
	}

	return wrapLanguageModel({ model: model as any, middleware }) as unknown as T
}
