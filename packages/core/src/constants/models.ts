/**
 * Centralized Model Constants & Defaults
 * Single source of truth for default models, provider mappings, and curated catalogs.
 */

export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
	anthropic: "anthropic/claude-opus-5-5",
	"openai-codex": "openai/gpt-5.6-terra",
	google: "google/gemini-3.8-flash",
	deepseek: "deepseek/deepseek-flash",
}

export const DEFAULT_FALLBACK_MODEL_ID = "google/gemini-2.0-flash"

export interface CuratedModelInfo {
	id: string
	name: string
	provider: string
}

/**
 * Curated catalog holding the latest 2 generations of real official models for each provider.
 */
export const CURATED_CHAT_MODELS: CuratedModelInfo[] = [
	// Anthropic (latest 2 generations: Claude 3.7 & Claude 3.5)
	{
		id: "anthropic/claude-sonnet-5-5",
		name: "claude-sonnet-5-5",
		provider: "anthropic",
	},
	{
		id: "anthropic/claude-opus-5-5",
		name: "claude-opus-5-5",
		provider: "anthropic",
	},
	{
		id: "anthropic/claude-fable-5-1",
		name: "claude-fable-5-1",
		provider: "anthropic",
	},

	// OpenAI (latest 2 generations: o-series & GPT-4o)
	{
		id: "openai/gpt-6-sol",
		name: "gpt-6-sol",
		provider: "openai",
	},
	{
		id: "openai/gpt-5.6-terra",
		name: "gpt-5.6-terra",
		provider: "openai",
	},
	{
		id: "openai/gpt-5.6-sol",
		name: "gpt-5.6-sol",
		provider: "openai",
	},

	// Google (latest 2 generations: Gemini 2.x & Gemini 1.5)
	{
		id: "google/gemini-4-argon",
		name: "gemini-4-argon",
		provider: "google",
	},
	{
		id: "google/gemini-3.8-flash",
		name: "gemini-3.8-flash",
		provider: "google",
	},

	// DeepSeek (latest 2 generations: V4 Pro / Reasoner & Flash / Chat)
	{
		id: "deepseek/deepseek-v4-pro",
		name: "deepseek-v4-pro",
		provider: "deepseek",
	},
	{
		id: "deepseek/deepseek-flash",
		name: "deepseek-flash",
		provider: "deepseek",
	},
]

/**
 * Returns the default model for a given provider, if defined.
 */
export function getDefaultModelForProvider(
	providerId: string,
): string | undefined {
	return PROVIDER_DEFAULT_MODELS[providerId]
}

/**
 * Resolves the primary default model based on logged-in providers and order of priority.
 */
export function resolveDefaultModel(
	isLoggedIn: (provider: string) => boolean,
): string {
	const priority = ["anthropic", "openai-codex", "google", "deepseek"]
	for (const pid of priority) {
		if (isLoggedIn(pid)) {
			const model = PROVIDER_DEFAULT_MODELS[pid]
			if (model) return model
		}
	}
	return DEFAULT_FALLBACK_MODEL_ID
}

export interface ThinkingLevelOption {
	id: string
	label: string
	description?: string
}

/**
 * Supported thinking / reasoning effort levels per model provider.
 * Providers not listed here (e.g. Google, Groq, Mistral) do not support thinking level adjustments.
 */
export const PROVIDER_THINKING_LEVELS: Record<string, ThinkingLevelOption[]> = {
	anthropic: [
		{ id: "off", label: "Off", description: "Thinking disabled" },
		{ id: "low", label: "Low", description: "2k token budget" },
		{ id: "medium", label: "Med", description: "8k token budget" },
		{ id: "high", label: "High", description: "16k token budget" },
		{ id: "xhigh", label: "Max", description: "32k token budget" },
	],
	openai: [
		{ id: "off", label: "Off", description: "Thinking disabled" },
		{ id: "low", label: "Low", description: "Low reasoning effort" },
		{ id: "medium", label: "Med", description: "Medium reasoning effort" },
		{ id: "high", label: "High", description: "High reasoning effort" },
	],
	"openai-codex": [
		{ id: "off", label: "Off", description: "Thinking disabled" },
		{ id: "low", label: "Low", description: "Low reasoning effort" },
		{ id: "medium", label: "Med", description: "Medium reasoning effort" },
		{ id: "high", label: "High", description: "High reasoning effort" },
	],
	deepseek: [
		{ id: "off", label: "Off", description: "Thinking disabled" },
		{ id: "low", label: "Low", description: "Low reasoning effort" },
		{ id: "medium", label: "Med", description: "High reasoning effort" },
		{ id: "high", label: "High", description: "High reasoning effort" },
		{ id: "xhigh", label: "Max", description: "Maximum reasoning effort" },
	],
}

/**
 * Resolves the configured thinking levels for a provider or model ID.
 * Returns null if the provider does not support thinking levels.
 */
export function getProviderThinkingLevels(
	providerOrModelId?: string | null,
): ThinkingLevelOption[] | null {
	if (!providerOrModelId) return null
	const lower = providerOrModelId.toLowerCase().trim()
	let provider = lower.includes("/") ? lower.split("/")[0] : lower
	if (provider === "claude" || provider.startsWith("claude-")) {
		provider = "anthropic"
	}
	if (
		provider === "gpt" ||
		provider.startsWith("gpt-") ||
		provider === "o1" ||
		provider === "o3" ||
		provider.startsWith("o3-") ||
		provider.startsWith("o1-")
	) {
		provider = "openai"
	}
	if (provider === "gemini" || provider.startsWith("gemini-")) {
		provider = "google"
	}
	if (provider.startsWith("deepseek")) {
		provider = "deepseek"
	}
	return PROVIDER_THINKING_LEVELS[provider] ?? null
}
