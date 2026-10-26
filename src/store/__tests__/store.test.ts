import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { SQLiteStore } from "../index.js"
import { Memory } from "../../memory/index.js"
import type { MyAgentDBMessage } from "../../core/index.js"

describe("src/store - Native SQLiteStore Implementation", () => {
	let store: SQLiteStore

	beforeEach(async () => {
		store = new SQLiteStore({
			id: "test-sqlite-store",
			url: "file::memory:",
		})
		await store.init()
	})

	afterEach(async () => {
		await store.close()
	})

	describe("Initialization & Lifecycle", () => {
		it("initializes SQLiteStore and provides domain store 'memory'", async () => {
			expect(store.id).toBe("test-sqlite-store")
			const memoryStore = await store.getStore("memory")
			expect(memoryStore).toBeDefined()
			expect(typeof memoryStore.getThreadById).toBe("function")
			expect(typeof memoryStore.saveThread).toBe("function")
			expect(typeof memoryStore.listThreads).toBe("function")
			expect(typeof memoryStore.saveMessages).toBe("function")
			expect(typeof memoryStore.listMessages).toBe("function")
		})

		it("returns undefined for unknown store domains", async () => {
			const unknown = await store.getStore("unknown-domain")
			expect(unknown).toBeUndefined()
		})
	})

	describe("Thread CRUD Operations", () => {
		it("saves, retrieves, updates and deletes threads", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			// 1. Save thread
			const thread = await mem.saveThread({
				thread: {
					id: "t-1",
					resourceId: "res-1",
					title: "Thread One",
					metadata: { env: "test", priority: 1 },
					createdAt: now,
					updatedAt: now,
				},
			})
			expect(thread.id).toBe("t-1")
			expect(thread.title).toBe("Thread One")

			// 2. Get thread by ID
			const retrieved = await mem.getThreadById({ threadId: "t-1" })
			expect(retrieved).not.toBeNull()
			expect(retrieved?.id).toBe("t-1")
			expect(retrieved?.title).toBe("Thread One")
			expect(retrieved?.resourceId).toBe("res-1")
			expect(retrieved?.metadata).toEqual({ env: "test", priority: 1 })

			// 3. Update thread
			const updated = await mem.updateThread({
				id: "t-1",
				title: "Thread Renamed",
				metadata: { priority: 2, tags: ["agent"] },
			})
			expect(updated.title).toBe("Thread Renamed")
			expect(updated.metadata?.priority).toBe(2)
			expect(updated.metadata?.env).toBe("test")

			// 4. List threads with filter
			const list = await mem.listThreads({
				filter: { resourceId: "res-1" },
			})
			expect(list.threads).toHaveLength(1)
			expect(list.threads[0].id).toBe("t-1")
			expect(list.total).toBe(1)

			// 5. Delete thread
			await mem.deleteThread({ threadId: "t-1" })
			const afterDelete = await mem.getThreadById({ threadId: "t-1" })
			expect(afterDelete).toBeNull()
		})

		it("supports listThreads pagination and metadata filtering", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			for (let i = 1; i <= 5; i++) {
				await mem.saveThread({
					thread: {
						id: `t-bulk-${i}`,
						resourceId: i <= 3 ? "res-a" : "res-b",
						title: `Thread ${i}`,
						metadata: { active: i % 2 === 1 },
						createdAt: new Date(now.getTime() + i * 1000),
						updatedAt: new Date(now.getTime() + i * 1000),
					},
				})
			}

			// Filter by resourceId
			const resAList = await mem.listThreads({
				filter: { resourceId: "res-a" },
			})
			expect(resAList.threads).toHaveLength(3)
			expect(resAList.total).toBe(3)

			// Pagination
			const page1 = await mem.listThreads({
				perPage: 2,
				page: 0,
			})
			expect(page1.threads).toHaveLength(2)
			expect(page1.hasMore).toBe(true)
			expect(page1.total).toBe(5)

			const page2 = await mem.listThreads({
				perPage: 2,
				page: 1,
			})
			expect(page2.threads).toHaveLength(2)
			expect(page2.hasMore).toBe(true)

			const page3 = await mem.listThreads({
				perPage: 2,
				page: 2,
			})
			expect(page3.threads).toHaveLength(1)
			expect(page3.hasMore).toBe(false)
		})

		it("clones / copies thread with all messages", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			await mem.saveThread({
				thread: {
					id: "source-thread",
					resourceId: "res-source",
					title: "Source Thread",
					metadata: { original: true },
					createdAt: now,
					updatedAt: now,
				},
			})

			await mem.saveMessages({
				messages: [
					{
						id: "msg-src-1",
						threadId: "source-thread",
						resourceId: "res-source",
						role: "user",
						type: "v2",
						content: "Hello",
						createdAt: new Date(now.getTime() + 100),
					},
					{
						id: "msg-src-2",
						threadId: "source-thread",
						resourceId: "res-source",
						role: "assistant",
						type: "v2",
						content: "World",
						createdAt: new Date(now.getTime() + 200),
					},
				],
			})

			// Copy thread
			const copyResult = await mem.copyThread({
				sourceThreadId: "source-thread",
				newThreadId: "copied-thread",
				title: "Copied Thread Title",
			})

			expect(copyResult.thread).toBeDefined()
			expect(copyResult.thread.id).toBe("copied-thread")
			expect(copyResult.thread.title).toBe("Copied Thread Title")

			// Verify messages were copied under new thread
			const copiedMessages = await mem.listMessages({
				threadId: "copied-thread",
			})
			expect(copiedMessages.messages).toHaveLength(2)
			expect(copiedMessages.messages[0].content).toBe("Hello")
			expect(copiedMessages.messages[1].content).toBe("World")
			// New message IDs were assigned
			expect(copiedMessages.messages[0].id).not.toBe("msg-src-1")
		})
	})

	describe("Message CRUD Operations", () => {
		it("saves messages and recalls them in chronological order", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			await mem.saveThread({
				thread: {
					id: "t-msg",
					resourceId: "res-msg",
					title: "Msg Test",
					createdAt: now,
					updatedAt: now,
				},
			})

			const messages: MyAgentDBMessage[] = [
				{
					id: "m-1",
					threadId: "t-msg",
					resourceId: "res-msg",
					role: "user",
					type: "v2",
					content: "First Message",
					createdAt: new Date(now.getTime() + 1000),
				},
				{
					id: "m-2",
					threadId: "t-msg",
					resourceId: "res-msg",
					role: "assistant",
					type: "v2",
					content: "Second Message",
					createdAt: new Date(now.getTime() + 2000),
				},
			]

			const saveRes = await mem.saveMessages({ messages })
			expect(saveRes.messages).toHaveLength(2)

			const listRes = await mem.listMessages({
				threadId: "t-msg",
			})
			expect(listRes.messages).toHaveLength(2)
			expect(listRes.messages[0].id).toBe("m-1")
			expect(listRes.messages[1].id).toBe("m-2")
			expect(listRes.total).toBe(2)
		})

		it("updates message on conflict and handles deleteMessages", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			await mem.saveThread({
				thread: {
					id: "t-conflict",
					resourceId: "res-msg",
					title: "Conflict Test",
					createdAt: now,
					updatedAt: now,
				},
			})

			await mem.saveMessages({
				messages: [
					{
						id: "m-unique",
						threadId: "t-conflict",
						resourceId: "res-msg",
						role: "user",
						type: "v2",
						content: "Original Content",
						createdAt: now,
					},
				],
			})

			// Upsert with updated content
			await mem.saveMessages({
				messages: [
					{
						id: "m-unique",
						threadId: "t-conflict",
						resourceId: "res-msg",
						role: "user",
						type: "v2",
						content: "Updated Content",
						createdAt: now,
					},
				],
			})

			const list = await mem.listMessages({ threadId: "t-conflict" })
			expect(list.messages).toHaveLength(1)
			expect(list.messages[0].content).toBe("Updated Content")

			// Delete message
			await mem.deleteMessages(["m-unique"])
			const afterDelete = await mem.listMessages({ threadId: "t-conflict" })
			expect(afterDelete.messages).toHaveLength(0)
		})

		it("persists durationMs in saveMessages and updateMessageDuration", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			await mem.saveThread({
				thread: {
					id: "t-duration",
					resourceId: "res-msg",
					title: "Duration Test",
					createdAt: now,
					updatedAt: now,
				},
			})

			await mem.saveMessages({
				messages: [
					{
						id: "m-user-dur",
						threadId: "t-duration",
						role: "user",
						type: "v2",
						content: "How long?",
						createdAt: now,
					},
					{
						id: "m-asst-dur",
						threadId: "t-duration",
						role: "assistant",
						type: "v2",
						content: "Finished task",
						createdAt: new Date(now.getTime() + 1000),
						durationMs: 3400,
					} as any,
				],
			})

			const list = await mem.listMessages({ threadId: "t-duration" })
			expect(list.messages).toHaveLength(2)
			expect((list.messages[1] as any).durationMs).toBe(3400)

			// Update duration via updateMessageDuration
			await mem.updateMessageDuration({
				messageId: "m-asst-dur",
				durationMs: 4200,
			})
			const reloaded = await mem.listMessages({ threadId: "t-duration" })
			expect((reloaded.messages[1] as any).durationMs).toBe(4200)

			// Update by threadId fallback (targets last assistant message)
			await mem.updateMessageDuration({
				threadId: "t-duration",
				durationMs: 5100,
			})
			const byThread = await mem.listMessages({ threadId: "t-duration" })
			expect((byThread.messages[1] as any).durationMs).toBe(5100)
		})

		it("lists all messages without 40-message truncation and supports limit", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			await mem.saveThread({
				thread: {
					id: "t-many",
					resourceId: "res-many",
					title: "Many Messages Test",
					createdAt: now,
					updatedAt: now,
				},
			})

			const messages: MyAgentDBMessage[] = []
			for (let i = 0; i < 50; i++) {
				messages.push({
					id: `m-many-${i}`,
					threadId: "t-many",
					resourceId: i < 25 ? "res-many" : undefined,
					role: i % 2 === 0 ? "user" : "assistant",
					type: "v2",
					content: `Turn ${i}`,
					createdAt: new Date(now.getTime() + i * 1000),
				})
			}
			await mem.saveMessages({ messages })

			// Default listMessages should return all 50 messages, not just 40
			const allRes = await mem.listMessages({ threadId: "t-many" })
			expect(allRes.messages).toHaveLength(50)
			expect(allRes.messages[0].id).toBe("m-many-0")
			expect(allRes.messages[49].id).toBe("m-many-49")

			// Filtering by resourceId still includes messages with null resourceId
			const resFiltered = await mem.listMessages({
				threadId: "t-many",
				resourceId: "res-many",
			})
			expect(resFiltered.messages).toHaveLength(50)

			// Limit should return newest messages oldest-first
			const limitedRes = await mem.listMessages({
				threadId: "t-many",
				limit: 10,
			})
			expect(limitedRes.messages).toHaveLength(10)
			expect(limitedRes.messages[0].id).toBe("m-many-40")
			expect(limitedRes.messages[9].id).toBe("m-many-49")
		})
	})

	describe("Observational Memory Operations", () => {
		it("stores and retrieves observational memory records", async () => {
			const mem = await store.getStore("memory")
			const now = new Date()

			await mem.insertObservationalMemoryRecord({
				id: "om-1",
				lookupKey: "om-key-project-1",
				scope: "project",
				resourceId: "project-1",
				threadId: "thread-om-1",
				activeObservations: "User prefers TypeScript and strict mode.",
				activeObservationsPendingUpdate: null,
				originType: "observation",
				config: JSON.stringify({}),
				generationCount: 1,
				pendingMessageTokens: 0,
				totalTokensObserved: 120,
				observationTokenCount: 15,
				isObserving: false,
				isReflecting: false,
				isBufferingObservation: false,
				isBufferingReflection: false,
				lastBufferedAtTokens: 0,
				createdAt: now,
				updatedAt: now,
			})

			const record = await mem.getObservationalMemory(
				"thread-om-1",
				"project-1",
			)
			expect(record).not.toBeNull()
			expect(record?.activeObservations).toBe(
				"User prefers TypeScript and strict mode.",
			)
			expect(record?.resourceId).toBe("project-1")

			// Update observations
			await mem.updateActiveObservations(
				"thread-om-1",
				"project-1",
				"User also prefers Vitest.",
			)
			const updated = await mem.getObservationalMemory(
				"thread-om-1",
				"project-1",
			)
			expect(updated?.activeObservations).toBe("User also prefers Vitest.")

			// Clear OM
			await mem.clearObservationalMemory("thread-om-1", "project-1")
			const cleared = await mem.getObservationalMemory(
				"thread-om-1",
				"project-1",
			)
			expect(cleared?.activeObservations).toBe("")
		})
	})

	describe("Integration with native Memory class", () => {
		it("works seamlessly when passed into native Memory instance", async () => {
			const memory = new Memory({ storage: store })

			const thread = await memory.createThread({
				resourceId: "integ-project",
				title: "Integration Thread",
				metadata: { integ: true },
			})

			expect(thread.id).toBeDefined()
			expect(thread.title).toBe("Integration Thread")

			await memory.saveMessages({
				messages: [
					{
						id: "integ-msg-1",
						threadId: thread.id,
						resourceId: "integ-project",
						role: "user",
						type: "v2",
						content: "Hello from native Memory via SQLiteStore!",
						createdAt: new Date(),
					},
				],
			})

			const recall = await memory.recall({ threadId: thread.id })
			expect(recall.messages).toHaveLength(1)
			const recalledContent =
				typeof recall.messages[0].content === "string"
					? recall.messages[0].content
					: (recall.messages[0].content as any)?.content ||
						(recall.messages[0].content as any)?.parts?.[0]?.text
			expect(recalledContent).toBe("Hello from native Memory via SQLiteStore!")
		})
	})
})
