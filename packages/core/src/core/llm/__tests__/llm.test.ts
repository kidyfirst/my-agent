import { describe, it, expect, vi, afterEach } from "vitest"
import {
	ModelRouterLanguageModel,
	ModelsDevGateway,
	NetlifyGateway,
} from "../index.js"

describe("LLM Module", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

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

	describe("NetlifyGateway", () => {
		it("handles array responses correctly", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => [
						{
							id: "openai",
							name: "OpenAI",
							models: ["gpt-4o", { id: "o1" }],
						},
					],
				}),
			)

			const netlify = new NetlifyGateway()
			const providers = await netlify.fetchProviders()
			expect(providers.openai).toBeDefined()
			expect(providers.openai.models).toEqual(["gpt-4o", "o1"])
		})

		it("handles { providers: [...] } array responses correctly", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						providers: [
							{
								id: "anthropic",
								name: "Anthropic",
								models: ["claude-3-7-sonnet"],
							},
						],
					}),
				}),
			)

			const netlify = new NetlifyGateway()
			const providers = await netlify.fetchProviders()
			expect(providers.anthropic).toBeDefined()
			expect(providers.anthropic.models).toEqual(["claude-3-7-sonnet"])
		})

		it("handles { providers: { ... } } dictionary responses without crashing", async () => {
			// This was the exact bug causing 'TypeError: list is not iterable'
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						providers: {
							openai: {
								name: "OpenAI",
								models: ["gpt-4o"],
							},
						},
					}),
				}),
			)

			const netlify = new NetlifyGateway()
			const providers = await netlify.fetchProviders()
			expect(providers.openai).toBeDefined()
			expect(providers.openai.models).toEqual(["gpt-4o"])
		})

		it("safely handles non-OK or 403 HTTP responses", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					status: 403,
					statusText: "Forbidden",
				}),
			)

			const netlify = new NetlifyGateway()
			const providers = await netlify.fetchProviders()
			expect(providers).toEqual({})
		})

		it("safely handles non-object or null data without throwing", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					json: async () => null,
				}),
			)

			const netlify = new NetlifyGateway()
			const providers = await netlify.fetchProviders()
			expect(providers).toEqual({})
		})

		it("safely handles fetch errors (network failures) without throwing", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockRejectedValue(new Error("Network offline")),
			)

			const netlify = new NetlifyGateway()
			const providers = await netlify.fetchProviders()
			expect(providers).toEqual({})
		})
	})

	describe("ModelsDevGateway", () => {
		it("safely handles fetch failures", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockRejectedValue(new Error("Connection refused")),
			)

			const modelsDev = new ModelsDevGateway()
			const providers = await modelsDev.fetchProviders()
			expect(providers).toEqual({})
		})
	})
})
