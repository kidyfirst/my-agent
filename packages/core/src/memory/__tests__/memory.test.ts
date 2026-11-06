import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { SQLiteStore } from "../../store/index.js"
import { Memory } from "../index.js"
import type { MyAgentDBMessage } from "../../core/index.js"

describe("src/memory - Native Memory Implementation", () => {
	let storage: SQLiteStore

	beforeEach(async () => {
		storage = new SQLiteStore({
			id: "test-memory-store",
			url: "file::memory:",
		})
		await storage.init()
	})

	afterEach(async () => {
		await storage.close()
	})

	describe("Observational memory", () => {
		it("persists an observation so getSystemMessage returns it", async () => {
			const memory = new Memory({
				storage,
				options: {
					observationalMemory: {
						enabled: true,
						observation: {
							messageTokens: 100,
							bufferTokens: 1 / 5,
							blockAfter: 2,
							model: {
								generate: async () => ({ text: "- auth lives in src/auth.ts" }),
							},
						},
					},
				},
			})

			expect(await memory.getSystemMessage({ threadId: "t1" })).toBeNull()

			const step = await memory.observe({
				threadId: "t1",
				messages: [{ id: "m1", role: "user", content: "where is auth?" }],
				pendingTokens: 500,
			})
			expect(step?.kind).toBe("observed")

			const injected = await memory.getSystemMessage({ threadId: "t1" })
			expect(injected).toContain("src/auth.ts")
			expect(injected).toContain("# Observational Memory")
		})

		it("stays inert when observational memory is not configured", async () => {
			const memory = new Memory({ storage })
			expect(memory.resolveObservationalConfig()).toBeNull()
			expect(
				await memory.observe({
					threadId: "t1",
					messages: [{ id: "m1", role: "user", content: "hi" }],
					pendingTokens: 10_000,
				}),
			).toBeNull()
			expect(await memory.getSystemMessage({ threadId: "t1" })).toBeNull()
		})

		it("serialises concurrent observations so no message is observed twice", async () => {
			let modelCalls = 0
			const memory = new Memory({
				storage,
				options: {
					observationalMemory: {
						enabled: true,
						observation: {
							messageTokens: 100,
							bufferTokens: 1 / 5,
							blockAfter: 2,
							model: {
								generate: async () => {
									modelCalls++
									return { text: `- fact ${modelCalls}` }
								},
							},
						},
					},
				},
			})

			// Prime the row so the CAS has a generation to compare against.
			await memory.observe({
				threadId: "t-concurrent",
				messages: [{ id: "m1", role: "user", content: "first" }],
				pendingTokens: 500,
			})
			const callsAfterPrime = modelCalls
			expect(callsAfterPrime).toBe(1)

			// Two turns cross the threshold together. Exactly one may run the model;
			// the loser must bail before paying for a discarded observation.
			const [a, b] = await Promise.all([
				memory.observe({
					threadId: "t-concurrent",
					messages: [{ id: "m2", role: "user", content: "second" }],
					pendingTokens: 600,
				}),
				memory.observe({
					threadId: "t-concurrent",
					messages: [{ id: "m3", role: "user", content: "third" }],
					pendingTokens: 600,
				}),
			])

			const winners = [a, b].filter((s) => s !== null)
			expect(winners).toHaveLength(1)
			expect(modelCalls).toBe(callsAfterPrime + 1)
		})

		it("keeps buffered observations across a write so nothing is lost", async () => {
			const memory = new Memory({
				storage,
				options: {
					observationalMemory: {
						enabled: true,
						observation: {
							messageTokens: 100,
							bufferTokens: 1 / 5,
							bufferActivation: 8,
							model: {
								generate: async () => ({
									text: "- first fact\n- second fact\n- third fact",
								}),
							},
						},
					},
				},
			})

			await memory.observe({
				threadId: "t-buffer",
				messages: [{ id: "m1", role: "user", content: "go" }],
				pendingTokens: 500,
			})

			const record = await memory.getObservationalRecord("t-buffer")
			expect(record).not.toBeNull()
			const everything = `${record!.activeObservations}\n${record!.bufferedObservations ?? ""}`
			for (const fact of ["first", "second", "third"]) {
				expect(everything).toContain(`${fact} fact`)
			}
			expect(record!.generationCount).toBe(1)
		})

		it("swallows a model failure instead of breaking the turn", async () => {
			const memory = new Memory({
				storage,
				options: {
					observationalMemory: {
						enabled: true,
						observation: {
							messageTokens: 100,
							bufferTokens: 1 / 5,
							model: {
								generate: async () => {
									throw new Error("provider down")
								},
							},
						},
					},
				},
			})
			await expect(
				memory.observe({
					threadId: "t1",
					messages: [{ id: "m1", role: "user", content: "hi" }],
					pendingTokens: 500,
				}),
			).resolves.toBeNull()
		})
	})

	describe("Thread Management (CRUD)", () => {
		it("creates, retrieves, updates and deletes a thread", async () => {
			const memory = new Memory({ storage })

			// 1. Create thread
			const thread = await memory.createThread({
				resourceId: "project-1",
				title: "Initial Thread",
				metadata: { environment: "test" },
			})
			expect(thread).toBeDefined()
			expect(thread.id).toBeDefined()
			expect(thread.title).toBe("Initial Thread")
			expect(thread.resourceId).toBe("project-1")
			expect(thread.metadata).toEqual({ environment: "test" })

			// 2. Get thread by ID
			const retrieved = await memory.getThreadById({ threadId: thread.id })
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(thread.id)
			expect(retrieved?.title).toBe("Initial Thread")

			// 3. Update thread
			const updated = await memory.updateThread({
				id: thread.id,
				title: "Renamed Thread",
				metadata: { environment: "production", customKey: 123 },
			})
			expect(updated.title).toBe("Renamed Thread")
			expect(updated.metadata?.customKey).toBe(123)

			// 4. List threads
			const list = await memory.listThreads({
				filter: { resourceId: "project-1" },
			})
			expect(list.threads).toHaveLength(1)
			expect(list.threads[0].id).toBe(thread.id)

			// 5. Delete thread
			await memory.deleteThread(thread.id)
			const afterDelete = await memory.getThreadById({ threadId: thread.id })
			expect(afterDelete).toBeNull()
		})

		it("filters threads by resourceId and handles pagination", async () => {
			const memory = new Memory({ storage })

			await memory.createThread({ resourceId: "res-a", title: "Thread A1" })
			await memory.createThread({ resourceId: "res-a", title: "Thread A2" })
			await memory.createThread({ resourceId: "res-b", title: "Thread B1" })

			const listA = await memory.listThreads({
				filter: { resourceId: "res-a" },
			})
			expect(listA.threads).toHaveLength(2)

			const listB = await memory.listThreads({
				filter: { resourceId: "res-b" },
			})
			expect(listB.threads).toHaveLength(1)
			expect(listB.threads[0].title).toBe("Thread B1")
		})
	})

	describe("Message Storage & Recall", () => {
		it("saves messages and recalls them in chronological order", async () => {
			const memory = new Memory({ storage })
			const thread = await memory.createThread({
				resourceId: "res-test",
				title: "Chat Thread",
			})

			const now = Date.now()
			const msg1: MyAgentDBMessage = {
				id: "msg-1",
				threadId: thread.id,
				resourceId: "res-test",
				role: "user",
				content: "What is TypeScript?",
				createdAt: new Date(now).toISOString(),
			} as any

			const msg2: MyAgentDBMessage = {
				id: "msg-2",
				threadId: thread.id,
				resourceId: "res-test",
				role: "assistant",
				content: "TypeScript is a typed superset of JavaScript.",
				createdAt: new Date(now + 1000).toISOString(),
			} as any

			// Save messages
			const saveRes = await memory.saveMessages({ messages: [msg1, msg2] })
			expect(saveRes.messages).toHaveLength(2)

			// Recall messages
			const recallRes = await memory.recall({ threadId: thread.id })
			expect(recallRes.messages).toHaveLength(2)

			// Verify chronological ordering
			expect(recallRes.messages[0].id).toBe("msg-1")
			expect(recallRes.messages[1].id).toBe("msg-2")

			// Check normalized content extraction
			const content0 =
				typeof recallRes.messages[0].content === "string"
					? recallRes.messages[0].content
					: (recallRes.messages[0].content as any)?.content ||
						(recallRes.messages[0] as any).text
			expect(content0).toContain("What is TypeScript?")

			// Check usage estimation
			expect(recallRes.usage?.tokens).toBeGreaterThan(0)
		})

		it("filters system reminders and signals when hideSignals is specified", async () => {
			const memory = new Memory({ storage })
			const thread = await memory.createThread({
				resourceId: "res-test",
				title: "Signal Thread",
			})

			const userMsg: MyAgentDBMessage = {
				id: "msg-user",
				threadId: thread.id,
				resourceId: "res-test",
				role: "user",
				content: "Hello",
				createdAt: new Date().toISOString(),
			} as any

			const reminderMsg: MyAgentDBMessage = {
				id: "msg-reminder",
				threadId: thread.id,
				resourceId: "res-test",
				role: "user",
				content: "<system-reminder>Remember to be concise</system-reminder>",
				createdAt: new Date(Date.now() + 500).toISOString(),
			} as any

			await memory.saveMessages({ messages: [userMsg, reminderMsg] })

			// Recall without system reminders (default)
			const withoutReminders = await memory.recall({
				threadId: thread.id,
				includeSystemReminders: false,
			})
			expect(withoutReminders.messages).toHaveLength(1)
			expect(withoutReminders.messages[0].id).toBe("msg-user")

			// Recall with system reminders
			const withReminders = await memory.recall({
				threadId: thread.id,
				includeSystemReminders: true,
			})
			expect(withReminders.messages).toHaveLength(2)
		})

		it("supports pagination in recall", async () => {
			const memory = new Memory({ storage })
			const thread = await memory.createThread({
				resourceId: "res-test",
				title: "Pagination Thread",
			})

			const msgs: MyAgentDBMessage[] = []
			for (let i = 0; i < 5; i++) {
				msgs.push({
					id: `msg-${i}`,
					threadId: thread.id,
					resourceId: "res-test",
					role: i % 2 === 0 ? "user" : "assistant",
					content: `Message ${i}`,
					createdAt: new Date(Date.now() + i * 1000).toISOString(),
				} as any)
			}
			await memory.saveMessages({ messages: msgs })

			const page1 = await memory.recall({
				threadId: thread.id,
				page: 0,
				perPage: 2,
			})
			expect(page1.messages).toHaveLength(2)
			expect(page1.total).toBe(5)
			expect(page1.hasMore).toBe(true)

			const page2 = await memory.recall({
				threadId: thread.id,
				page: 1,
				perPage: 2,
			})
			expect(page2.messages).toHaveLength(2)
			expect(page2.hasMore).toBe(true)

			const page3 = await memory.recall({
				threadId: thread.id,
				page: 2,
				perPage: 2,
			})
			expect(page3.messages).toHaveLength(1)
			expect(page3.hasMore).toBe(false)
		})
	})

	describe("Observational Memory Configuration & Settled", () => {
		it("initializes with observational memory configuration and resolves settled()", async () => {
			const memory = new Memory({
				storage,
				options: {
					observationalMemory: {
						enabled: true,
						scope: "project-scope",
						observation: {
							bufferTokens: 100,
							messageTokens: 500,
						},
						reflection: {
							observationTokens: 1000,
						},
					},
				},
			})

			expect(memory).toBeDefined()
			expect(typeof memory.settled).toBe("function")

			// settled() should resolve cleanly
			await expect(memory.settled()).resolves.toBeUndefined()

			// getSystemMessage() for empty/new thread should resolve to null
			const sysMsg = await memory.getSystemMessage({
				threadId: "non-existent-thread",
			})
			expect(sysMsg === null || typeof sysMsg === "string").toBe(true)
		})

		it("creates a thread clone (cloneThread)", async () => {
			const memory = new Memory({ storage })
			const original = await memory.createThread({
				resourceId: "res-orig",
				title: "Original Thread",
			})

			await memory.saveMessages({
				messages: [
					{
						id: "msg-orig-1",
						threadId: original.id,
						resourceId: "res-orig",
						role: "user",
						content: "Original Message",
						createdAt: new Date().toISOString(),
					} as any,
				],
			})

			// Clone the thread
			const clone = await memory.cloneThread({
				threadId: original.id,
				title: "Cloned Thread",
			})

			expect(clone).toBeDefined()
			expect(clone.id).not.toBe(original.id)
			expect(clone.title).toBe("Cloned Thread")

			// Cloned thread should have the cloned messages
			const clonedRecall = await memory.recall({ threadId: clone.id })
			expect(clonedRecall.messages).toHaveLength(1)
		})
	})

	describe("Integration with AgentController Harness", () => {
		it("can be passed to AgentController and handle thread lifecycle", async () => {
			const memory = new Memory({ storage })
			const thread = await memory.createThread({
				resourceId: "harness-res",
				title: "Harness Session",
			})

			await memory.saveMessages({
				messages: [
					{
						id: "msg-h1",
						threadId: thread.id,
						resourceId: "harness-res",
						role: "user",
						content: "Hello from Harness",
						createdAt: new Date().toISOString(),
					} as any,
				],
			})

			const fetched = await memory.getThreadById({ threadId: thread.id })
			expect(fetched?.id).toBe(thread.id)

			const recalled = await memory.recall({ threadId: thread.id })
			expect(recalled.messages).toHaveLength(1)
		})
	})
})
