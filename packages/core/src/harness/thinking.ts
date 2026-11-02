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
 * DeepSeek only accepts none/low/high/max: `none` turns thinking off (it is on by
 * default), `medium` means "high", `xhigh` means "max".
 */
const DEEPSEEK_EFFORT: Record<ThinkingLevel, string> = {
	off: "none",
	low: "low",
	medium: "high",
	high: "high",
	xhigh: "max",
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
	return { openai: { reasoningEffort: DEEPSEEK_EFFORT[level] } }
}

/**
 * DeepSeek streams its chain of thought in a `reasoning_content` field that the
 * OpenAI-compatible SDK schema strips. Recover it from the raw chunks so the
 * Thinking block in the transcript is actually populated.
 */
const REASONING_CONTENT = "reasoning_content"
const NON_CONTENT_CHUNKS = new Set([
	"raw",
	"stream-start",
	"response-metadata",
	"reasoning-start",
	"reasoning-delta",
	"reasoning-end",
])

function extractRawReasoning(stream: ReadableStream<any>): ReadableStream<any> {
	let reasoningId: string | null = null
	let reasoningEnded = false
	const endReasoning = (controller: TransformStreamDefaultController) => {
		if (!reasoningId || reasoningEnded) return
		reasoningEnded = true
		controller.enqueue({ type: "reasoning-end", id: reasoningId })
	}

	return stream.pipeThrough(
		new TransformStream({
			transform(chunk: any, controller) {
				if (chunk?.type === "raw") {
					const delta = chunk.rawValue?.choices?.[0]?.delta
					const text = delta?.[REASONING_CONTENT]
					if (typeof text === "string" && text.length > 0) {
						if (!reasoningId) {
							reasoningId = "reasoning-0"
							controller.enqueue({ type: "reasoning-start", id: reasoningId })
						}
						controller.enqueue({
							type: "reasoning-delta",
							id: reasoningId,
							delta: text,
						})
					}
					// Raw chunks are redundant once their reasoning is extracted.
					return
				}
				if (!NON_CONTENT_CHUNKS.has(chunk?.type)) endReasoning(controller)
				controller.enqueue(chunk)
			},
			flush(controller) {
				endReasoning(controller)
			},
		}),
	)
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
	// DeepSeek and OpenAI always need the wrapper (DeepSeek for reasoning stream, OpenAI for v3/v4 prompt compatibility).
	if (!options && provider !== "deepseek" && provider !== "openai") return model

	const middleware: LanguageModelMiddleware = {
		specificationVersion: "v3",
		transformParams: async ({ params }) => {
			if (Array.isArray(params.prompt)) {
				for (const msg of params.prompt) {
					if (Array.isArray(msg.content)) {
						for (const part of msg.content) {
							if (part.type === "file" && typeof part.data === "string") {
								;(part as any).data = { type: "data", data: part.data }
							}
						}
					}
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
			// Required to see the raw chunks that carry DeepSeek's reasoning text.
			if (provider === "deepseek") next.includeRawChunks = true
			return next
		},
		...(provider === "deepseek"
			? {
					wrapStream: async ({ doStream }: any) => {
						const result = await doStream()
						return { ...result, stream: extractRawReasoning(result.stream) }
					},
				}
			: {}),
	}

	return wrapLanguageModel({ model: model as any, middleware }) as unknown as T
}
