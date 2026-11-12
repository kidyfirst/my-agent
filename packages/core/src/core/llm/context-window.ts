/**
 * Model Context Window Resolver & Token Budget Manager
 *
 * Dynamically determines model context windows, computes safe working history
 * token budgets (leaving sufficient headroom for system prompts, tools schema,
 * and generation tokens), and calibrates character-based token estimates
 * using real LanguageModelUsage feedback from model providers.
 */

export const KNOWN_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
	// Anthropic Claude (200k tokens for 3.x, 100k for legacy 2.x)
	"claude-3-7": 200_000,
	"claude-3-5": 200_000,
	"claude-3": 200_000,
	"claude-sonnet": 200_000,
	"claude-opus": 200_000,
	"claude-haiku": 200_000,
	"claude-fable": 200_000,
	"claude-2": 100_000,

	// OpenAI (128k for modern gpt-4o, o1, o3, gpt-5, gpt-6)
	"gpt-4o": 128_000,
	"gpt-4-turbo": 128_000,
	o1: 128_000,
	o3: 128_000,
	o4: 128_000,
	"gpt-5": 128_000,
	"gpt-6": 128_000,
	"gpt-4-32k": 32_768,
	"gpt-4": 8_192,
	"gpt-3.5-turbo-16k": 16_384,
	"gpt-3.5-turbo": 4_096,

	// Google Gemini (1M+ tokens standard)
	"gemini-1.5": 1_000_000,
	"gemini-2.0": 1_000_000,
	"gemini-2.5": 1_000_000,
	"gemini-3": 1_000_000,
	"gemini-4": 1_000_000,

	// DeepSeek (64k or 128k, official standard is 64k)
	deepseek: 64_000,

	// Qwen / Alibaba
	"qwen-2.5-coder-32b": 128_000,
	"qwen-turbo": 128_000,
	"qwen-plus": 128_000,
	"qwen-max": 128_000,
	qwen: 32_768,

	// Meta Llama
	"llama-3.1": 128_000,
	"llama-3.2": 128_000,
	"llama-3.3": 128_000,
	"llama-3": 8_192,

	// Mistral
	"mistral-large": 128_000,
	codestral: 128_000,
	mistral: 32_768,
}

export const DEFAULT_FALLBACK_CONTEXT_WINDOW = 64_000

/**
 * Resolves the effective context window for a given model or model identifier.
 */
export function resolveModelContextWindow(
	model?: any,
	modelIdStr?: string,
	customContextWindow?: number,
): number {
	if (customContextWindow && customContextWindow > 0) {
		return customContextWindow
	}
	if (
		model?.contextWindow &&
		typeof model.contextWindow === "number" &&
		model.contextWindow > 0
	) {
		return model.contextWindow
	}
	if (
		model?.settings?.contextWindow &&
		typeof model.settings.contextWindow === "number"
	) {
		return model.settings.contextWindow
	}

	const normalizedId = String(
		modelIdStr || model?.modelId || model?.id || "",
	).toLowerCase()

	if (!normalizedId) {
		return DEFAULT_FALLBACK_CONTEXT_WINDOW
	}

	// Sort patterns by length descending so more specific patterns (e.g. 'qwen-2.5-coder-32b', 'gpt-4-32k')
	// are always evaluated before shorter generic fallback prefixes (e.g. 'qwen', 'gpt-4').
	const sortedPatterns = Object.entries(KNOWN_MODEL_CONTEXT_WINDOWS).sort(
		([a], [b]) => b.length - a.length,
	)

	for (const [pattern, windowSize] of sortedPatterns) {
		if (normalizedId.includes(pattern)) {
			return windowSize
		}
	}

	return DEFAULT_FALLBACK_CONTEXT_WINDOW
}

/**
 * Computes the safe working history token budget based on model context window.
 * Leaves sufficient headroom for system prompt, tool definitions, and model generation/thinking tokens.
 */
export function computeMaxHistoryTokens(contextWindow: number): number {
	// Tiny models (<= 16k): reserve ~35% for system + outputs
	if (contextWindow <= 16_384) {
		return Math.max(2_000, Math.floor(contextWindow * 0.65))
	}
	// Small models (32k): 32k * 0.72 ≈ 23.5k (reserves ~8.5k)
	if (contextWindow <= 32_768) {
		return Math.floor(contextWindow * 0.72)
	}
	// Medium models (64k): 64k * 0.75 = 48k (reserves 16k for system + generation)
	if (contextWindow <= 65_536) {
		return Math.floor(contextWindow * 0.75)
	}
	// Large models (128k ~ 200k): e.g. 128k -> ~102k, 200k -> 160k
	if (contextWindow <= 200_000) {
		return Math.floor(contextWindow * 0.8)
	}
	// Ultra-large models (1M+ like Gemini):
	// Cap active working history budget at 256,000 tokens to prevent excessive latency,
	// memory bloat, and serialization cost during local turn processing.
	return Math.min(Math.floor(contextWindow * 0.8), 256_000)
}

