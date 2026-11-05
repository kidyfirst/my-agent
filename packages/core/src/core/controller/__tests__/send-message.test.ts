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
			name: "screenshot.png",
		})
		expect(userMsg.content.parts[1].assetId).toBeDefined()
		expect(userMsg.content.parts[1].url).toContain("myagent-asset://")
		expect(userMsg.content.parts[1].data).toBeUndefined()
		expect(userMsg.attachments).toHaveLength(1)

		// Model prompt verification: assets are passed by ID reference, prompting assets_fetch
		expect(receivedPrompt).toBeDefined()
		const userTurn = receivedPrompt.find((p: any) => p.role === "user")
		expect(userTurn).toBeDefined()
		const userPromptText =
			typeof userTurn.content === "string"
				? userTurn.content
				: userTurn.content.map((c: any) => c.text || "").join("\n")
		expect(userPromptText).toContain("看看这个输入框")
		expect(userPromptText).toContain("[Attached Asset:")
		expect(userPromptText).toContain("assets_fetch")
	})

	it("keeps user images in store while sending text-only prompt to text models like DeepSeek", async () => {
		let receivedPrompt: any = null
		const model = new MockLanguageModelV3({
			modelId: "deepseek-chat",
			doStream: async (options) => {
				receivedPrompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "0" },
						{ type: "text-delta", id: "0", delta: "收到文字消息" },
						{ type: "text-end", id: "0" },
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
		const session = await controller.createSession({
			resourceId: "test-deepseek",
		})

		await session.sendMessage({
			content: "输入框上下内padding减少一半",
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

		// Store must still contain the image for UI rendering
		const userMsg = messages.find((m: any) => m.role === "user")
		expect(userMsg).toBeDefined()
		expect(userMsg.content.parts).toHaveLength(2)
		expect(userMsg.attachments).toHaveLength(1)

		// Model prompt must NOT contain image/file parts to avoid API 400 Bad Request
		expect(receivedPrompt).toBeDefined()
		const userTurn = receivedPrompt.find((p: any) => p.role === "user")
		expect(userTurn).toBeDefined()
		const promptText =
			typeof userTurn.content === "string"
				? userTurn.content
				: userTurn.content.map((c: any) => c.text || "").join("\n")
		expect(promptText).toContain("输入框上下内padding减少一半")
		expect(promptText).toContain("[Attached Asset:")
		expect(promptText).toContain("assets_fetch")
		if (Array.isArray(userTurn.content)) {
			const nonTextParts = userTurn.content.filter(
				(c: any) => c.type !== "text",
			)
			expect(nonTextParts).toHaveLength(0)
		}
	})

	it("passes asset reference to multimodal models like deepseek-flash prompting assets_fetch", async () => {
		let receivedPrompt: any = null
		const model = new MockLanguageModelV3({
			modelId: "deepseek-flash",
			doStream: async (options) => {
				receivedPrompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "0" },
						{ type: "text-delta", id: "0", delta: "已识别图片内容" },
						{ type: "text-end", id: "0" },
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
		const session = await controller.createSession({
			resourceId: "test-deepseek-flash",
		})

		await session.sendMessage({
			content: "这个图片有什么错误么？",
			files: [
				{
					type: "image",
					mediaType: "image/png",
					data: "fakeBase64ScreenshotData",
					name: "image.png",
				},
			],
		} as any)

		expect(receivedPrompt).toBeDefined()
		const userTurn = receivedPrompt.find((p: any) => p.role === "user")
		expect(userTurn).toBeDefined()
		const promptText =
			typeof userTurn.content === "string"
				? userTurn.content
				: userTurn.content.map((c: any) => c.text || "").join("\n")
		expect(promptText).toContain("这个图片有什么错误么？")
		expect(promptText).toContain("[Attached Asset:")
		expect(promptText).toContain("assets_fetch")
	})

	it("Session.steer redirects execution during tool approval and delivers guidance to next LLM turn", async () => {
		let calls = 0
		let step2Prompt: any = null
		const model = new MockLanguageModelV3({
			doStream: async (options) => {
				calls++
				if (calls === 1) {
					return {
						stream: convertArrayToReadableStream([
							{ type: "stream-start", warnings: [] },
							{
								type: "tool-call",
								toolCallId: "c1",
								toolName: "shell",
								input: JSON.stringify({
									command: "grep -rn 'ToolApprovalCard'",
								}),
							},
							{ type: "finish", finishReason: "tool-calls", usage },
						]),
					}
				}
				step2Prompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "t2" },
						{
							type: "text-delta",
							id: "t2",
							delta: "收到转向指示，改为派生子智能体",
						},
						{ type: "text-end", id: "t2" },
						{ type: "finish", finishReason: "stop", usage },
					]),
				}
			},
		})

		let executed = 0
		const controller = makeController(model, {
			shell: {
				description: "run shell command",
				parameters: {
					type: "object",
					properties: { command: { type: "string" } },
				},
				execute: async () => {
					executed++
					return { output: "should not run" }
				},
			},
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "test-steer" })

		const events: Array<{ type: string; [key: string]: any }> = []
		session.subscribe((e: any) => {
			events.push(e)
			if (e.type === "tool_approval_required") {
				// User steers the agent instead of approving
				session.steer({
					content: "请派生一个子智能体实现该功能",
					threadId: session.thread.getId(),
				})
			}
		})

		await session.sendMessage({ content: "开始查找文件" } as any)

		// 1. Tool should NOT have been executed
		expect(executed).toBe(0)
		expect(calls).toBe(2)

		// 2. tool_approval_resolved was emitted
		const resolvedEvent = events.find(
			(e) => e.type === "tool_approval_resolved",
		)
		expect(resolvedEvent).toBeDefined()
		expect(resolvedEvent?.decision).toBe("decline")

		// 3. Next LLM turn received the steering feedback in tool-result
		expect(step2Prompt).toBeDefined()
		const promptStr = JSON.stringify(step2Prompt)
		expect(promptStr).toContain(
			'Tool execution was declined by user with steering guidance: \\"请派生一个子智能体实现该功能\\"',
		)

		// 4. User steering message was persisted to memory store
		const threadId = session.thread.getId()
		const store = await (controller.storage as SQLiteStore).getStore("memory")
		const { messages } = await store.listMessages({ threadId })
		const steerMsg = messages.find(
			(m: any) =>
				m.role === "user" &&
				(m.content?.content === "请派生一个子智能体实现该功能" ||
					m.content?.parts?.[0]?.text === "请派生一个子智能体实现该功能"),
		)
		expect(steerMsg).toBeDefined()
	})

	it("respondToToolApproval with declineContext supplies feedback to LLM", async () => {
		let calls = 0
		let step2Prompt: any = null
		const model = new MockLanguageModelV3({
			doStream: async (options) => {
				calls++
				if (calls === 1) {
					return {
						stream: convertArrayToReadableStream([
							{ type: "stream-start", warnings: [] },
							{
								type: "tool-call",
								toolCallId: "c_decline",
								toolName: "shell",
								input: JSON.stringify({ command: "rm -rf /tmp/test" }),
							},
							{ type: "finish", finishReason: "tool-calls", usage },
						]),
					}
				}
				step2Prompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "t3" },
						{ type: "text-delta", id: "t3", delta: "已采纳替代方案" },
						{ type: "text-end", id: "t3" },
						{ type: "finish", finishReason: "stop", usage },
					]),
				}
			},
		})

		const controller = makeController(model, {
			shell: {
				description: "run shell command",
				parameters: {
					type: "object",
					properties: { command: { type: "string" } },
				},
				execute: async () => ({ output: "declined" }),
			},
		})
		await controller.init()
		const session = await controller.createSession({
			resourceId: "test-decline-context",
		})

		session.subscribe((e: any) => {
			if (e.type === "tool_approval_required") {
				session.respondToToolApproval({
					decision: "decline",
					toolCallId: e.toolCallId,
					threadId: session.thread.getId(),
					declineContext: { reason: "请换用安全的重命名操作" },
				})
			}
		})

		await session.sendMessage({ content: "清理临时文件" } as any)

		expect(calls).toBe(2)
		expect(step2Prompt).toBeDefined()
		const promptStr = JSON.stringify(step2Prompt)
		expect(promptStr).toContain(
			'Tool execution was declined by user with steering guidance: \\"请换用安全的重命名操作\\"',
		)
	})
})
