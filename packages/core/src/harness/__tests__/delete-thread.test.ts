import { describe, expect, it } from "vitest"
import { createMyAgent } from "../index.js"
import { SQLiteStore } from "../../store/index.js"

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
}

const mockModel: any = {
	specificationVersion: "v3",
	modelId: "mock-model",
	provider: "mock",
	async doStream() {
		const stream = new ReadableStream({
			start(c) {
				c.enqueue({ type: "stream-start", warnings: [] } as any)
				c.enqueue({ type: "text-start", id: "t" } as any)
				c.enqueue({ type: "text-delta", id: "t", delta: "ok" } as any)
				c.enqueue({ type: "text-end", id: "t" } as any)
				c.enqueue({ type: "finish", finishReason: "stop", usage } as any)
				c.close()
			},
		})
		return { stream } as any
	},
}

describe("harness.deleteThread", () => {
	it("removes the thread row and its messages", async () => {
		const storage = new SQLiteStore(":memory:")
		await storage.init()
		const { harness: h } = await createMyAgent({
			storage,
			disableMcp: true,
			disableHooks: true,
			resolveModel: () => mockModel,
		})
		await h.init()

		await h.sendMessage({ content: "在吗" } as any)
		const threadId = h.getCurrentThreadId()
		expect(threadId).toBeTruthy()

		const before = await h.listThreads()
		expect(before.map((t: any) => t.id)).toContain(threadId)

		// The store API expects `{ threadId }`; passing the bare string made the
		// DELETE bind `undefined` and throw, so the row survived every attempt.
		await h.deleteThread({ threadId })

		const after = await h.listThreads()
		expect(after.find((t: any) => t.id === threadId)).toBeUndefined()

		const memStore = await storage.getStore("memory")
		const threadRows = memStore.db
			.prepare("select id from myagent_threads where id = ?")
			.all(threadId)
		expect(threadRows).toHaveLength(0)
		const messageRows = memStore.db
			.prepare("select id from myagent_messages where thread_id = ?")
			.all(threadId)
		expect(messageRows).toHaveLength(0)
	})
})
