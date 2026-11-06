import type { LanguageModelMiddleware } from "ai"

export interface CacheControlOptions {
	type: "ephemeral"
	ttl?: "5m" | string
}

const DEFAULT_CACHE_CONTROL: CacheControlOptions = {
	type: "ephemeral",
}

/**
 * Attaches providerOptions for Anthropic and Google to enable prompt caching.
 */
export function addCacheControlToMessage(
	msg: any,
	cacheControl: CacheControlOptions = DEFAULT_CACHE_CONTROL,
): any {
	if (!msg) return msg

	// For messages with string content
	if (typeof msg.content === "string") {
		return {
			...msg,
			providerOptions: {
				...msg.providerOptions,
				anthropic: { ...msg.providerOptions?.anthropic, cacheControl },
				google: { ...msg.providerOptions?.google, cacheControl },
			},
		}
	}

	// For messages with array content, add to the last content part (required by Anthropic)
	if (Array.isArray(msg.content) && msg.content.length > 0) {
		const content = [...msg.content]
		const lastIdx = content.length - 1
		const lastPart = content[lastIdx]
		if (lastPart && typeof lastPart === "object") {
			content[lastIdx] = {
				...lastPart,
				providerOptions: {
					...lastPart.providerOptions,
					anthropic: { ...lastPart.providerOptions?.anthropic, cacheControl },
					google: { ...lastPart.providerOptions?.google, cacheControl },
				},
			}
		}
		return {
			...msg,
			content,
			providerOptions: {
				...msg.providerOptions,
				anthropic: { ...msg.providerOptions?.anthropic, cacheControl },
				google: { ...msg.providerOptions?.google, cacheControl },
			},
		}
	}

	return {
		...msg,
		providerOptions: {
			...msg.providerOptions,
			anthropic: { ...msg.providerOptions?.anthropic, cacheControl },
			google: { ...msg.providerOptions?.google, cacheControl },
		},
	}
}

/**
 * Places prompt cache breakpoints at strategic locations:
 * 1. Last system message (end of static instructions + tool definitions)
 * 2. Mid-history user turn (for long conversations >= 6 user turns)
 * 3. Second-to-last user turn (caches all completed history up to the current turn)
 *
 * Anthropic allows up to 4 cache breakpoints per request.
 * This guarantees that when a new turn starts, all previous turns hit the cache.
 */
export function applyPromptCacheBreakpoints(prompt: any[]): any[] {
	if (!Array.isArray(prompt) || prompt.length === 0) {
		return prompt
	}

	const updatedPrompt = [...prompt]

	// 1. Breakpoint 1: Find the last system message (caches static system prompt + tools)
	let lastSystemIdx = -1
	for (let i = updatedPrompt.length - 1; i >= 0; i--) {
		if ((updatedPrompt[i] as any)?.role === "system") {
			lastSystemIdx = i
			break
		}
	}

	if (lastSystemIdx >= 0) {
		updatedPrompt[lastSystemIdx] = addCacheControlToMessage(
			updatedPrompt[lastSystemIdx],
		)
	}

	// 2. Breakpoints on conversation history
	// Collect indices of all user messages following the system message
	const userIndices: number[] = []
	for (let i = Math.max(0, lastSystemIdx + 1); i < updatedPrompt.length; i++) {
		if ((updatedPrompt[i] as any)?.role === "user") {
			userIndices.push(i)
		}
	}

	// If there are at least 2 user messages:
	// The second-to-last user message anchors the previous completed turn.
	// That means everything from turn 1 to turn N-1 is 100% cached for turn N!
	if (userIndices.length >= 2) {
		const secondToLastUserIdx = userIndices[userIndices.length - 2]
		updatedPrompt[secondToLastUserIdx] = addCacheControlToMessage(
			updatedPrompt[secondToLastUserIdx],
		)

		// For long conversations (>= 6 user turns), add a mid-history breakpoint (~33% mark)
		if (userIndices.length >= 6) {
			const midIdx = userIndices[Math.floor(userIndices.length / 3)]
			if (midIdx !== secondToLastUserIdx) {
				updatedPrompt[midIdx] = addCacheControlToMessage(updatedPrompt[midIdx])
			}
		}
	}

	return updatedPrompt
}

/**
 * LanguageModelMiddleware that applies prompt cache breakpoints to requests.
 */
export const promptCacheMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	transformParams: async ({ params }) => {
		if (!Array.isArray(params.prompt)) {
			return params
		}
		const prompt = applyPromptCacheBreakpoints(params.prompt)
		return { ...params, prompt }
	},
}

/**
 * Deterministically sorts a tool map alphabetically by tool name.
 * This ensures that tool JSON schemas are serialized in an identical byte sequence across turns,
 * preventing tools ordering differences from busting provider prefix caches.
 */
export function sortToolsByName<T extends Record<string, any>>(tools: T): T {
	if (!tools || typeof tools !== "object") return tools
	const sorted: Record<string, any> = {}
	const keys = Object.keys(tools).sort()
	for (const key of keys) {
		sorted[key] = tools[key]
	}
	return sorted as T
}
