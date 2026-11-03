// Model pricing per million tokens (approximate)
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
	{
		"anthropic/claude-opus-4-6": { input: 15, output: 75 },
		"anthropic/claude-4.6": { input: 3, output: 15 },
		"anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
		"anthropic/claude-haiku-4-5": { input: 0.8, output: 4 },
		"openai/gpt-5.7-codex": { input: 2.5, output: 10 },
		"openai/gpt-5.6-terra": { input: 2, output: 8 },
		"openai/gpt-5.3-codex": { input: 1.5, output: 6 },
		"openai/gpt-5.2-codex": { input: 2, output: 8 },
		"openai/o3": { input: 10, output: 40 },
		"google/gemini-3.9-flash": { input: 0.15, output: 0.6 },
		"google/gemini-3.8-flash": { input: 0.15, output: 0.6 },
		"google/gemini-3.5-flash": { input: 0.15, output: 0.6 },
		"google/gemini-3-flash-preview": { input: 0.15, output: 0.6 },
		"deepseek/deepseek-flash": { input: 0.14, output: 0.28 },
		"deepseek/deepseek-v4-pro": { input: 0.55, output: 2.19 },
		"deepseek/deepseek-v3.5": { input: 0.14, output: 0.28 },

		// Modern official models
		"anthropic/claude-3-7-sonnet-latest": { input: 3, output: 15 },
		"anthropic/claude-3-5-sonnet-latest": { input: 3, output: 15 },
		"anthropic/claude-3-5-haiku-latest": { input: 0.8, output: 4 },
		"anthropic/claude-3-7-sonnet": { input: 3, output: 15 },
		"anthropic/claude-3-5-sonnet": { input: 3, output: 15 },
		"anthropic/claude-3-5-haiku": { input: 0.8, output: 4 },
		"openai/o3-mini": { input: 1.1, output: 4.4 },
		"openai/o1": { input: 15, output: 60 },
		"openai/gpt-4o": { input: 2.5, output: 10 },
		"openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
		"google/gemini-2.0-flash": { input: 0.1, output: 0.4 },
		"google/gemini-2.5-pro": { input: 1.25, output: 5 },
		"google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
		"google/gemini-1.5-pro": { input: 1.25, output: 5 },
		"google/gemini-1.5-flash": { input: 0.075, output: 0.3 },
		"deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
		"deepseek/deepseek-reasoner": { input: 0.55, output: 2.19 },
	}

export function estimateTokenCost(
	modelId: string | null,
	promptTokens: number,
	completionTokens: number,
): number {
	if (!modelId) return 0
	const pricing = MODEL_PRICING[modelId]
	if (!pricing) return 0
	return (
		(promptTokens / 1_000_000) * pricing.input +
		(completionTokens / 1_000_000) * pricing.output
	)
}
