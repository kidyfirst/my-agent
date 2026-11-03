import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import type { ModelRouterLanguageModelConfig } from "./types.js"

export class ModelRouterLanguageModel {
	readonly specificationVersion = "v1"
	readonly defaultObjectGenerationMode = "json"
	readonly supportsStructuredOutputs = true
	readonly supportsImageUrls = true

	id: string
	modelId: string
	provider: string
	config: ModelRouterLanguageModelConfig

	private _resolvedModel: any

	constructor(
		config: string | ModelRouterLanguageModelConfig,
		_customGateways?: any[],
	) {
		const rawId = typeof config === "string" ? config : config.id
		this.id = rawId
		this.config = typeof config === "string" ? { id: config } : config

		if (rawId.includes("/")) {
			const slashIndex = rawId.indexOf("/")
			this.provider = rawId.substring(0, slashIndex)
			this.modelId = rawId.substring(slashIndex + 1)
		} else {
			this.provider = "openai"
			this.modelId = rawId
		}
	}

	protected resolveModel(): any {
		if (this._resolvedModel) return this._resolvedModel

		const apiKey =
			this.config.apiKey ||
			process.env[
				`${this.provider.toUpperCase().replace(/-/g, "_")}_API_KEY`
			] ||
			process.env.OPENAI_API_KEY ||
			"dummy-key"
		const baseURL = this.config.url

		if (this.provider === "anthropic") {
			const anthropic = createAnthropic({ apiKey, baseURL })
			this._resolvedModel = anthropic(this.modelId)
		} else if (this.provider === "google") {
			const openai = createOpenAI({
				apiKey,
				baseURL:
					baseURL || "https://generativelanguage.googleapis.com/v1beta/openai/",
			})
			this._resolvedModel = openai(this.modelId)
		} else {
			const openai = createOpenAI({ apiKey, baseURL })
			this._resolvedModel = openai(this.modelId)
		}
		return this._resolvedModel
	}

	async doGenerate(options: any): Promise<any> {
		const model = this.resolveModel()
		return model.doGenerate(options)
	}

	async doStream(options: any): Promise<any> {
		const model = this.resolveModel()
		return model.doStream(options)
	}
}
