import { describe, it, expect } from "vitest"
import {
	ModelRouterLanguageModel,
	ModelsDevGateway,
	NetlifyGateway,
	type ProviderConfig,
	type MyAgentModelConfig,
} from "../index.js"

describe("LLM Module", () => {
	it("initializes ModelsDevGateway and NetlifyGateway", () => {
		const modelsDev = new ModelsDevGateway()
		expect(modelsDev.id).toBe("models.dev")
		expect(typeof modelsDev.fetchProviders).toBe("function")

		const netlify = new NetlifyGateway()
		expect(netlify.id).toBe("netlify")
		expect(typeof netlify.fetchProviders).toBe("function")
	})

	it("initializes ModelRouterLanguageModel with string modelId", () => {
		const model = new ModelRouterLanguageModel("openai/gpt-4o")
		expect(model.id).toBe("openai/gpt-4o")
		expect(model.modelId).toBe("gpt-4o")
		expect(model.provider).toBe("openai")
		expect(typeof model.doStream).toBe("function")
		expect(typeof model.doGenerate).toBe("function")
	})

	it("initializes ModelRouterLanguageModel with config object", () => {
		const model = new ModelRouterLanguageModel({
			id: "custom/my-model",
			url: "https://api.custom.com/v1",
			apiKey: "test-key",
		})
		expect(model.id).toBe("custom/my-model")
		expect(model.modelId).toBe("my-model")
		expect(model.provider).toBe("custom")
		expect(typeof model.doStream).toBe("function")
		expect(typeof model.doGenerate).toBe("function")
	})
})
