import { describe, it, expect, vi } from "vitest"
import { MockLanguageModelV3 } from "ai/test"
import { SQLiteStore } from "../../../store/index.js"
import { AgentController } from "../controller.js"
import { Agent } from "../../agent/index.js"
import { createRetrieveFoldedMessagesTool } from "../../../tools/retrieve-folded.js"
import {
	resolveModelContextWindow,
	computeMaxHistoryTokens,
} from "../../llm/context-window.js"

function streamOf(chunks: any[]): ReadableStream {
	let index = 0
	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) controller.enqueue(chunks[index++])
			else controller.close()
		},
	})
}

function reply(
	text: string,
	usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
) {
	return {
		stream: streamOf([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "0" },
			{ type: "text-delta", id: "0", delta: text },
			{ type: "text-end", id: "0" },
			{
				type: "finish",
				finishReason: "stop",
				usage,
				totalUsage: usage,
			},
		]),
		warnings: [],
	}
}

describe("Dynamic Model Context Window & Token Budgeting", () => {
	it("resolves context windows accurately for various model families", () => {
		expect(
			resolveModelContextWindow(undefined, "anthropic/claude-3-5-sonnet"),
		).toBe(200_000)
		expect(
			resolveModelContextWindow(undefined, "anthropic/claude-3-7-sonnet"),
		).toBe(200_000)
		expect(resolveModelContextWindow(undefined, "openai/gpt-4o")).toBe(128_000)
		expect(resolveModelContextWindow(undefined, "openai/o3-mini")).toBe(128_000)
		expect(
			resolveModelContextWindow(undefined, "google/gemini-2.0-flash"),
		).toBe(1_000_000)
		expect(resolveModelContextWindow(undefined, "deepseek/deepseek-chat")).toBe(
			64_000,
		)
		expect(resolveModelContextWindow(undefined, "qwen/qwen-2.5-coder-7b")).toBe(
			32_768,
		)
		expect(resolveModelContextWindow(undefined, "unknown-custom-model")).toBe(
			64_000,
		)

		// Explicit override
		expect(
			resolveModelContextWindow(
				{ contextWindow: 32_000 },
				"anthropic/claude-3-5-sonnet",
			),
		).toBe(32_000)
		expect(
			resolveModelContextWindow(
				undefined,
				"anthropic/claude-3-5-sonnet",
				50_000,
			),
		).toBe(50_000)
	})

	it("computes safe history token budgets adapted to the model window size", () => {
		// 32k model: leaves ~9k for prompt & answer
		const budget32k = computeMaxHistoryTokens(32_768)
		expect(budget32k).toBe(Math.floor(32_768 * 0.72))
		expect(budget32k).toBeLessThan(32_768)

		// 64k model: leaves 16k
		const budget64k = computeMaxHistoryTokens(64_000)
		expect(budget64k).toBe(48_000)

		// 128k model: leaves ~25k
		const budget128k = computeMaxHistoryTokens(128_000)
		expect(budget128k).toBe(102_400)

		// 200k model (Claude): 160k budget
		const budget200k = computeMaxHistoryTokens(200_000)
		expect(budget200k).toBe(160_000)

		// 1M model (Gemini): capped at 256k to avoid extreme local latency
		const budget1M = computeMaxHistoryTokens(1_000_000)
		expect(budget1M).toBe(256_000)
	})
})

