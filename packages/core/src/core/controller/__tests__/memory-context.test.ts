import { describe, it, expect, vi } from "vitest"
import { z } from "zod"
import { MockLanguageModelV3 } from "ai/test"
import { SQLiteStore } from "../../../store/index.js"
import { AgentController } from "../controller.js"
import { Agent } from "../../agent/index.js"

function convertArrayToReadableStream(chunks: any[]): ReadableStream {
	let index = 0
	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) {
				controller.enqueue(chunks[index++])
			} else {
				controller.close()
			}
		},
	})
}

const mockUsage = {
	inputTokens: { total: 10, prompt: 10 },
	outputTokens: { total: 10, completion: 10 },
}

describe("Memory Context & History Preservation", () => {
	it("preserves tool-call and tool-result across turns in coreMessages", async () => {
		let promptsReceived: any[] = []
		let turn = 0

		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				promptsReceived.push(options.prompt)
				turn++
				if (turn === 1) {
					// Turn 1: call a tool and output text
					return {
						stream: convertArrayToReadableStream([
							{ type: "stream-start", warnings: [] },
							{
								type: "tool-call",
								toolCallId: "call_1",
								toolName: "test_tool",
								input: JSON.stringify({ query: "hello" }),
							},
							{ type: "text-start", id: "0" },
							{ type: "text-delta", id: "0", delta: "Tool called" },
							{ type: "text-end", id: "0" },
							{
								type: "finish",
								finishReason: "tool-calls",
								usage: mockUsage,
							},
						]),
						warnings: [],
					}
				}
				// Turn 2
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "1" },
						{ type: "text-delta", id: "1", delta: "Turn 2 done" },
						{ type: "text-end", id: "1" },
						{
							type: "finish",
							finishReason: "stop",
							usage: mockUsage,
						},
					]),
					warnings: [],
				}
			},
		})

		const storage = new SQLiteStore({ url: ":memory:" })
		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Test instructions",
			model: () => model,
			tools: {
				test_tool: {
					description: "A test tool",
					inputSchema: z.object({ query: z.string() }),
					execute: async () => ({ status: "ok", found: 42 }),
				},
			},
		})
		const controller = new AgentController({
			storage,
			agent,
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "test-res" })

		// Send Turn 1
		await session.sendMessage({ content: "Please run test tool" })

		// Send Turn 2
		await session.sendMessage({ content: "What did you find in turn 1?" })

		expect(promptsReceived.length).toBeGreaterThanOrEqual(2)
		const turn2Prompt = promptsReceived[promptsReceived.length - 1]

		// In Turn 2, the prompt must contain the assistant message with tool-call AND tool result!
		const assistantMsg = turn2Prompt.find((p: any) => p.role === "assistant")
		expect(assistantMsg).toBeDefined()
		const toolCallInPrompt = Array.isArray(assistantMsg.content)
			? assistantMsg.content.find((c: any) => c.type === "tool-call")
			: null
		expect(toolCallInPrompt).toBeDefined()
		expect(toolCallInPrompt.toolName).toBe("test_tool")
		expect(toolCallInPrompt.input).toEqual({ query: "hello" })

		const toolResultMsg = turn2Prompt.find((p: any) => p.role === "tool")
		expect(toolResultMsg).toBeDefined()
		expect(toolResultMsg.content[0]).toMatchObject({
			type: "tool-result",
			toolName: "test_tool",
		})
	})

	it("truncates older history and prepends system note when history exceeds token budget", async () => {
		let receivedPrompt: any = null

		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				receivedPrompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "0" },
						{ type: "text-delta", id: "0", delta: "Ack" },
						{ type: "text-end", id: "0" },
						{
							type: "finish",
							finishReason: "stop",
							usage: mockUsage,
						},
					]),
					warnings: [],
				}
			},
		})

		const storage = new SQLiteStore({ url: ":memory:" })
		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Test instructions",
			model: () => model,
		})
		const controller = new AgentController({
			storage,
			agent,
		})
		await controller.init()
		const session = await controller.createSession({
			resourceId: "test-res-budget",
		})
		await session.thread.create({ title: "Test Budget Thread" })
		const threadId = session.thread.getId()

		// Pre-populate huge messages in SQLite directly to simulate long conversation history
		const store = await (controller.storage as SQLiteStore).getStore("memory")

		// 15 huge messages, each 25,000 chars (~6,250 tokens), total > 90,000 tokens (> 64,000 token budget)
		const hugeMessages: any[] = []
		for (let i = 0; i < 15; i++) {
			hugeMessages.push({
				id: `huge_${i}`,
				role: i % 2 === 0 ? "user" : "assistant",
				content: {
					format: 2,
					parts: [{ type: "text", text: `Turn ${i}: ` + "A".repeat(25000) }],
					content: `Turn ${i}: ` + "A".repeat(25000),
				},
				threadId,
				resourceId: "test-res-budget",
				createdAt: new Date(Date.now() - (20 - i) * 1000),
			})
		}
		await store.saveMessages({ messages: hugeMessages })

		// Send message in this thread
		await session.sendMessage({ content: "Latest user prompt" })

		expect(receivedPrompt).toBeDefined()
		const truncationNoteMsg = receivedPrompt.find((p: any) => {
			const str =
				typeof p.content === "string" ? p.content : JSON.stringify(p.content)
			return str.includes("Earlier conversation history was truncated")
		})
		expect(truncationNoteMsg).toBeDefined()
		expect(truncationNoteMsg.role).toBe("user")

		// The latest turn is still present at the end
		const lastPromptMsg = receivedPrompt[receivedPrompt.length - 1]
		expect(lastPromptMsg.role).toBe("user")
		const lastStr =
			typeof lastPromptMsg.content === "string"
				? lastPromptMsg.content
				: JSON.stringify(lastPromptMsg.content)
		expect(lastStr).toContain("Latest user prompt")
	})

	it("populates input for tool-call when args is present or when result was missing", async () => {
		let receivedPrompt: any = null

		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				receivedPrompt = options.prompt
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "0" },
						{ type: "text-delta", id: "0", delta: "Ack" },
						{ type: "text-end", id: "0" },
						{
							type: "finish",
							finishReason: "stop",
							usage: mockUsage,
						},
					]),
					warnings: [],
				}
			},
		})

		const storage = new SQLiteStore({ url: ":memory:" })
		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Test instructions",
			model: () => model,
		})
		const controller = new AgentController({
			storage,
			agent,
		})
		await controller.init()
		const session = await controller.createSession({
			resourceId: "test-tool-input",
		})
		await session.thread.create({ title: "Test Tool Input" })
		const threadId = session.thread.getId()

		const store = await (controller.storage as SQLiteStore).getStore("memory")
		// Simulate a historical assistant turn that has tool-call with `args` (from older database records)
		await store.saveMessages({
			messages: [
				{
					id: "msg_user_1",
					role: "user",
					content: {
						format: 2,
						parts: [{ type: "text", text: "Run some tool" }],
						content: "Run some tool",
					},
					threadId,
					resourceId: "test-tool-input",
					createdAt: new Date(Date.now() - 5000),
				},
				{
					id: "msg_asst_1",
					role: "assistant",
					content: {
						format: 2,
						parts: [
							{
								type: "tool-call",
								toolCallId: "call_abc",
								toolName: "fetch_data",
								args: { url: "https://example.com" },
							},
						],
						content: "",
					},
					threadId,
					resourceId: "test-tool-input",
					createdAt: new Date(Date.now() - 4000),
				},
			],
		})

		await session.sendMessage({ content: "Next prompt" })

		expect(receivedPrompt).toBeDefined()
		const asstMsg = receivedPrompt.find((p: any) => p.role === "assistant")
		expect(asstMsg).toBeDefined()
		const toolCall = asstMsg.content.find((c: any) => c.type === "tool-call")
		expect(toolCall).toBeDefined()
		// AI SDK v6 requires `input` to be non-undefined, so OpenAI provider serializer can output function.arguments
		expect(toolCall.input).toEqual({ url: "https://example.com" })

		// Also verify a matching tool result was generated so API won't reject missing tool result
		const toolMsg = receivedPrompt.find((p: any) => p.role === "tool")
		expect(toolMsg).toBeDefined()
		expect(toolMsg.content[0].toolCallId).toBe("call_abc")
	})
})
