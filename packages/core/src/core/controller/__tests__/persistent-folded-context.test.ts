import { describe, it, expect, vi } from "vitest"
import { MockLanguageModelV3 } from "ai/test"
import { SQLiteStore } from "../../../store/index.js"
import { AgentController } from "../controller.js"
import { Agent } from "../../agent/index.js"
import { createRetrieveFoldedMessagesTool } from "../../../tools/retrieve-folded.js"
import {
	resolveModelContextWindow,
	computeMaxHistoryTokens,
	estimateToolsSchemaTokens,
	estimateMessageTokens,
	estimateMessagesTokens,
	estimateTextTokens,
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

	it("prevents duplicate FoldedRange creation when no newly folded messages exist", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const store = await storage.getStore("memory")

		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("ok"),
		})

		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base",
			model: () => model,
			contextWindow: 4_000,
			tools: {},
		})

		const controller = new AgentController({ storage, agent })
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r3",
			contextWindow: 4_000,
		})
		const thread = await session.thread.create({ title: "Dedup Test" })

		// Seed 8 messages
		const seeded: any[] = []
		for (let i = 0; i < 8; i++) {
			const text = `Message ${i}: ` + "X".repeat(2_000)
			seeded.push({
				id: `msg_${i}`,
				role: i % 2 === 0 ? "user" : "assistant",
				content: { format: 2, parts: [{ type: "text", text }], content: text },
				threadId: thread.id,
				resourceId: "r3",
				createdAt: new Date(Date.now() - (10 - i) * 1000),
			})
		}
		await store.saveMessages({ messages: seeded })

		// First fold creates fold_001
		await session.sendMessage({ content: "First turn" })
		const ranges1 = await session.getFoldedRangesAsync(thread.id)
		expect(ranges1.length).toBe(1)
		expect(ranges1[0].rangeId).toBe("fold_001")

		// Re-invoking without adding lots of new messages should NOT generate duplicate empty/overlapping ranges
		await session.sendMessage({ content: "Short follow-up" })
		const ranges2 = await session.getFoldedRangesAsync(thread.id)
		// Should remain at 1 range (fold_001) rather than creating fold_002 with 0 new messages
		expect(ranges2.length).toBe(1)
		expect(ranges2[0].rangeId).toBe("fold_001")

		await storage.close()
	})

	it("does not re-fold already folded messages across subsequent turns, preventing range accumulation in SQLite metadata", async () => {
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

		const controller = new AgentController({ storage, agent })
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r-accum",
			contextWindow: 4_000,
		})
		const thread = await session.thread.create({
			title: "Range Accumulation Guard",
		})

		// Seed 8 messages of 2000 chars each (~4000 tokens > 2600 budget)
		const seeded: any[] = []
		for (let i = 0; i < 8; i++) {
			const text = `Seeded message ${i}: ` + "M".repeat(2_000)
			seeded.push({
				id: `seed_${i}`,
				role: i % 2 === 0 ? "user" : "assistant",
				content: { format: 2, parts: [{ type: "text", text }], content: text },
				threadId: thread.id,
				resourceId: "r-accum",
				createdAt: new Date(Date.now() - (10 - i) * 1000),
			})
		}
		await store.saveMessages({ messages: seeded })

		// Turn 1: Triggers initial folding of older messages -> fold_001
		await session.sendMessage({ content: "Turn 1" })
		const ranges1 = await session.getFoldedRangesAsync(thread.id)
		expect(ranges1.length).toBe(1)
		expect(ranges1[0].rangeId).toBe("fold_001")
		const fold001Ids = new Set(ranges1[0].messageIds || [])

		// Send 3 subsequent small turns: none should re-fold or create fold_002, fold_003, etc.
		for (let turn = 2; turn <= 4; turn++) {
			await session.sendMessage({ content: `Small follow-up turn ${turn}` })
			const currentRanges = await session.getFoldedRangesAsync(thread.id)
			expect(currentRanges.length).toBe(1)
			expect(currentRanges[0].rangeId).toBe("fold_001")

			// Check SQLite persisted metadata: foldedRanges must have exactly 1 entry
			const threadInDb = await store.getThreadById({ threadId: thread.id })
			const dbRanges = (threadInDb?.metadata as any)?.foldedRanges || []
			expect(dbRanges.length).toBe(1)
			expect(dbRanges[0].rangeId).toBe("fold_001")

			// Verify in prompt: earlier folded messages (seed_0, etc.) are NOT in active coreMessages
			const latestPrompt = capturedPrompts[capturedPrompts.length - 1]
			for (const foldedId of fold001Ids) {
				const idInPrompt = latestPrompt.some((p: any) =>
					JSON.stringify(p).includes(
						`Seeded message ${foldedId.replace("seed_", "")}:`,
					),
				)
				expect(idInPrompt).toBe(false)
			}
		}

		await storage.close()
	})

	it("accounts for observational memory block in prompt budget and caps formatObservationalMemory size", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		let capturedPrompts: any[] = []
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				capturedPrompts.push(options.prompt)
				return reply("ok")
			},
		})

		// A huge observation log (> 20,000 chars)
		const hugeObservations = "- Observation item: ".repeat(1_000)
		const memory = {
			observe: vi.fn(async () => ({
				activeObservations: hugeObservations,
				observedMessageIds: [],
				kind: "observed" as const,
				blocked: false,
			})),
			getSystemMessage: vi.fn(async () => hugeObservations),
		}

		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base instructions",
			model: () => model,
			contextWindow: 10_000,
			tools: {},
		})

		const controller = new AgentController({ storage, agent, memory })
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r-om-budget",
			contextWindow: 10_000,
		})
		const thread = await session.thread.create({ title: "OM Budget Test" })

		await session.sendMessage({ content: "Hello with huge OM" })

		// Verify that huge observations injected via formatObservationalMemory were truncated to safe bounds
		const latestPrompt = capturedPrompts[capturedPrompts.length - 1]
		const systemMessage = latestPrompt.find((p: any) => p.role === "system")
		expect(systemMessage).toBeDefined()
		// Must not exceed safe token budget (should be bounded by ~4,000 tokens / 16,000 chars)
		expect(systemMessage.content.length).toBeLessThan(hugeObservations.length)
		expect(systemMessage.content).toContain("[Truncated")

		await storage.close()
	})

	it("evicts retrieve_folded_messages output on the immediately following turn to prevent oscillation loops", async () => {
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

		const controller = new AgentController({ storage, agent })
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r-rfm-evict",
			contextWindow: 4_000,
		})
		const thread = await session.thread.create({
			title: "Immediate RFM Eviction",
		})

		const now = Date.now()
		// Seed Turn 1 where retrieve_folded_messages was called and returned 5000 chars of folded history
		await store.saveMessages({
			messages: [
				{
					id: "u1",
					role: "user",
					content: "Show past logs",
					threadId: thread.id,
					resourceId: "r-rfm-evict",
					createdAt: new Date(now - 2000),
				},
				{
					id: "a1",
					role: "assistant",
					content: {
						format: 2,
						parts: [
							{
								type: "tool-call",
								toolCallId: "call_rfm_immediate",
								toolName: "retrieve_folded_messages",
								args: { rangeId: "fold_001" },
							},
							{
								type: "tool-result",
								toolCallId: "call_rfm_immediate",
								toolName: "retrieve_folded_messages",
								result:
									"# Retrieved Folded History [fold_001]\n" +
									"Large past logs detail line... ".repeat(300),
							},
							{
								type: "text",
								text: "I inspected the past logs and identified the error.",
							},
						],
					},
					threadId: thread.id,
					resourceId: "r-rfm-evict",
					createdAt: new Date(now - 1000),
				},
			],
		})

		// Now send Turn 2 (IMMEDIATELY following turn 1)
		await session.sendMessage({
			content: "Now please apply the fix",
			threadId: thread.id,
		})

		// In Turn 2's prompt, retrieve_folded_messages MUST ALREADY BE EVICTED
		// rather than waiting 2 full assistant turns, so it does not trigger an immediate re-fold!
		const turn2Prompt = capturedPrompts[capturedPrompts.length - 1]
		const toolMessage = turn2Prompt.find((p: any) => p.role === "tool")
		expect(toolMessage).toBeDefined()
		const rfmResultPart = toolMessage.content.find(
			(c: any) => c.toolCallId === "call_rfm_immediate",
		)
		expect(rfmResultPart).toBeDefined()
		expect(rfmResultPart.output.value).toContain(
			"Retrieved History (fold_001): Inspected by model in previous turn. Content evicted to prevent context oscillation.",
		)
		// The 5,000+ chars dump must NOT be present
		expect(rfmResultPart.output.value).not.toContain(
			"Large past logs detail line",
		)

		// Verify no new redundant range was generated
		const ranges = await session.getFoldedRangesAsync(thread.id)
		expect(ranges.length).toBe(0) // No ranges folded in this thread yet

		await storage.close()
	})

	it("cleans up _foldedRanges and _tokenCalibrationByThread on thread.delete, preventing memory leaks", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const store = await storage.getStore("memory")

		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("ok"),
		})
		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base",
			model: () => model,
			contextWindow: 4_000,
			tools: {},
		})
		const controller = new AgentController({ storage, agent })
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r-leak",
			contextWindow: 4_000,
		})
		const thread = await session.thread.create({ title: "Leak Test Thread" })

		// Record a folded range and a token calibration ratio
		await session.recordFoldedRange(
			thread.id,
			{
				rangeId: "fold_001",
				threadId: thread.id,
				messageCount: 5,
				startIndex: 0,
				createdAt: Date.now(),
				messageIds: ["m1", "m2", "m3", "m4", "m5"],
			},
			store,
		)
		;(session as any)._setTokenCalibration(thread.id, 1.25)

		expect(session.getFoldedRanges(thread.id).length).toBe(1)
		expect((session as any)._foldedRanges.has(thread.id)).toBe(true)
		expect((session as any)._tokenCalibrationByThread.has(thread.id)).toBe(true)

		// Delete thread
		await session.thread.delete({ threadId: thread.id })

		// Both memory maps must be cleanly purged
		expect((session as any)._foldedRanges.has(thread.id)).toBe(false)
		expect((session as any)._tokenCalibrationByThread.has(thread.id)).toBe(
			false,
		)
		expect(session.getFoldedRanges(thread.id)).toEqual([])

		await storage.close()
	})

	it("synchronizes fresh folded ranges from disk when modified externally, avoiding cache short-circuit", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const store = await storage.getStore("memory")

		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("ok"),
		})
		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base",
			model: () => model,
			contextWindow: 4_000,
			tools: {},
		})
		const controller = new AgentController({ storage, agent })
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r-stale",
			contextWindow: 4_000,
		})
		const thread = await session.thread.create({ title: "Stale Cache Test" })

		// Initial state: record fold_001 in session
		await session.recordFoldedRange(
			thread.id,
			{
				rangeId: "fold_001",
				threadId: thread.id,
				messageCount: 3,
				startIndex: 0,
				createdAt: Date.now(),
				messageIds: ["m1", "m2", "m3"],
			},
			store,
		)

		const initialRanges = await session.getFoldedRangesAsync(thread.id)
		expect(initialRanges.map((r) => r.rangeId)).toEqual(["fold_001"])

		// Simulate external update directly in SQLite store (e.g. from another window/process)
		const threadRec = await store.getThreadById({ threadId: thread.id })
		await store.updateThread({
			id: thread.id,
			metadata: {
				...(threadRec.metadata || {}),
				foldedRanges: [
					{
						rangeId: "fold_001",
						threadId: thread.id,
						messageCount: 3,
						startIndex: 0,
						createdAt: Date.now(),
						messageIds: ["m1", "m2", "m3"],
					},
					{
						rangeId: "fold_002",
						threadId: thread.id,
						messageCount: 4,
						startIndex: 3,
						createdAt: Date.now(),
						messageIds: ["m4", "m5", "m6", "m7"],
					},
				],
			},
		})

		// getFoldedRangesAsync MUST NOT short-circuit on existing in-memory fold_001;
		// it must re-hydrate from SQLite and reflect fold_002!
		const refreshedRanges = await session.getFoldedRangesAsync(thread.id)
		expect(refreshedRanges.map((r) => r.rangeId)).toEqual([
			"fold_001",
			"fold_002",
		])

		// Simulate external deletion of all ranges in SQLite store
		const threadRec2 = await store.getThreadById({ threadId: thread.id })
		await store.updateThread({
			id: thread.id,
			metadata: {
				...(threadRec2.metadata || {}),
				foldedRanges: [],
			},
		})

		const clearedRanges = await session.getFoldedRangesAsync(thread.id)
		expect(clearedRanges).toEqual([])

		await storage.close()
	})

	it("sorts pattern matching by length descending so specific models never match shorter prefixes", () => {
		// Specific Qwen model must match 128k, not generic 'qwen' (32k)
		expect(resolveModelContextWindow(undefined, "qwen-2.5-coder-32b")).toBe(
			128_000,
		)
		expect(resolveModelContextWindow(undefined, "qwen-turbo")).toBe(128_000)
		expect(resolveModelContextWindow(undefined, "qwen-base")).toBe(32_768)

		// Specific Llama model must match 128k, not generic 'llama-3' (8k)
		expect(resolveModelContextWindow(undefined, "llama-3.1-70b")).toBe(128_000)
		expect(resolveModelContextWindow(undefined, "llama-3-8b")).toBe(8_192)

		// Specific GPT-4 model must match 32k/128k, not generic 'gpt-4' (8k)
		expect(resolveModelContextWindow(undefined, "gpt-4-32k")).toBe(32_768)
		expect(resolveModelContextWindow(undefined, "gpt-4o")).toBe(128_000)
		expect(resolveModelContextWindow(undefined, "gpt-4")).toBe(8_192)
	})

	it("accurately estimates tool schema tokens and caps vision image tokens", () => {
		// 1. Tool schema tokens calculation
		const tools = {
			test_tool: {
				description: "A tool that does testing with extensive parameters",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string", description: "Search query string" },
						count: { type: "number", description: "Number of items to return" },
						options: {
							type: "object",
							properties: {
								verbose: { type: "boolean" },
								tags: { type: "array", items: { type: "string" } },
							},
						},
					},
					required: ["query"],
				},
			},
		}
		const schemaTokens = estimateToolsSchemaTokens(tools)
		expect(schemaTokens).toBeGreaterThan(50)
		expect(schemaTokens).toBeLessThan(300)

		// 2. Vision tokens calculation: raw base64 string must NOT explode into 100k tokens
		const hugeBase64 = "a".repeat(400_000) // 400KB base64 payload
		const imageMsg = {
			role: "user",
			content: [
				{ type: "text", text: "Look at this screenshot" },
				{ type: "image", image: hugeBase64, mediaType: "image/png" },
			],
		}
		const estimated = estimateMessageTokens(imageMsg)
		// Should count ~6 tokens for text + ~1200 tokens for image = ~1206, NOT 100,006!
		expect(estimated).toBeGreaterThan(1_100)
		expect(estimated).toBeLessThan(1_500)

		// 3. estimateMessagesTokens aggregates cleanly
		const multiMsg = estimateMessagesTokens([
			{ role: "user", content: "hello world" },
			imageMsg,
		])
		expect(multiMsg.tokensByMessage.length).toBe(2)
		expect(multiMsg.tokensByMessage[0]).toBe(3)
		expect(multiMsg.tokensByMessage[1]).toBe(estimated)
		expect(multiMsg.totalTokens).toBe(3 + estimated)

		// 4. Unified weighting: Chinese text does not get underestimated by /4
		const chineseText =
			"这是一段用于测试中文分词与Token估算的文本，确保不再使用除以4硬编码"
		const weightedTokens = Math.ceil(estimateTextTokens(chineseText))
		const legacyDividedByFour = Math.ceil(chineseText.length / 4)
		// Weighted estimation (~text.length / 1.3) is roughly 3x legacy (/4)
		expect(weightedTokens).toBeGreaterThan(legacyDividedByFour * 2.5)

		// 5. Tool schemas with Chinese descriptions also use the unified weighted estimation
		const chineseTool = {
			chinese_tool: {
				description:
					"这是一个具备中文详细描述的工具，用于测试Schema Token估算与系统提示词比率的一致性",
				parameters: {
					type: "object",
					properties: {
						param: { type: "string", description: "参数描述文本" },
					},
				},
			},
		}
		const chineseToolTokens = estimateToolsSchemaTokens(chineseTool)
		expect(chineseToolTokens).toBeGreaterThan(30)
	})
})