describe("Persistent Folded Ranges across App Restarts", () => {
	it("persists folded range metadata in SQLite and increments rangeId without collision after restart", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const store = await storage.getStore("memory")

		let capturedPrompts: any[] = []
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				capturedPrompts.push(options.prompt)
				return reply("ok")
			},
		})

		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base",
			model: () => model,
			contextWindow: 4_000,
			tools: {},
		})

		// Session 1: Create thread and seed enough history to trigger folding
		const controller1 = new AgentController({ storage, agent })
		await controller1.init()
		const session1 = await controller1.createSession({
			resourceId: "r1",
			contextWindow: 4_000,
		})
		const thread = await session1.thread.create({ title: "Session 1" })

		// Seed 8 messages with 2,000 chars (~4,000 tokens, exceeding the ~2,600 token budget)
		const seeded: any[] = []
		for (let i = 0; i < 8; i++) {
			const text = `Message ${i}: ` + "A".repeat(2_000)
			seeded.push({
				id: `msg_${i}`,
				role: i % 2 === 0 ? "user" : "assistant",
				content: {
					format: 2,
					parts: [{ type: "text", text }],
					content: text,
				},
				threadId: thread.id,
				resourceId: "r1",
				createdAt: new Date(Date.now() - (20 - i) * 1000),
			})
		}
		await store.saveMessages({ messages: seeded })

		// First sendMessage triggers first folding (rangeId: fold_001)
		await session1.sendMessage({ content: "Continue work" })

		const ranges1 = session1.getFoldedRanges(thread.id)
		expect(ranges1.length).toBe(1)
		expect(ranges1[0].rangeId).toBe("fold_001")
		expect(ranges1[0].messageIds).toBeDefined()
		expect(ranges1[0].messageIds?.length).toBeGreaterThan(0)

		// Verify metadata in SQLite DB was updated
		const threadFromDb = await store.getThreadById({ threadId: thread.id })
		expect(threadFromDb?.metadata?.foldedRanges).toBeDefined()
		const persistedRanges = (threadFromDb?.metadata as any).foldedRanges
		expect(persistedRanges.length).toBe(1)
		expect(persistedRanges[0].rangeId).toBe("fold_001")

		// ==================== SIMULATE APP RESTART ====================
		// Create a completely brand-new Controller and Session with fresh memory state
		const controller2 = new AgentController({ storage, agent })
		await controller2.init()
		const session2 = await controller2.createSession({
			resourceId: "r1",
			contextWindow: 4_000,
		})

		// 1. Verify session2 can restore existing folded ranges from SQLite
		const restoredRanges = await session2.getFoldedRangesAsync(thread.id)
		expect(restoredRanges.length).toBe(1)
		expect(restoredRanges[0].rangeId).toBe("fold_001")

		// 2. Test retrieve_folded_messages tool on cold cache (no in-memory messages)
		const tool = createRetrieveFoldedMessagesTool()
		const retrieveRes = await tool.execute(
			{ rangeId: "fold_001", filter: "all" },
			{
				requestContext: {
					get: (k: string) => {
						if (k === "controller") return controller2
						if (k === "session") return session2
						if (k === "threadId") return thread.id
						if (k === "store") return store
						return undefined
					},
				},
			} as any,
		)
		expect(retrieveRes.isError).toBe(false)
		expect(retrieveRes.content).toContain("Retrieved Folded History [fold_001]")
		expect(retrieveRes.content).toContain("Message 0")

		// 3. Seed another batch of messages in the same thread to trigger SECOND fold
		const secondBatch: any[] = []
		for (let i = 8; i < 16; i++) {
			const text = `Second Batch Message ${i}: ` + "B".repeat(2_000)
			secondBatch.push({
				id: `msg_${i}`,
				role: i % 2 === 0 ? "user" : "assistant",
				content: {
					format: 2,
					parts: [{ type: "text", text }],
					content: text,
				},
				threadId: thread.id,
				resourceId: "r1",
				createdAt: new Date(Date.now() - (16 - i) * 1000),
			})
		}
		await store.saveMessages({ messages: secondBatch })

		// Send message in session2: triggers SECOND folding
		await session2.sendMessage({
			content: "Trigger second fold",
			threadId: thread.id,
		})

		// Verify the new range is fold_002 and did NOT reset to fold_001!
		const rangesAfterSecondFold = await session2.getFoldedRangesAsync(thread.id)
		expect(rangesAfterSecondFold.length).toBe(2)
		expect(rangesAfterSecondFold.map((r) => r.rangeId)).toEqual([
			"fold_001",
			"fold_002",
		])

		// Verify SQLite DB now contains both fold_001 and fold_002
		const updatedThreadDb = await store.getThreadById({ threadId: thread.id })
		const finalPersisted = (updatedThreadDb?.metadata as any).foldedRanges
		expect(finalPersisted.length).toBe(2)
		expect(finalPersisted[0].rangeId).toBe("fold_001")
		expect(finalPersisted[1].rangeId).toBe("fold_002")

		// 4. Verify that multiple foldings DO NOT nest [System Note:] in userGoal
		const lastPrompt = capturedPrompts[capturedPrompts.length - 1]
		const systemNotes = lastPrompt.filter((p: any) => {
			if (p.role !== "user") return false
			const text =
				typeof p.content === "string"
					? p.content
					: Array.isArray(p.content)
						? p.content.find((part: any) => part.type === "text")?.text || ""
						: JSON.stringify(p.content)
			return text.includes("Earlier conversation history was truncated")
		})
		// Exactly ONE unified system note should exist at the top
		expect(systemNotes.length).toBe(1)
		// The goal snippet must NOT contain nested "[System Note:"
		const noteText =
			typeof systemNotes[0].content === "string"
				? systemNotes[0].content
				: systemNotes[0].content?.find((part: any) => part.type === "text")
						?.text || JSON.stringify(systemNotes[0].content)
		const goalSection = noteText.match(/Original User Task: "([^"]+)"/)
		if (goalSection) {
			expect(goalSection[1]).not.toContain("[System Note:")
		}

		await storage.close()
	})

	it("decays retrieve_folded_messages output in older turns to prevent token oscillation", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const store = await storage.getStore("memory")

		let capturedPrompts: any[] = []
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				capturedPrompts.push(options.prompt)
				return reply("ok")
			},
		})

		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base",
			model: () => model,
			tools: {},
		})

		const controller = new AgentController({ storage, agent })
		await controller.init()
		const session = await controller.createSession({ resourceId: "r2" })
		const thread = await session.thread.create({ title: "Decay Test" })

		// Seed a history where retrieve_folded_messages was called in Turn 1 (> 2 assistant turns ago)
		const now = Date.now()
		await store.saveMessages({
			messages: [
				// Turn 1 (Old turn): Model called retrieve_folded_messages returning 4000 chars of history
				{
					id: "u1",
					role: "user",
					content: "Check past error",
					threadId: thread.id,
					resourceId: "r2",
					createdAt: new Date(now - 6000),
				},
				{
					id: "a1",
					role: "assistant",
					content: {
						format: 2,
						parts: [
							{
								type: "tool-call",
								toolCallId: "call_rfm_1",
								toolName: "retrieve_folded_messages",
								args: { rangeId: "fold_001" },
							},
							{
								type: "tool-result",
								toolCallId: "call_rfm_1",
								toolName: "retrieve_folded_messages",
								result:
									"# Retrieved Folded History [fold_001]\n" +
									"Error log detail... ".repeat(200),
							},
						],
					},
					threadId: thread.id,
					resourceId: "r2",
					createdAt: new Date(now - 5000),
				},
				// Turn 2 (Intermediate turn)
				{
					id: "u2",
					role: "user",
					content: "Got it, now fix it",
					threadId: thread.id,
					resourceId: "r2",
					createdAt: new Date(now - 4000),
				},
				{
					id: "a2",
					role: "assistant",
					content: "I have fixed it",
					threadId: thread.id,
					resourceId: "r2",
					createdAt: new Date(now - 3000),
				},
				// Turn 3 (Recent turn)
				{
					id: "u3",
					role: "user",
					content: "Run test",
					threadId: thread.id,
					resourceId: "r2",
					createdAt: new Date(now - 2000),
				},
				{
					id: "a3",
					role: "assistant",
					content: "Tests passed",
					threadId: thread.id,
					resourceId: "r2",
					createdAt: new Date(now - 1000),
				},
			],
		})

		// Send Turn 4
		await session.sendMessage({
			content: "Next step",
			threadId: thread.id,
		})

		const latestPrompt = capturedPrompts[capturedPrompts.length - 1]
		const toolMessage = latestPrompt.find((p: any) => p.role === "tool")
		expect(toolMessage).toBeDefined()
		const rfmResultPart = toolMessage.content.find(
			(c: any) => c.toolCallId === "call_rfm_1",
		)
		expect(rfmResultPart).toBeDefined()
		// The 4000-char retrieved history must have decayed to the transient eviction note
		expect(rfmResultPart.output.value).toContain(
			"Retrieved History (fold_001): Inspected by model in previous turn",
		)
		expect(rfmResultPart.output.value).toContain(
			"Content evicted to prevent context oscillation",
		)

		await storage.close()
	})
})
