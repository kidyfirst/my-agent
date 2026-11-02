import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import {
	ModelRouterLanguageModel,
	DEFAULT_EXECUTION_MODE,
	type RequestContext,
} from "../core/index.js"
import { opencodeClaudeMaxProvider } from "../providers/claude-max.js"
import { openaiCodexProvider } from "../providers/openai-codex.js"
import { AuthStorage } from "../auth/storage.js"
import { loadSettings, getCustomProviderId } from "./settings.js"
import { DEFAULT_OM_MODEL_ID } from "./state.js"
import { withThinkingOptions } from "./thinking.js"
import { PROVIDER_DEFAULT_MODELS } from "../constants/models.js"

export interface ResolveModelOptions {
	thinkingLevel?: string
	remapForCodexOAuth?: boolean
}

function wrapWithFallback(primaryModel: any, getFallbackModel: () => any) {
	let fallbackInstance: any = null
	const getFallback = () => {
		if (!fallbackInstance) fallbackInstance = getFallbackModel()
		return fallbackInstance
	}
	const isTransientError = (err: any) => {
		const str = String(err?.message || err)
		return (
			str.includes("503") ||
			str.includes("Service Unavailable") ||
			str.includes("unavailable") ||
			str.includes("overloaded") ||
			str.includes("aborted due to timeout") ||
			str.includes("timeout") ||
			str.includes("ECONNRESET")
		)
	}

	return new Proxy(primaryModel, {
		get(target, prop, receiver) {
			if (prop === "doStream") {
				return async (...args: any[]) => {
					try {
						return await target.doStream(...args)
					} catch (err: any) {
						if (isTransientError(err)) {
							console.warn(
								`[model-fallback] Primary model error (${err?.message || err}), switching to fallback model...`,
							)
							const fb = getFallback()
							return await fb.doStream(...args)
						}
						throw err
					}
				}
			}
			if (prop === "doGenerate") {
				return async (...args: any[]) => {
					try {
						return await target.doGenerate(...args)
					} catch (err: any) {
						if (isTransientError(err)) {
							console.warn(
								`[model-fallback] Primary model error (${err?.message || err}), switching to fallback model...`,
							)
							const fb = getFallback()
							return await fb.doGenerate(...args)
						}
						throw err
					}
				}
			}
			const val = Reflect.get(target, prop, receiver)
			return typeof val === "function" ? val.bind(target) : val
		},
	})
}

