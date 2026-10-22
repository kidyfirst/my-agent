import { describe, it, expect } from "vitest"
import { createMastraCode } from "../index.js"

describe("createMastraCode (native @mastra/core implementation)", () => {
	it("initializes a Harness instance with required modules", async () => {
		const { harness, authStorage, resolveModel } = await createMastraCode({
			cwd: process.cwd(),
			disableMcp: true,
			disableHooks: true,
			storage: {
				url: "file::memory:",
			},
			initialState: {
				yolo: true,
			},
		})

		expect(harness).toBeDefined()
		expect(harness.id).toBe("mastra-code")
		expect(typeof harness.init).toBe("function")
		expect(typeof harness.sendMessage).toBe("function")
		expect(typeof harness.subscribe).toBe("function")
		expect(typeof harness.getState).toBe("function")
		expect(typeof harness.setState).toBe("function")
		expect(typeof resolveModel).toBe("function")
		expect(authStorage).toBeDefined()

		const modes = harness.listModes()
		expect(modes.map((m: any) => m.id)).toEqual(["build", "plan", "fast"])
	})

	it("switches model and updates state with string modelId", async () => {
		const { harness } = await createMastraCode({
			cwd: process.cwd(),
			disableMcp: true,
			disableHooks: true,
			storage: { url: "file::memory:" },
		})

		await harness.init()
		await harness.switchModel({ modelId: "google/gemini-3.8-flash" })

		const state = harness.getState()
		expect(state.currentModelId).toBe("google/gemini-3.8-flash")
		expect(harness.getCurrentModelId()).toBe("google/gemini-3.8-flash")
	})

	it("resolves dynamic tools and instructions without modelId?.startsWith error", async () => {
		const { harness } = await createMastraCode({
			cwd: process.cwd(),
			disableMcp: true,
			disableHooks: true,
			storage: { url: "file::memory:" },
		})

		await harness.init()
		// Test with both object-based and string-based model switches
		await harness.switchModel({ modelId: "google/gemini-3.8-flash" })

		// Verify session model is string
		expect(typeof harness.getCurrentModelId()).toBe("string")
		expect(harness.getCurrentModelId()).toBe("google/gemini-3.8-flash")
	})

	it("handles object modelId { modelId: '...' } in tools, instructions, and model-resolver", async () => {
		const { createDynamicTools } = await import("../tools.js")
		const { getDynamicInstructions } = await import("../instructions.js")
		const { createDynamicModelGetter, createModelResolver } =
			await import("../model-resolver.js")
		const { AuthStorage } = await import("../../auth/storage.js")

		const authStorage = new AuthStorage()
		const resolveModel = createModelResolver(authStorage)
		const getTools = createDynamicTools()
		const getModel = createDynamicModelGetter(resolveModel, authStorage)

		// Create mock requestContext with object modelId
		const mockContextMap = new Map<string, any>()
		mockContextMap.set("controller", {
			session: {
				modelId: { modelId: "google/gemini-3.8-flash" },
				modeId: "build",
			},
			state: {},
		})
		const mockRequestContext: any = {
			get: (k: string) => mockContextMap.get(k),
			set: (k: string, v: any) => mockContextMap.set(k, v),
		}

		// 1. Tools resolution should not throw modelId?.startsWith is not a function
		expect(() => getTools({ requestContext: mockRequestContext })).not.toThrow()
		const tools = getTools({ requestContext: mockRequestContext })
		expect(tools).toBeDefined()

		// 2. Instructions resolution should work without error
		expect(() =>
			getDynamicInstructions({ requestContext: mockRequestContext }),
		).not.toThrow()

		// 3. Dynamic model getter should resolve model properly
		expect(() => getModel({ requestContext: mockRequestContext })).not.toThrow()
	})

	it("normalizes signal messages with role 'signal' and type 'user' into role 'user'", async () => {
		const { normalizeControllerMessage } = await import("../index.js")
		const rawSignalMsg = {
			id: "msg-test-1",
			thread_id: "thread-1",
			role: "signal",
			type: "user",
			content: JSON.stringify({
				format: 2,
				parts: [{ type: "text", text: "test user input" }],
				metadata: { signal: { type: "user" } },
			}),
		}
		const normalized = normalizeControllerMessage(rawSignalMsg)
		expect(normalized.role).toBe("user")
		expect(typeof normalized.content).toBe("object")
		expect(normalized.content.parts[0].text).toBe("test user input")
	})

	it("resolves DeepSeek flash and v4-pro models with API key", async () => {
		const { createModelResolver } = await import("../model-resolver.js")
		const { AuthStorage } = await import("../../auth/storage.js")

		const authStorage = new AuthStorage(`/tmp/test-auth-${Date.now()}.json`)
		authStorage.set("deepseek", {
			type: "api_key",
			key: "sk-mock-deepseek-key",
		})
		const resolveModel = createModelResolver(authStorage)

		const chatModel = resolveModel("deepseek/deepseek-flash")
		expect(chatModel).toBeDefined()
		expect(chatModel.modelId).toBe("deepseek-flash")

		const reasonerModel = resolveModel("deepseek/deepseek-v4-pro")
		expect(reasonerModel).toBeDefined()
		expect(reasonerModel.modelId).toBe("deepseek-v4-pro")

		// Legacy deepseek-v4-flash should automatically resolve to deepseek-flash
		const legacyFlashModel = resolveModel("deepseek/deepseek-v4-flash")
		expect(legacyFlashModel).toBeDefined()
		expect(legacyFlashModel.modelId).toBe("deepseek-flash")
	})

	it("upgrades deprecated DeepSeek model names properly", async () => {
		const { upgradeDeprecatedModel, isDeprecatedModel } =
			await import("../../constants/models.js")
		expect(isDeprecatedModel("deepseek/deepseek-v4-flash")).toBe(true)
		expect(isDeprecatedModel("deepseek-v4-flash")).toBe(true)
		expect(isDeprecatedModel("deepseek/deepseek-chat")).toBe(true)
		expect(isDeprecatedModel("deepseek-chat")).toBe(true)
		expect(isDeprecatedModel("deepseek/deepseek-flash")).toBe(false)
		expect(isDeprecatedModel("deepseek/deepseek-v4-pro")).toBe(false)

		expect(upgradeDeprecatedModel("deepseek/deepseek-v4-flash")).toBe(
			"deepseek/deepseek-flash",
		)
		expect(upgradeDeprecatedModel("deepseek-v4-flash")).toBe(
			"deepseek/deepseek-flash",
		)
		expect(upgradeDeprecatedModel("deepseek/deepseek-chat")).toBe(
			"deepseek/deepseek-flash",
		)
		expect(upgradeDeprecatedModel("deepseek/deepseek-reasoner")).toBe(
			"deepseek/deepseek-v4-pro",
		)
	})
})