/**
 * Accurately estimates token overhead of executable tool JSON schemas.
 */
export function estimateToolsSchemaTokens(tools?: Record<string, any>): number {
	if (!tools || Object.keys(tools).length === 0) return 0
	let totalChars = 0
	for (const [name, t] of Object.entries(tools)) {
		totalChars += name.length + (t?.description?.length || 0)
		const schema = t?.parameters || t?.inputSchema
		if (schema) {
			try {
				totalChars += JSON.stringify(schema).length
			} catch {}
		}
	}
	return Math.ceil(totalChars / 3.8)
}

const NON_ASCII_RE = /[^\x00-\x7f]/

/**
 * Fixed-ratio text token estimator.
 *
 * A flat `length / 4` assumes ~4 characters per token, which only holds for
 * ASCII prose. BPE vocabularies encode CJK at roughly 1.3 characters per token,
 * so a flat /4 underestimates Chinese by ~3x and can let a session blow past the
 * model's real context window before folding ever triggers.
 *
 * This walks code points once (same cost class as `length / 4`, no BPE lookup)
 * and weights ASCII and non-ASCII separately. Rounding is left to the caller so
 * that many small fragments don't each round up and accumulate bias.
 */
export function estimateTextTokens(text: string): number {
	if (!text) return 0
	// 纯 ASCII: every code unit is < 128, so the weighted result collapses to
	// length / 4. A regex scan is far cheaper than a per-character JS loop.
	if (!NON_ASCII_RE.test(text)) return text.length / 4

	let asciiChars = 0
	let nonAsciiChars = 0
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code < 128) {
			asciiChars++
		} else {
			// Count a surrogate pair as one code point. Lone surrogates are
			// still counted once, which is fine for an estimate.
			if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
				const next = text.charCodeAt(i + 1)
				if (next >= 0xdc00 && next <= 0xdfff) i++
			}
			nonAsciiChars++
		}
	}
	return asciiChars / 4 + nonAsciiChars / 1.3
}

/**
 * Structural message token estimator that properly accounts for vision tokens
 * without letting massive base64 image strings inflate token counts to hundreds of thousands.
 */
export function estimateMessageTokens(msg: any): number {
	if (!msg) return 0
	if (typeof msg.content === "string") {
		return Math.ceil(estimateTextTokens(msg.content))
	}
	if (!Array.isArray(msg.content)) {
		return Math.ceil(estimateTextTokens(JSON.stringify(msg.content || "")))
	}

	let tokens = 0
	for (const part of msg.content) {
		if (!part) continue
		if (part.type === "text" && typeof part.text === "string") {
			tokens += estimateTextTokens(part.text)
		} else if (part.type === "image") {
			// Standard vision token cost: ~1200 tokens per image
			// (prevents raw base64 payloads from inflating token counts by hundreds of thousands)
			tokens += 1_200
		} else if (part.type === "tool-call") {
			const inputStr = JSON.stringify(part.args || part.input || {})
			tokens += estimateTextTokens(`${part.toolName || ""}${inputStr}`)
		} else if (part.type === "tool-result") {
			const res = part.output !== undefined ? part.output : part.result
			const resStr = typeof res === "string" ? res : JSON.stringify(res || "")
			tokens += estimateTextTokens(resStr)
		} else {
			// Strip large base64/data payloads before stringifying arbitrary parts
			const clone = { ...part }
			if (clone.image) delete clone.image
			if (
				clone.data &&
				typeof clone.data === "string" &&
				clone.data.length > 500
			) {
				delete clone.data
			}
			tokens += estimateTextTokens(JSON.stringify(clone))
		}
	}
	return Math.ceil(tokens)
}

/**
 * Computes individual token counts and total tokens across an array of messages.
 */
export function estimateMessagesTokens(messages: any[]): {
	tokensByMessage: number[]
	totalTokens: number
} {
	let total = 0
	const tokensByMessage = messages.map((m) => {
		const t = estimateMessageTokens(m)
		total += t
		return t
	})
	return { tokensByMessage, totalTokens: total }
}
