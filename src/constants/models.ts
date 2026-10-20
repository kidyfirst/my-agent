/**
 * Centralized Model Constants & Defaults
 * Single source of truth for default models, provider mappings, and curated catalogs.
 */

export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
	anthropic: "anthropic/claude-opus-4-6",
	"openai-codex": "openai/gpt-5.3-codex",
	google: "google/gemini-3-flash-preview",
}

export const DEFAULT_FALLBACK_MODEL_ID = "google/gemini-3-flash-preview"

export interface CuratedModelInfo {
	id: string
	name: string
	provider: string
}

export const CURATED_CHAT_MODELS: CuratedModelInfo[] = [
	{
		id: "anthropic/claude-opus-4-6",
		name: "claude-opus-4-6",
		provider: "anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		name: "claude-sonnet-4-6",
		provider: "anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		name: "claude-haiku-4-5",
		provider: "anthropic",
	},
	{ id: "openai/gpt-5.2-codex", name: "gpt-5.2-codex", provider: "openai" },
	{ id: "openai/gpt-5.3-codex", name: "gpt-5.3-codex", provider: "openai" },
	{ id: "openai/o3", name: "o3", provider: "openai" },
	{
		id: "google/gemini-3-flash-preview",
		name: "gemini-3-flash-preview",
		provider: "google",
	},
	{
		id: "google/gemini-3.5-flash",
		name: "gemini-3.5-flash",
		provider: "google",
	},
	{
		id: "google/gemini-3.8-flash",
		name: "gemini-3.8-flash",
		provider: "google",
	},
	{
		id: "google/gemini-3.1-pro-preview",
		name: "gemini-3.1-pro-preview",
		provider: "google",
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
	const priority = ["anthropic", "openai-codex", "google"]
	for (const pid of priority) {
		if (isLoggedIn(pid)) {
			const model = PROVIDER_DEFAULT_MODELS[pid]
			if (model) return model
		}
	}
	return DEFAULT_FALLBACK_MODEL_ID
}

/**
 * Checks if a model ID is deprecated by its provider.
 */
export function isDeprecatedModel(modelId: string): boolean {
	const id = modelId.toLowerCase()
	return (
		id === "google/gemini-2.5-flash" ||
		id === "google/gemini-2.5-pro" ||
		id.includes("gemini-1.0")
	)
}

/**
 * Automatically upgrades deprecated model IDs to modern supported alternatives.
 */
export function upgradeDeprecatedModel(modelId: string): string {
	if (
		modelId === "google/gemini-2.5-flash" ||
		modelId === "google/gemini-2.5-pro"
	) {
		return "google/gemini-3-flash-preview"
	}
	return modelId
}
