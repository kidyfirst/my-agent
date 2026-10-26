import type { LanguageModel } from "ai"

export type MyAgentModelConfig =
	| LanguageModel
	| {
			modelId: string
			provider?: string
			[key: string]: unknown
	  }
	| any

export interface ProviderConfig {
	id?: string
	name?: string
	url?: string
	models: string[]
	[key: string]: unknown
}

export interface ModelRouterLanguageModelConfig {
	id: string
	url?: string
	apiKey?: string
	headers?: Record<string, string>
	api?: string
	[key: string]: unknown
}
