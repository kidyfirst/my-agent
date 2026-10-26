import { describe, expect, it } from "vitest"
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test"
import { AgentController } from "../controller.js"
import { createTool } from "../../tools/tool.js"
import { z } from "zod/v3"
import { SQLiteStore } from "../../../store/index.js"

const usage = {
	inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 5, text: 5, reasoning: 0 },
}

function makeController(model: any, tools: Record<string, any> = {}) {
	const controller = new AgentController({
		agent: {
			getInstructions: async () => "test agent",
			getModel: async () => model,
			listTools: async () => tools,
		} as any,
		storage: new SQLiteStore() as any,
	})
	return controller
}

function textModel(chunks: string[]) {
	return new MockLanguageModelV3({
		doStream: async () => ({
			stream: convertArrayToReadableStream([
				{ type: "stream-start", warnings: [] },
				{ type: "text-start", id: "t1" },
				...chunks.map((delta) => ({ type: "text-delta", id: "t1", delta })),
				{ type: "text-end", id: "t1" },
				{ type: "finish", finishReason: "stop", usage },
			]),
		}),
	})
}

describe("Session.sendMessage", () => {
	it("streams assistant text and persists it", async () => {
		const controller = makeController(textModel(["在的", "，有什么能帮你？"]))
		await controller.init()
		const session = await controller.createSession({ resourceId: "test" })

		const events: Array<{ type: string; [key: string]: unknown }> = []
		session.subscribe((e: any) => events.push(e))

		await session.sendMessage({ content: "在吗?" } as any)

		const deltas = events.filter((e) => e.type === "message_delta")
		expect(deltas.map((d) => d.delta).join("")).toBe("在的，有什么能帮你？")

		const end = events.find(
			(e) =>
				e.type === "message_end" && (e.message as any)?.role === "assistant",
		)
		expect((end?.message as any)?.content?.content).toBe("在的，有什么能帮你？")
	})

	it("streams reasoning chunks as thinking parts and persists them", async () => {
		const model = new MockLanguageModelV3({
			doStream: async () => ({
				stream: convertArrayToReadableStream([
					{ type: "stream-start", warnings: [] },
					{ type: "reasoning-start", id: "r1" },
					{ type: "reasoning-delta", id: "r1", delta: "深度思考中..." },
					{ type: "reasoning-end", id: "r1" },
					{ type: "text-start", id: "t1" },
					{ type: "text-delta", id: "t1", delta: "回答完毕。" },
					{ type: "text-end", id: "t1" },
					{ type: "finish", finishReason: "stop", usage },
				]),
			}),
		})
		const controller = makeController(model)
		await controller.init()
		const session = await controller.createSession({ resourceId: "test" })

		const events: Array<{ type: string; [key: string]: unknown }> = []
		session.subscribe((e: any) => events.push(e))

		await session.sendMessage({ content: "你好" } as any)

		const updates = events.filter((e) => e.type === "message_update")
		expect(updates.length).toBeGreaterThan(0)
		const lastUpdate = updates[updates.length - 1]
		const updateParts = (lastUpdate.message as any)?.content as any[]
		expect(
			updateParts.some(
				(p) => p.type === "thinking" && p.thinking.includes("深度思考中"),
			),
		).toBe(true)
		expect(
			updateParts.some((p) => p.type === "text" && p.text.includes("回答完毕")),
		).toBe(true)

		const end = events.find(
			(e) =>
				e.type === "message_end" && (e.message as any)?.role === "assistant",
		)
		const endParts = (end?.message as any)?.content?.parts as any[]
		expect(
			endParts.some(
				(p) => p.type === "thinking" && p.thinking === "深度思考中...",
			),
		).toBe(true)
		expect(
			endParts.some((p) => p.type === "text" && p.text === "回答完毕。"),
		).toBe(true)
		expect((end?.message as any)?.content?.reasoning).toBe("深度思考中...")
	})

	it("extracts embedded <think> tags from assistant text into thinking parts", async () => {
		const model = new MockLanguageModelV3({
			doStream: async () => ({
				stream: convertArrayToReadableStream([
					{ type: "stream-start", warnings: [] },
					{ type: "text-start", id: "t1" },
					{
						type: "text-delta",
						id: "t1",
						delta: "<think>分析用户指令需求</think>已经为您移除功能。",
					},
					{ type: "text-end", id: "t1" },
					{ type: "finish", finishReason: "stop", usage },
				]),
			}),
		})
		const controller = makeController(model)
		await controller.init()
		const session = await controller.createSession({ resourceId: "test" })

		const events: Array<{ type: string; [key: string]: unknown }> = []
		session.subscribe((e: any) => events.push(e))

		await session.sendMessage({ content: "请移除功能" } as any)

		const end = events.find(
			(e) =>
				e.type === "message_end" && (e.message as any)?.role === "assistant",
		)
		const endParts = (end?.message as any)?.content?.parts as any[]
		expect(
			endParts.some(
				(p) => p.type === "thinking" && p.thinking === "分析用户指令需求",
			),
		).toBe(true)
		expect(
			endParts.some(
				(p) => p.type === "text" && p.text === "已经为您移除功能。",
			),
		).toBe(true)
		expect((end?.message as any)?.content?.content).toBe("已经为您移除功能。")
	})

	it("sends object-typed tool schemas (v6 inputSchema, not legacy parameters)", async () => {
		let captured: any
		const model = new MockLanguageModelV3({
			doStream: async (opts: any) => {
				captured = opts
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "t1" },
						{ type: "text-delta", id: "t1", delta: "ok" },
						{ type: "text-end", id: "t1" },
						{ type: "finish", finishReason: "stop", usage },
					]),
				}
			},
		})

		const controller = makeController(model, {
			request_sandbox_access: createTool({
				id: "request_sandbox_access",
				description: "ask for sandbox access",
				inputSchema: z.object({ path: z.string() }),
				execute: async () => "granted",
			}),
			// Legacy shape: JSON Schema under `parameters`.
			legacy_tool: {
				description: "legacy",
				parameters: { type: "object", properties: { q: { type: "string" } } },
				execute: async () => "ok",
			},
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "test" })
		await session.sendMessage({ content: "hi" } as any)

		const tools: any[] = captured.tools
		const sandbox = tools.find((t) => t.name === "request_sandbox_access")
		expect(sandbox).not.toHaveProperty("parameters")
		expect(sandbox.inputSchema).toMatchObject({ type: "object" })
		expect(sandbox.inputSchema.properties.path).toMatchObject({
			type: "string",
		})

		const legacy = tools.find((t) => t.name === "legacy_tool")
		expect(legacy.inputSchema).toMatchObject({
			type: "object",
			properties: { q: { type: "string" } },
		})
	})

	it("keeps going after a tool call (stopWhen, not maxSteps)", async () => {
		let calls = 0
		const model = new MockLanguageModelV3({
			doStream: async () => {
				calls++
				if (calls === 1) {
					return {
						stream: convertArrayToReadableStream([
							{ type: "stream-start", warnings: [] },
							{
								type: "tool-call",
								toolCallId: "call-1",
								toolName: "echo",
								input: JSON.stringify({ value: "hi" }),
							},
							{ type: "finish", finishReason: "tool-calls", usage },
						]),
					}
				}
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "t1" },
						{ type: "text-delta", id: "t1", delta: "tool said hi" },
						{ type: "text-end", id: "t1" },
						{ type: "finish", finishReason: "stop", usage },
					]),
				}
			},
		})

		let executed = 0
		const controller = makeController(model, {
			echo: {
				description: "echo",
				parameters: {
					type: "object",
					properties: { value: { type: "string" } },
				},
				execute: async (args: any) => {
					executed++
					return { echo: args.value }
				},
			},
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "test" })

		const events: Array<{ type: string }> = []
		session.subscribe((e: any) => {
			events.push(e)
			// Default policy is "ask" — auto-approve so the tool gate does not block.
			if (e.type === "tool_approval_required") {
				session.respondToToolApproval({
					decision: "approve",
					toolCallId: e.toolCallId,
				})
			}
		})

		await session.sendMessage({ content: "echo hi" } as any)

		expect(executed).toBe(1)
		expect(calls).toBe(2)
		expect(events.some((e) => e.type === "tool_start")).toBe(true)
		expect(events.some((e) => e.type === "tool_end")).toBe(true)
		const text = events
			.filter((e) => e.type === "message_delta")
			.map((e: any) => e.delta)
			.join("")
		expect(text).toBe("tool said hi")
	})

	it("surfaces provider errors instead of saving an empty reply", async () => {
		const model = new MockLanguageModelV3({
			doStream: async () => {
				throw new Error("Not logged in to Anthropic. Run /login first.")
			},
		})
		const controller = makeController(model)
		await controller.init()
		const session = await controller.createSession({ resourceId: "test" })

		await expect(
			session.sendMessage({ content: "在吗?" } as any),
		).rejects.toThrow(/Not logged in to Anthropic/)

		const threadId = session.thread.getId()
		// The error event must reach subscribers so the UI can show it.
		const store = await (controller.storage as SQLiteStore).getStore("memory")
		const { messages } = await store.listMessages({ threadId })
		const assistant = messages.filter((m: any) => m.role === "assistant")
		expect(assistant).toHaveLength(0)
	})

	it("persists image parts and attachments and passes ImagePart to vision model", async () => {
		let receivedPrompt: any = null
		const model = new MockLanguageModelV3({
			doStream: async (options) => {
				receivedPrompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "t1" },
						{ type: "text-delta", id: "t1", delta: "I see your screenshot" },
						{ type: "text-end", id: "t1" },
						{
							type: "finish",
							finishReason: "stop",
							usage,
						},
					]),
					warnings: [],
				}
			},
		})
		const controller = makeController(model)
		await controller.init()
		const session = await controller.createSession({ resourceId: "test-img" })

		await session.sendMessage({
			content: "看看这个输入框",
			files: [
				{
					type: "image",
					mediaType: "image/png",
					data: "fakeBase64ScreenshotData",
					name: "screenshot.png",
				},
			],
		} as any)

		const threadId = session.thread.getId()
		const store = await (controller.storage as SQLiteStore).getStore("memory")
		const { messages } = await store.listMessages({ threadId })

		const userMsg = messages.find((m: any) => m.role === "user")
		expect(userMsg).toBeDefined()
		expect(userMsg.content.parts).toHaveLength(2)
		expect(userMsg.content.parts[0]).toMatchObject({
			type: "text",
			text: "看看这个输入框",
		})
		expect(userMsg.content.parts[1]).toMatchObject({
			type: "image",
			mimeType: "image/png",
			data: "fakeBase64ScreenshotData",
			name: "screenshot.png",
		})
		expect(userMsg.attachments).toHaveLength(1)

		// Model prompt verification
		expect(receivedPrompt).toBeDefined()
		const userTurn = receivedPrompt.find((p: any) => p.role === "user")
		expect(userTurn).toBeDefined()
		expect(Array.isArray(userTurn.content)).toBe(true)
		expect(userTurn.content[0]).toMatchObject({
			type: "text",
			text: "看看这个输入框",
		})
		const imgPart = userTurn.content.find(
			(c: any) => c.type === "image" || c.type === "file",
		)
		expect(imgPart).toBeDefined()
		expect(imgPart.image || imgPart.data).toBe("fakeBase64ScreenshotData")
		expect(imgPart.mediaType || imgPart.mimeType).toBe("image/png")
	})
})
