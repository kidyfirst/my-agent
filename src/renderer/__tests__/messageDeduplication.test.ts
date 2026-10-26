import { describe, it, expect } from "vitest"
import {
	chatReducer,
	initialChatState,
	isUserMessage,
	getMessageText,
} from "../types/chat"
import type { Message } from "../types/ipc"

describe("Message Deduplication and Reconciliation in chatReducer", () => {
	it("reconciles optimistic user-* message with incoming harness message_start", () => {
		const optimisticMsg: Message = {
			id: "user-1729510000000",
			role: "user",
			content: [{ type: "text", text: "优化 app.tsx 代码，文件拆分更小些" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		let state = chatReducer(initialChatState, {
			type: "MESSAGE_START",
			message: optimisticMsg,
		})

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("user-1729510000000")

		// Harness emits server message with real DB ID
		const harnessMsg: Message = {
			id: "msg-db-uuid-12345",
			role: "user",
			content: [{ type: "text", text: "优化 app.tsx 代码，文件拆分更小些" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		state = chatReducer(state, {
			type: "MESSAGE_START",
			message: harnessMsg,
		})

		// Should reconcile in place: length remains 1, id updated to server ID
		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("msg-db-uuid-12345")
		expect(getMessageText(state.messages[0])).toBe(
			"优化 app.tsx 代码，文件拆分更小些",
		)
	})

	it("reconciles optimistic message with incoming signal message (role: 'signal')", () => {
		const optimisticMsg: Message = {
			id: "user-1729510000001",
			role: "user",
			content: [{ type: "text", text: "hello world" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		let state = chatReducer(initialChatState, {
			type: "MESSAGE_START",
			message: optimisticMsg,
		})

		expect(state.messages).toHaveLength(1)

		// Harness emits signal user message
		const signalMsg = {
			id: "msg-db-uuid-signal-1",
			role: "signal" as const,
			type: "data-user-message",
			content: JSON.stringify({
				format: 2,
				parts: [{ type: "text", text: "hello world" }],
			}),
			createdAt: "2026-10-21T11:23:00.000Z",
		} as unknown as Message

		state = chatReducer(state, {
			type: "MESSAGE_START",
			message: signalMsg,
		})

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("msg-db-uuid-signal-1")
	})

	it("does not duplicate when MESSAGE_UPDATE and MESSAGE_END arrive with server ID", () => {
		const optimisticMsg: Message = {
			id: "user-1729510000002",
			role: "user",
			content: [{ type: "text", text: "testing update" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		let state = chatReducer(initialChatState, {
			type: "MESSAGE_START",
			message: optimisticMsg,
		})

		// Even if MESSAGE_UPDATE arrives directly with real server ID
		const updateMsg: Message = {
			id: "msg-db-uuid-update-1",
			role: "user",
			content: [{ type: "text", text: "testing update" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		state = chatReducer(state, {
			type: "MESSAGE_UPDATE",
			message: updateMsg,
		})

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("msg-db-uuid-update-1")

		// And then MESSAGE_END arrives
		state = chatReducer(state, {
			type: "MESSAGE_END",
			message: updateMsg,
		})

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("msg-db-uuid-update-1")
	})

	it("preserves attachments from optimistic message when reconciling", () => {
		const optimisticMsg: Message = {
			id: "user-1729510000003",
			role: "user",
			content: [{ type: "text", text: "with attachment" }],
			createdAt: "2026-10-21T11:23:00.000Z",
			attachments: [
				{
					type: "image",
					name: "test.png",
					mimeType: "image/png",
					data: "base64data",
					preview: "data:image/png;base64,...",
				},
			],
		}

		let state = chatReducer(initialChatState, {
			type: "MESSAGE_START",
			message: optimisticMsg,
		})

		const harnessMsg: Message = {
			id: "msg-db-uuid-attach-1",
			role: "user",
			content: [{ type: "text", text: "with attachment" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		state = chatReducer(state, {
			type: "MESSAGE_START",
			message: harnessMsg,
		})

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("msg-db-uuid-attach-1")
		expect(state.messages[0].attachments).toHaveLength(1)
		expect(state.messages[0].attachments?.[0].name).toBe("test.png")
	})

	it("deduplicates consecutive identical user messages in SET_MESSAGES", () => {
		const msgs: Message[] = [
			{
				id: "msg-1",
				role: "user",
				content: [{ type: "text", text: "duplicate message" }],
				createdAt: "2026-10-21T11:23:00.000Z",
			},
			{
				id: "msg-2",
				role: "user",
				content: [{ type: "text", text: "duplicate message" }],
				createdAt: "2026-10-21T11:23:01.000Z",
			},
			{
				id: "msg-3",
				role: "assistant",
				content: [{ type: "text", text: "Response" }],
				createdAt: "2026-10-21T11:23:02.000Z",
			},
		]

		const state = chatReducer(initialChatState, {
			type: "SET_MESSAGES",
			messages: msgs,
		})

		expect(state.messages).toHaveLength(2)
		expect(state.messages[0].id).toBe("msg-1")
		expect(state.messages[1].id).toBe("msg-3")
	})

	it("immediately appends new optimistic user-* messages without overwriting earlier ones", () => {
		const msg1: Message = {
			id: "user-1000",
			role: "user",
			content: [{ type: "text", text: "First turn" }],
			createdAt: "2026-10-21T11:23:00.000Z",
		}

		let state = chatReducer(initialChatState, {
			type: "MESSAGE_START",
			message: msg1,
		})

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0].id).toBe("user-1000")

		// User sends a second turn (e.g. before server reconciled, or new turn)
		const msg2: Message = {
			id: "user-2000",
			role: "user",
			content: [{ type: "text", text: "Second turn" }],
			createdAt: "2026-10-21T11:24:00.000Z",
		}

		state = chatReducer(state, {
			type: "MESSAGE_START",
			message: msg2,
		})

		// Must append immediately for instant UI display
		expect(state.messages).toHaveLength(2)
		expect(state.messages[0].id).toBe("user-1000")
		expect(state.messages[0].content).toEqual([
			{ type: "text", text: "First turn" },
		])
		expect(state.messages[1].id).toBe("user-2000")
		expect(state.messages[1].content).toEqual([
			{ type: "text", text: "Second turn" },
		])
	})

	it("identifies user messages correctly with isUserMessage", () => {
		expect(isUserMessage({ role: "user" })).toBe(true)
		expect(isUserMessage({ role: "signal", type: "data-user-message" })).toBe(
			true,
		)
		expect(isUserMessage({ role: "signal", type: "user" })).toBe(true)
		expect(
			isUserMessage({
				role: "signal",
				content: { metadata: { signal: { type: "user" } } },
			}),
		).toBe(true)
		expect(isUserMessage({ role: "assistant" })).toBe(false)
		expect(isUserMessage({ role: "system" })).toBe(false)
		expect(isUserMessage(undefined)).toBe(false)
	})

	it("preserves changedFiles across SET_MESSAGES reload and ID fallback", () => {
		const assistantMsg: Message = {
			id: "assistant-temp-1",
			role: "assistant",
			content: [{ type: "text", text: "Done editing files" }],
		}

		let state = chatReducer(initialChatState, {
			type: "MESSAGE_START",
			message: assistantMsg,
		})

		// Dispatch SET_MESSAGE_CHANGED_FILES
		state = chatReducer(state, {
			type: "SET_MESSAGE_CHANGED_FILES",
			messageId: "assistant-temp-1",
			files: [
				{
					path: "src/electron/ipc/harness-handlers.ts",
					added: 53,
					deleted: 13,
					status: "modified",
				},
			],
		})

		expect(state.messages[0].changedFiles).toHaveLength(1)
		expect(state.messages[0].changedFiles![0].added).toBe(53)

		// Simulate SET_MESSAGES coming from database without changedFiles
		const reloadedFromDb: Message[] = [
			{
				id: "assistant-temp-1",
				role: "assistant",
				content: [{ type: "text", text: "Done editing files" }],
			},
		]

		state = chatReducer(state, {
			type: "SET_MESSAGES",
			messages: reloadedFromDb,
		})

		// Must preserve changedFiles
		expect(state.messages[0].changedFiles).toHaveLength(1)
		expect(state.messages[0].changedFiles![0].path).toBe(
			"src/electron/ipc/harness-handlers.ts",
		)

		// Also test fallback when messageId differs (e.g. server UUID)
		state = chatReducer(state, {
			type: "SET_MESSAGE_CHANGED_FILES",
			messageId: "unknown-different-id",
			files: [
				{
					path: "src/renderer/App.tsx",
					added: 10,
					deleted: 2,
					status: "modified",
				},
			],
		})

		// Should fall back to the last assistant message
		expect(state.messages[0].changedFiles).toHaveLength(1)
		expect(state.messages[0].changedFiles![0].path).toBe("src/renderer/App.tsx")
	})

	it("keeps an optimistic user message when a reload races the send", () => {
		const stored: Message[] = [
			{
				id: "msg-user-1",
				role: "user",
				content: [{ type: "text", text: "first question" }],
			},
			{
				id: "msg-assistant-1",
				role: "assistant",
				content: [{ type: "text", text: "answer" }],
			},
		]

		let state = chatReducer(initialChatState, {
			type: "SET_MESSAGES",
			messages: stored,
		})
		// A queued message is sent optimistically, then the thread reloads
		// before the harness has stored it.
		state = chatReducer(state, {
			type: "MESSAGE_START",
			message: {
				id: "user-2000",
				role: "user",
				content: [{ type: "text", text: "follow up" }],
			},
		})
		state = chatReducer(state, { type: "SET_MESSAGES", messages: stored })

		expect(state.messages).toHaveLength(3)
		expect(state.messages[2].id).toBe("user-2000")
	})

	it("does not duplicate the optimistic message once it is stored", () => {
		const stored: Message[] = [
			{
				id: "msg-user-1",
				role: "user",
				content: [{ type: "text", text: "first question" }],
			},
			{
				id: "msg-assistant-1",
				role: "assistant",
				content: [{ type: "text", text: "answer" }],
			},
		]

		let state = chatReducer(initialChatState, {
			type: "SET_MESSAGES",
			messages: stored,
		})
		state = chatReducer(state, {
			type: "MESSAGE_START",
			message: {
				id: "user-2000",
				role: "user",
				content: [{ type: "text", text: "follow up" }],
			},
		})

		const withStoredFollowUp: Message[] = [
			...stored,
			{
				id: "msg-user-2",
				role: "user",
				content: [{ type: "text", text: "follow up" }],
			},
		]
		state = chatReducer(state, {
			type: "SET_MESSAGES",
			messages: withStoredFollowUp,
		})

		expect(state.messages).toHaveLength(3)
		expect(state.messages[2].id).toBe("msg-user-2")
	})

	it("does not wipe out active conversation when SET_MESSAGES is called with empty array", () => {
		const currentMsgs: Message[] = [
			{
				id: "msg-user-1",
				role: "user",
				content: [{ type: "text", text: "task prompt" }],
			},
			{
				id: "msg-assistant-1",
				role: "assistant",
				content: [{ type: "text", text: "task result" }],
			},
		]

		let state = chatReducer(initialChatState, {
			type: "SET_MESSAGES",
			messages: currentMsgs,
		})
		expect(state.messages).toHaveLength(2)

		// Simulating loadMessages returning empty [] after agent_end
		state = chatReducer(state, {
			type: "SET_MESSAGES",
			messages: [],
		})
		expect(state.messages).toHaveLength(2)
		expect(state.messages[0].id).toBe("msg-user-1")
		expect(state.messages[1].id).toBe("msg-assistant-1")
	})
})