export type ModelResolver = ReturnType<typeof createModelResolver>
export function createModelResolver(authStorage: AuthStorage) {
	return function resolveModel(
		modelIdInput: string | { modelId?: string },
		options?: ResolveModelOptions,
	): any {
		authStorage.reload()
		authStorage.syncCredentials()
		const modelId =
			typeof modelIdInput === "object" &&
			modelIdInput !== null &&
			"modelId" in modelIdInput
				? (modelIdInput as any).modelId || ""
				: typeof modelIdInput === "string"
					? modelIdInput
					: String(modelIdInput || "")
		const [providerId, modelName] = modelId.split("/", 2)
		const settings = loadSettings()
		const thinkingLevel = options?.thinkingLevel

		// 1. Custom providers configured by user
		const customProvider = settings.customProviders?.find((p) => {
			const pId = getCustomProviderId(p.name)
			return (
				(providerId && pId === providerId) ||
				p.models?.includes(modelId) ||
				(modelName && p.models?.includes(modelName)) ||
				(providerId && p.models?.includes(providerId))
			)
		})

		if (customProvider) {
			return new ModelRouterLanguageModel({
				id: modelId as any,
				url: customProvider.url,
				apiKey: customProvider.apiKey,
			})
		}

		// 2. Moonshot AI via Anthropic compatibility endpoint
		if (modelId.startsWith("moonshotai/")) {
			const apiKey = process.env.MOONSHOT_AI_API_KEY
			if (!apiKey) {
				throw new Error("Need MOONSHOT_AI_API_KEY environment variable")
			}
			return createAnthropic({
				apiKey,
				baseURL: "https://api.moonshot.ai/anthropic/v1",
				name: "moonshotai.anthropicv1",
			})(modelId.substring("moonshotai/".length))
		}

		// 3. Anthropic
		if (modelId.startsWith("anthropic/")) {
			const bareModelId = modelId.substring("anthropic/".length)
			let model: any
			if (authStorage.isLoggedIn("anthropic")) {
				model = opencodeClaudeMaxProvider(bareModelId)
			} else {
				const apiKey =
					authStorage.getApiKeySync("anthropic") ||
					process.env.ANTHROPIC_API_KEY
				model = apiKey
					? createAnthropic({ apiKey })(bareModelId)
					: opencodeClaudeMaxProvider(bareModelId)
			}
			return withThinkingOptions(model, "anthropic", thinkingLevel)
		}

		// 4. OpenAI
		if (modelId.startsWith("openai/")) {
			const bareModelId = modelId.substring("openai/".length)
			let model: any
			if (authStorage.isLoggedIn("openai-codex")) {
				model = openaiCodexProvider(bareModelId)
			} else {
				const apiKey =
					authStorage.getApiKeySync("openai") ||
					authStorage.getApiKeySync("openai-codex") ||
					process.env.OPENAI_API_KEY
				model = apiKey
					? createOpenAI({ apiKey })(bareModelId)
					: new ModelRouterLanguageModel(modelId as any)
			}
			return withThinkingOptions(model, "openai", thinkingLevel)
		}

		// 5. Google
		if (modelId.startsWith("google/")) {
			const apiKey =
				authStorage.getApiKeySync("google") ||
				process.env.GEMINI_API_KEY ||
				process.env.GOOGLE_GENERATIVE_AI_API_KEY
			if (apiKey) {
				process.env.GEMINI_API_KEY = apiKey
				process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey
				const primaryModel = new ModelRouterLanguageModel({
					id: modelId as any,
					apiKey,
				})
				const fallbackGoogleModel = PROVIDER_DEFAULT_MODELS.google
				if (modelId !== fallbackGoogleModel) {
					return wrapWithFallback(
						primaryModel,
						() =>
							new ModelRouterLanguageModel({
								id: fallbackGoogleModel as any,
								apiKey,
							}),
					)
				}
				return primaryModel
			}
			return new ModelRouterLanguageModel(modelId as any)
		}

		// 6. DeepSeek (OpenAI-compatible)
		if (
			modelId.startsWith("deepseek/") ||
			modelId.startsWith("deepseek-") ||
			modelId.includes("deepseek")
		) {
			let bareModelId = modelId.startsWith("deepseek/")
				? modelId.substring("deepseek/".length)
				: modelId
			const apiKey =
				authStorage.getApiKeySync("deepseek") || process.env.DEEPSEEK_API_KEY
			if (apiKey) {
				process.env.DEEPSEEK_API_KEY = apiKey
				const baseURL =
					process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
				if (
					bareModelId === "deepseek-v4-flash" ||
					bareModelId === "deepseek-v4-flash-vision-exp" ||
					bareModelId === "deepseek-chat"
				) {
					bareModelId = "deepseek-flash"
				} else if (bareModelId === "deepseek-reasoner") {
					bareModelId = "deepseek-v4-pro"
				} else if (
					bareModelId !== "deepseek-flash" &&
					bareModelId !== "deepseek-v4-pro"
				) {
					bareModelId = "deepseek-flash"
				}
				return withThinkingOptions(
					createOpenAI({
						apiKey,
						baseURL,
					}).chat(bareModelId),
					"deepseek",
					thinkingLevel,
				)
			}
			return new ModelRouterLanguageModel(
				(modelId.includes("/") ? modelId : `deepseek/${modelId}`) as any,
			)
		}

		// 7. Default ModelRouterLanguageModel for all other providers (Cerebras, Ollama, etc.)
		const genericKey = authStorage.getApiKeySync(providerId)
		if (genericKey) {
			return new ModelRouterLanguageModel({
				id: modelId as any,
				apiKey: genericKey,
			})
		}
		return new ModelRouterLanguageModel(modelId as any)
	}
}

