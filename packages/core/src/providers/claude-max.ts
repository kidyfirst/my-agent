/**
 * Claude Max OAuth Provider
 *
 * Uses OAuth tokens from AuthStorage to authenticate with Claude Max plan.
 * The OAuth endpoint requires a specific system message to be present.
 */

import { createAnthropic } from "@ai-sdk/anthropic"
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import type { MyAgentModelConfig } from "../core/index.js"
import { AuthStorage } from "../auth/storage.js"
import { promptCacheMiddleware } from "../core/llm/prompt-cache.js"

// Required for Claude Max plan OAuth - the endpoint checks for this system message
const claudeCodeIdentity =
	"You are Claude Code, Anthropic's official CLI for Claude."

// Singleton auth storage instance
let authStorageInstance: AuthStorage | null = null

/**
 * Get or create the shared AuthStorage instance
 */
function getAuthStorage(): AuthStorage {
	if (!authStorageInstance) {
		authStorageInstance = new AuthStorage()
	}
	return authStorageInstance
}

/**
 * Set a custom AuthStorage instance (useful for TUI integration)
 */
export function setAuthStorage(storage: AuthStorage): void {
	authStorageInstance = storage
}

/**
 * Middleware that injects the Claude Code identity system message
 * Required for Claude Max OAuth authentication
 */
const claudeCodeMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	transformParams: async ({ params }) => {
		// Prepend the Claude Code identity as the first system message
		const systemMessage = {
			role: "system" as const,
			content: claudeCodeIdentity,
		}

		if (params.temperature) {
			delete params.topP
		}

		return {
			...params,
			prompt: [systemMessage, ...params.prompt],
		}
	},
}

/**
 * Creates an Anthropic model using Claude Max OAuth authentication
 * Uses OAuth tokens from AuthStorage (auto-refreshes when needed)
 */
export function opencodeClaudeMaxProvider(
	modelId: string = "claude-sonnet-4-20250514",
): MyAgentModelConfig {
	// Test environment: use API key
	if (process.env.NODE_ENV === "test" || process.env.VITEST) {
		const anthropic = createAnthropic({
			apiKey: process.env.ANTHROPIC_API_KEY || "test-api-key",
		})
		return wrapLanguageModel({
			model: anthropic(modelId) as any,
			middleware: [claudeCodeMiddleware, promptCacheMiddleware],
		})
	}

	// Custom fetch that handles OAuth
	const oauthFetch = async (
		url: string | URL | Request,
		init?: Parameters<typeof fetch>[1],
	) => {
		const authStorage = getAuthStorage()

		// Reload from disk to handle multi-instance refresh
		authStorage.reload()

		// Get access token (auto-refreshes if expired)
		const accessToken = await authStorage.getApiKey("anthropic")

		if (!accessToken) {
			throw new Error("Not logged in to Anthropic. Run /login first.")
		}

		// Merge incoming headers (e.g. beta flags added by the AI SDK for
		// provider-defined tools like computer use) with the OAuth headers.
		const incomingHeaders = new Headers(init?.headers as HeadersInit)
		const oauthBetas =
			"oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
		const sdkBetas = incomingHeaders.get("anthropic-beta")
		const mergedBetas = sdkBetas
			? `${oauthBetas},${sdkBetas
					.split(",")
					.filter((b) => !oauthBetas.includes(b))
					.join(",")}`.replace(/,+$/, "")
			: oauthBetas

		// Drop auth-related headers from the SDK — we handle auth via OAuth.
		// The SDK sets x-api-key with the dummy "oauth-placeholder" value which
		// would cause the API to reject the request.
		incomingHeaders.delete("x-api-key")
		incomingHeaders.delete("authorization")

		return fetch(url, {
			...init,
			headers: {
				...Object.fromEntries(incomingHeaders.entries()),
				Authorization: `Bearer ${accessToken}`,
				"anthropic-beta": mergedBetas,
				"anthropic-version": "2023-06-01",
			},
		})
	}

	const anthropic = createAnthropic({
		// Provide a dummy API key - the actual auth is handled via OAuth in oauthFetch
		// This prevents the SDK from throwing "API key is missing" at model creation time
		apiKey: "oauth-placeholder",
		fetch: oauthFetch as any,
	})

	// Wrap with middleware to inject Claude Code identity and enable prompt caching
	return wrapLanguageModel({
		model: anthropic(modelId) as any,
		middleware: [claudeCodeMiddleware, promptCacheMiddleware],
	})
}
