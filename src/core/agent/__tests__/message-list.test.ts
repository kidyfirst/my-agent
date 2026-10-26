import { describe, it, expect } from "vitest"
import { MessageList, type MyAgentDBMessage } from "../index.js"

describe("MessageList & Message Types", () => {
	it("normalizes and converts plain user messages to db format", () => {
		const list = new MessageList({
			threadId: "test-thread",
			resourceId: "test-resource",
		})

		list.add([{ role: "user", content: "Hello world" }], "memory")
		const dbMessages: MyAgentDBMessage[] = list.get.all.db()

		expect(dbMessages).toHaveLength(1)
		const msg = dbMessages[0]
		expect(msg.role).toBe("user")
		expect(msg.threadId).toBe("test-thread")
		expect(msg.resourceId).toBe("test-resource")
		expect(msg.id).toBeDefined()
		expect(msg.createdAt).toBeInstanceOf(Date)
		expect(msg.content.content).toBe("Hello world")
		expect(msg.content.format).toBe(2)
		expect(msg.content.parts).toBeDefined()
	})

	it("preserves existing MyAgentDBMessage format", () => {
		const now = new Date()
		const existingMsg: MyAgentDBMessage = {
			id: "msg-123",
			role: "assistant",
			createdAt: now,
			threadId: "thread-1",
			resourceId: "resource-1",
			content: {
				format: 2,
				parts: [{ type: "text", text: "Answer" }],
				content: "Answer",
			},
		}

		const list = new MessageList()
		list.add([existingMsg], "memory")
		const dbMessages = list.get.all.db()

		expect(dbMessages).toHaveLength(1)
		expect(dbMessages[0].id).toBe("msg-123")
		expect(dbMessages[0].role).toBe("assistant")
		expect(dbMessages[0].content.content).toBe("Answer")
	})

	it("handles custom ID generator", () => {
		let counter = 1
		const list = new MessageList({
			generateMessageId: () => `custom-id-${counter++}`,
		})

		list.add([{ role: "user", content: "test" }])
		const dbMessages = list.get.all.db()
		expect(dbMessages[0].id).toBe("custom-id-1")
	})
})