/**
 * First default model for a provider the user is actually signed in to.
 * Used only as a rescue path — see the guard in the dynamic model getter.
 */
function firstAuthenticatedDefault(
	authStorage: AuthStorage,
): string | undefined {
	authStorage.reload()
	for (const authId of ["anthropic", "openai-codex", "google", "deepseek"]) {
		if (!authStorage.isLoggedIn(authId)) continue
		const modelId = authStorage.getDefaultModelForProvider(authId)
		if (modelId) return modelId
	}
	return undefined
}

export function createDynamicModelGetter(
	resolveModel: (modelId: string, options?: ResolveModelOptions) => any,
	authStorage?: AuthStorage,
) {
	return function getDynamicModel({
		requestContext,
	}: {
		requestContext: RequestContext
	}) {
		const harnessContext = (requestContext.get("controller") ||
			requestContext.get("harness")) as any
		if (harnessContext && !requestContext.get("harness")) {
			try {
				requestContext.set("harness", harnessContext)
			} catch {}
		}

		// `sendMessage` puts the Session on the context under "session". The
		// controller has no `session` property, so reading only
		// `harnessContext.session` silently fell through to the stored mode
		// default — which may point at a provider the user never authenticated.
		const requestSession = requestContext.get("session") as any
		const session = harnessContext?.session ?? requestSession
		const state =
			harnessContext?.state ??
			harnessContext?.getState?.() ??
			session?.state?.get?.() ??
			{}

		const rawModelId =
			session?.modelId ||
			(typeof session?.model?.get === "function"
				? session.model.get()
				: undefined) ||
			state.currentModelId ||
			harnessContext?.currentModelId

		let modelId: string | undefined =
			typeof rawModelId === "string"
				? rawModelId
				: typeof rawModelId === "object" &&
					  rawModelId !== null &&
					  "modelId" in rawModelId
					? (rawModelId as any).modelId
					: undefined

		if (!modelId) {
			const modeId =
				session?.modeId || harnessContext?.modeId || DEFAULT_EXECUTION_MODE
			const settings = loadSettings()
			modelId = settings.models?.modeDefaults?.[modeId]
		}

		// Anthropic is the one provider without an env-key escape hatch: the
		// resolver always falls back to the OAuth provider, which throws mid-stream
		// when nobody is signed in. Prefer a provider that can actually answer.
		if (
			modelId &&
			authStorage &&
			modelId.startsWith("anthropic/") &&
			!authStorage.isLoggedIn("anthropic") &&
			!authStorage.getApiKeySync("anthropic") &&
			!process.env.ANTHROPIC_API_KEY
		) {
			const fallback = firstAuthenticatedDefault(authStorage)
			if (fallback) {
				console.warn(
					`[model-resolver] "${modelId}" requires Anthropic auth; using ${fallback} instead`,
				)
				modelId = fallback
			}
		}

		if (!modelId && authStorage) {
			authStorage.reload()
			if (authStorage.isLoggedIn("anthropic")) {
				modelId = authStorage.getDefaultModelForProvider("anthropic")
			} else if (authStorage.isLoggedIn("openai-codex")) {
				modelId = authStorage.getDefaultModelForProvider("openai-codex")
			} else if (authStorage.isLoggedIn("google")) {
				modelId = authStorage.getDefaultModelForProvider("google")
			} else if (authStorage.isLoggedIn("deepseek")) {
				modelId = authStorage.getDefaultModelForProvider("deepseek")
			}
		}

		if (!modelId) {
			modelId = DEFAULT_OM_MODEL_ID
		}

		if (!modelId) {
			throw new Error("No model selected. Pick one in the model menu first.")
		}

		const thinkingLevel = state?.thinkingLevel
		return resolveModel(modelId, { thinkingLevel })
	}
}
