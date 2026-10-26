import { describe, it, expect } from "vitest"
import {
	chatReducer,
	initialChatState,
	type QueuedMessage,
} from "../types/chat"

describe("Message Queue in chatReducer", () => {
	it("enqueues messages scoped by threadId (Session Isolation)", () => {
		const msg1: QueuedMessage = {
			id: "q-1",
			threadId: "thread-1",
			content: "Message 1 for thread 1",
			createdAt: new Date().toISOString(),
		}
		const msg2: QueuedMessage = {
			id: "q-2",
			threadId: "thread-2",
			content: "Message 1 for thread 2",
			createdAt: new Date().toISOString(),
		}

		let state = chatReducer(initialChatState, {
			type: "ENQUEUE_MESSAGE",
			threadId: "thread-1",
			message: msg1,
		})

		state = chatReducer(state, {
			type: "ENQUEUE_MESSAGE",
			threadId: "thread-2",
			message: msg2,
		})

		// Thread 1 has msg1, thread 2 has msg2
		expect(state.queuesByThread["thread-1"]).toHaveLength(1)
		expect(state.queuesByThread["thread-1"][0].content).toBe(
			"Message 1 for thread 1",
		)
		expect(state.queuesByThread["thread-2"]).toHaveLength(1)
		expect(state.queuesByThread["thread-2"][0].content).toBe(
			"Message 1 for thread 2",
		)
	})

	it("dequeues messages in FIFO order and removes specific message", () => {
		const msg1: QueuedMessage = {
			id: "q-1",
			threadId: "thread-1",
			content: "First",
			createdAt: new Date().toISOString(),
		}
		const msg2: QueuedMessage = {
			id: "q-2",
			threadId: "thread-1",
			content: "Second",
			createdAt: new Date().toISOString(),
		}

		let state = chatReducer(initialChatState, {
			type: "ENQUEUE_MESSAGE",
			threadId: "thread-1",
			message: msg1,
		})
		state = chatReducer(state, {
			type: "ENQUEUE_MESSAGE",
			threadId: "thread-1",
			message: msg2,
		})

		expect(state.queuesByThread["thread-1"]).toHaveLength(2)

		// Dequeue first message
		state = chatReducer(state, {
			type: "DEQUEUE_MESSAGE",
			threadId: "thread-1",
			id: "q-1",
		})
		expect(state.queuesByThread["thread-1"]).toHaveLength(1)
		expect(state.queuesByThread["thread-1"][0].id).toBe("q-2")

		// Remove second message
		state = chatReducer(state, {
			type: "REMOVE_QUEUED_MESSAGE",
			threadId: "thread-1",
			id: "q-2",
		})
		expect(state.queuesByThread["thread-1"]).toHaveLength(0)
	})

	it("reorders messages in the queue", () => {
		const msg1: QueuedMessage = {
			id: "q-1",
			threadId: "t-1",
			content: "1",
			createdAt: "",
		}
		const msg2: QueuedMessage = {
			id: "q-2",
			threadId: "t-1",
			content: "2",
			createdAt: "",
		}
		const msg3: QueuedMessage = {
			id: "q-3",
			threadId: "t-1",
			content: "3",
			createdAt: "",
		}

		let state = chatReducer(initialChatState, {
			type: "SET_THREAD_QUEUE",
			threadId: "t-1",
			queue: [msg1, msg2, msg3],
		})

		// Reorder: move msg3 to top
		state = chatReducer(state, {
			type: "REORDER_THREAD_QUEUE",
			threadId: "t-1",
			queue: [msg3, msg1, msg2],
		})

		expect(state.queuesByThread["t-1"].map((m) => m.id)).toEqual([
			"q-3",
			"q-1",
			"q-2",
		])
	})

	it("clears queue for a specific thread", () => {
		const msg1: QueuedMessage = {
			id: "q-1",
			threadId: "t-1",
			content: "1",
			createdAt: "",
		}
		const msg2: QueuedMessage = {
			id: "q-2",
			threadId: "t-2",
			content: "2",
			createdAt: "",
		}

		let state = chatReducer(initialChatState, {
			type: "ENQUEUE_MESSAGE",
			threadId: "t-1",
			message: msg1,
		})
		state = chatReducer(state, {
			type: "ENQUEUE_MESSAGE",
			threadId: "t-2",
			message: msg2,
		})

		state = chatReducer(state, {
			type: "CLEAR_THREAD_QUEUE",
			threadId: "t-1",
		})

		expect(state.queuesByThread["t-1"]).toHaveLength(0)
		expect(state.queuesByThread["t-2"]).toHaveLength(1)
	})

	it("handles queue pause state", () => {
		let state = chatReducer(initialChatState, {
			type: "SET_QUEUE_PAUSED",
			paused: true,
		})
		expect(state.isQueuePaused).toBe(true)

		state = chatReducer(state, {
			type: "SET_QUEUE_PAUSED",
			paused: false,
		})
		expect(state.isQueuePaused).toBe(false)
	})
})
