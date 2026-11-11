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

	for (const [pattern, windowSize] of Object.entries(
		KNOWN_MODEL_CONTEXT_WINDOWS,
	)) {
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
