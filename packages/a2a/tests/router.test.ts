import { describe, it, expect, vi, beforeEach } from "vitest"
import { A2ARouter } from "../src/server/router.js"
import type { MyAgentHarness } from "@my-agent/core"
import * as core from "@my-agent/core"

vi.mock("@my-agent/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@my-agent/core")>()
	return {
		...actual,
		saveRecentProject: vi.fn(),
		loadRecentProjects: vi.fn(() => [
			{
				rootPath: "/workspace/proj-a",
				name: "Project A",
				lastOpened: Date.now(),
			},
		]),
		getActiveTaskBaseline: vi.fn(),
		clearActiveTaskBaseline: vi.fn(),
		revertToGitSnapshot: vi.fn(() => ({
			success: true,
			revertedFiles: ["file.ts"],
		})),
	}
})

describe("A2ARouter", () => {
	let mockHarness: MyAgentHarness
	let router: A2ARouter

	beforeEach(() => {
		mockHarness = {
			id: "test-harness",
			controller: {} as any,
			activeSession: { resourceId: "/workspace/proj-a" } as any,
			init: vi.fn(),
			subscribe: vi.fn(() => () => {}),
			sendMessage: vi.fn(async () => {}),
			abort: vi.fn(async () => {}),
			steer: vi.fn(),
			followUp: vi.fn(),
			getState: vi.fn(() => ({})),
			setState: vi.fn(),
			listModes: vi.fn(() => []),
			getCurrentModeId: vi.fn(() => "react"),
			switchMode: vi.fn(),
			getCurrentModelId: vi.fn(() => "model-x"),
			getFullModelId: vi.fn(() => "provider:model-x"),
			switchModel: vi.fn(),
			switchObserverModel: vi.fn(),
			switchReflectorModel: vi.fn(),
			getCurrentThreadId: vi.fn(() => "thread-1"),
			createThread: vi.fn(async (opts) => ({
				id: "thread-new",
				title: opts?.title || "New Thread",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})),
			switchThread: vi.fn(),
			renameThread: vi.fn(),
			deleteThread: vi.fn(),
			listThreads: vi.fn(async () => [
				{
					id: "thread-1",
					title: "Thread One",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			]),
			listMessages: vi.fn(async () => [
				{ id: "m1", role: "user", content: "hello" },
				{ id: "m2", role: "assistant", content: "world" },
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

		router = new A2ARouter({ harness: mockHarness })
	})

	it("handles projects/list", async () => {
		const res = await router.handle({
			jsonrpc: "2.0",
			id: 1,
			method: "projects/list",
			params: {},
		})

		expect(res.error).toBeUndefined()
		expect(res.result.projects).toHaveLength(1)
		expect(res.result.projects[0].rootPath).toBe("/workspace/proj-a")
		expect(res.result.projects[0].isActive).toBe(true)
	})

	it("handles threads/list", async () => {
		const res = await router.handle({
			jsonrpc: "2.0",
			id: 2,
			method: "threads/list",
		})

		expect(res.error).toBeUndefined()
		expect(res.result.threads).toHaveLength(1)
		expect(res.result.threads[0].id).toBe("thread-1")
	})

	it("handles threads/create", async () => {
		const res = await router.handle({
			jsonrpc: "2.0",
			id: 3,
			method: "threads/create",
			params: { title: "Feature Exploration" },
		})

		expect(res.error).toBeUndefined()
		expect(res.result.threadId).toBe("thread-new")
		expect(res.result.title).toBe("Feature Exploration")
		expect(mockHarness.createThread).toHaveBeenCalledWith({
			title: "Feature Exploration",
		})
	})

	it("handles message/send", async () => {
		const res = await router.handle({
			jsonrpc: "2.0",
			id: 4,
			method: "message/send",
			params: {
				contextId: "thread-1",
				message: { text: "build the monorepo" },
			},
		})

		expect(res.error).toBeUndefined()
		expect(res.result.contextId).toBe("thread-1")
		expect(res.result.status).toBe("COMPLETED")
		expect(res.result.message.parts[0].text).toBe("world")
		expect(mockHarness.sendMessage).toHaveBeenCalledWith({
			content: "build the monorepo",
			threadId: "thread-1",
		})
	})

	it("handles approvals/list and approvals/submit", async () => {
		vi.mocked(mockHarness.getPendingApprovals).mockReturnValueOnce([
			{
				toolCallId: "call_123",
				toolName: "execute_command",
				args: { command: "npm test" },
				description: "Run unit tests",
			},
		])

		const listRes = await router.handle({
			jsonrpc: "2.0",
			id: 5,
			method: "approvals/list",
			params: { contextId: "thread-1" },
		})

		expect(listRes.result.approvals).toHaveLength(1)
		expect(listRes.result.approvals[0].approvalId).toBe("call_123")

		const submitRes = await router.handle({
			jsonrpc: "2.0",
			id: 6,
			method: "approvals/submit",
			params: {
				contextId: "thread-1",
				approvalId: "call_123",
				decision: "allow",
			},
		})

		expect(submitRes.result.success).toBe(true)
		expect(mockHarness.respondToToolApproval).toHaveBeenCalledWith({
			toolCallId: "call_123",
			decision: "approve",
		})
	})

	it("handles tasks/revert", async () => {
		vi.mocked(core.getActiveTaskBaseline).mockReturnValueOnce({
			threadId: "thread-1",
			projectRoot: "/workspace/proj-a",
			baselineTree: "tree-abc",
			startedAt: new Date().toISOString(),
		})

		const res = await router.handle({
			jsonrpc: "2.0",
			id: 7,
			method: "tasks/revert",
			params: { contextId: "thread-1" },
		})

		expect(res.result.success).toBe(true)
		expect(res.result.revertedFiles).toContain("file.ts")
		expect(core.revertToGitSnapshot).toHaveBeenCalledWith("/workspace/proj-a", {
			tree: "tree-abc",
		})
		expect(core.clearActiveTaskBaseline).toHaveBeenCalledWith("thread-1")
	})

	it("returns -32601 for unknown methods", async () => {
		const res = await router.handle({
			jsonrpc: "2.0",
			id: 99,
			method: "unknown/operation",
			params: {},
		})

		expect(res.error).toBeDefined()
		expect(res.error?.code).toBe(-32601)
	})
})
