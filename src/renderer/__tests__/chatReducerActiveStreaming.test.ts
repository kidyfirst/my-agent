import { describe, expect, it } from "vitest"
import { chatReducer, initialChatState } from "../types/chat"
import type { Message } from "../types/ipc"

describe("chatReducer active streaming synchronization", () => {
	const userMsg: Message = {
		id: "u1",
		role: "user",
		content: [{ type: "text", text: "Explain the architecture" }],
		createdAt: new Date().toISOString(),
	}

	const assistantMsg: Message = {
		id: "a1",
		role: "assistant",
		content: [{ type: "text", text: "Working on analyzing..." }],
		createdAt: new Date().toISOString(),
		durationMs: 15000,
	}

	it("initializes streamingMessageId when SET_AGENT_ACTIVE is called on a thread with assistant message", () => {
		const stateWithMsgs = {
			...initialChatState,
			messages: [userMsg, assistantMsg],
			isAgentActive: false,
			streamingMessageId: null,
		}

		const nextState = chatReducer(stateWithMsgs, {
			type: "SET_AGENT_ACTIVE",
			active: true,
		})

		expect(nextState.isAgentActive).toBe(true)
		expect(nextState.streamingMessageId).toBe("a1")
		expect(nextState.agentStartedAt).not.toBeNull()
	})

	it("retains/initializes streamingMessageId when SET_MESSAGES is loaded into an active session", () => {
		const activeState = {
			...initialChatState,
			isAgentActive: true,
			streamingMessageId: null,
		}

		const nextState = chatReducer(activeState, {
			type: "SET_MESSAGES",
			messages: [userMsg, assistantMsg],
		})

		expect(nextState.isAgentActive).toBe(true)
		expect(nextState.streamingMessageId).toBe("a1")
	})

	it("activates agent state when incoming messages contain an in-flight isStreaming message", () => {
		const idleState = {
			...initialChatState,
			isAgentActive: false,
			streamingMessageId: null,
		}

		const streamingAssistant = {
			...assistantMsg,
			isStreaming: true,
		} as any

		const nextState = chatReducer(idleState, {
			type: "SET_MESSAGES",
			messages: [userMsg, streamingAssistant],
		})

		expect(nextState.isAgentActive).toBe(true)
		expect(nextState.streamingMessageId).toBe("a1")
	})

	it("clears streamingMessageId when SET_AGENT_ACTIVE becomes false", () => {
		const runningState = {
			...initialChatState,
			messages: [userMsg, assistantMsg],
			isAgentActive: true,
			streamingMessageId: "a1",
		}

		const nextState = chatReducer(runningState, {
			type: "SET_AGENT_ACTIVE",
			active: false,
		})

		expect(nextState.isAgentActive).toBe(false)
		expect(nextState.streamingMessageId).toBeNull()
	})
})
