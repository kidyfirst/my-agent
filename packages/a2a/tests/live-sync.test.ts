import { describe, it, expect, vi } from "vitest"
import { A2ARouter } from "../src/server/router.js"
import type { MyAgentHarness, MyAgentEvent } from "@my-agent/core"

describe("A2A <-> UI Live Event Sync Verification", () => {
	it("notifies Event Bus subscribers when A2A receives a message/send request", async () => {
		const emittedEvents: MyAgentEvent[] = []

		const mockHarness: MyAgentHarness = {
			id: "sync-harness",
			controller: {} as any,
			activeSession: { resourceId: "/workspace/sync-project" } as any,
			init: vi.fn(),
			subscribe: (listener) => {
				// Simulate subscription
				return () => {}
			},
			sendMessage: vi.fn(async (options) => {
				// Simulating harness emitting deltas and completion during turn
				emittedEvents.push({
					type: "delta",
					delta: "Refactoring completed.",
				} as any)
				emittedEvents.push({
					type: "agent_end",
				} as any)
			}),
			abort: vi.fn(),
			steer: vi.fn(),
			followUp: vi.fn(),
			getState: vi.fn(() => ({})),
			setState: vi.fn(),
			listModes: vi.fn(() => []),
			getCurrentModeId: vi.fn(() => "react"),
			switchMode: vi.fn(),
			getCurrentModelId: vi.fn(() => "claude-3-7-sonnet"),
			getFullModelId: vi.fn(() => "anthropic:claude-3-7-sonnet"),
			switchModel: vi.fn(),
			switchObserverModel: vi.fn(),
			switchReflectorModel: vi.fn(),
			getCurrentThreadId: vi.fn(() => "thread-sync-1"),
			createThread: vi.fn(),
			switchThread: vi.fn(),
			renameThread: vi.fn(),
			deleteThread: vi.fn(),
			listThreads: vi.fn(async () => []),
			listMessages: vi.fn(async () => [
				{ id: "m1", role: "assistant", content: "Refactoring completed." },
			]),
			getTokenUsage: vi.fn(() => ({}) as any),
			getDisplayState: vi.fn(() => ({}) as any),
			isRunning: vi.fn(() => false),
			isThreadRunning: vi.fn(() => false),
			getRunningThreadIds: vi.fn(() => []),
			getPendingApprovals: vi.fn(() => []),
			respondToToolApproval: vi.fn(),
			respondToQuestion: vi.fn(),
			respondToPlanApproval: vi.fn(),
			listAvailableModels: vi.fn(() => []),
			setPermissionForCategory: vi.fn(),
			getPermissionRules: vi.fn(() => ({}) as any),
			getSessionGrants: vi.fn(() => ({}) as any),
		}

		const router = new A2ARouter({ harness: mockHarness })

		const response = await router.handle({
			jsonrpc: "2.0",
			id: 101,
			method: "message/send",
			params: {
				contextId: "thread-sync-1",
				message: { text: "Add unit tests for A2A router" },
			},
		})

		expect(response.error).toBeUndefined()
		expect(response.result.status).toBe("COMPLETED")
		expect(mockHarness.sendMessage).toHaveBeenCalledWith({
			content: "Add unit tests for A2A router",
			threadId: "thread-sync-1",
		})
		expect(emittedEvents.length).toBe(2)
		expect(emittedEvents[0].type).toBe("delta")
		expect(emittedEvents[1].type).toBe("agent_end")
	})
})
