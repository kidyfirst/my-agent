import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MainContent } from "../components/MainContent"
import type { PendingApprovalData } from "../components/ToolApprovalCard"

describe("Thread Approval Switching in MainContent", () => {
	const approvalThreadA: PendingApprovalData = {
		threadId: "thread-A",
		toolCallId: "call-1",
		toolName: "execute_command",
		category: "bash",
		categoryLabel: "Bash",
		args: { command: "curl -s http://localhost:3888/a2a -d '{\"method\":\"projects/create\",\"params\":{\"name\":\"demo-a\"}}'" },
	}

	const approvalThreadC: PendingApprovalData = {
		threadId: "thread-C",
		toolCallId: "call-3",
		toolName: "delete_file",
		category: "fs",
		categoryLabel: "File System",
		args: { path: "/tmp/old.txt" },
	}

	const threadsWithApproval = new Map<string, any>([
		["thread-A", approvalThreadA],
		["thread-C", approvalThreadC],
	])

	const baseProps: any = {
		auth: {
			status: "signed_in",
			handleApiKey: vi.fn(),
			handleSkipLogin: vi.fn(),
		},
		project: {
			enrichedProjects: [{ name: "test-proj", rootPath: "/test", worktrees: [] }],
			projectInfo: { rootPath: "/test" },
			markWorktreeRead: vi.fn(),
			handleOpenFolder: vi.fn(),
			handleShowCloneModal: vi.fn(),
		},
		tabs: {
			activeTab: "chat",
			openFiles: [],
			openThreadTabs: ["thread:thread-A"],
			handleCloseTab: vi.fn(),
			handleFileClick: vi.fn(),
			handleDiffClick: vi.fn(),
			setActiveTab: vi.fn(),
		},
		chat: {
			messages: [],
			tools: new Map(),
			subagents: new Map(),
			isAgentActive: false,
			agentStartedAt: null,
			streamingMessageId: null,
			queuesByThread: {},
			isQueuePaused: false,
			loadingThreadId: null,
		},
		tasks: [],
		currentModelId: "gemini-2.5-pro",
		permissionMode: "default",
		onSend: vi.fn(),
		onQueue: vi.fn(),
		onAbort: vi.fn(),
		onBuiltinCommand: vi.fn(),
		onSelectModel: vi.fn(),
		onSelectPermissionMode: vi.fn(),
		onResumeQueue: vi.fn(),
		onSteerQueued: vi.fn(),
		onDeleteQueued: vi.fn(),
		onReorderQueue: vi.fn(),
		onClearQueue: vi.fn(),
		onRespondApproval: vi.fn(),
		threadsWithApproval,
	}

	it("renders approval card when active thread has pending approval", () => {
		const html = renderToStaticMarkup(
			<MainContent
				{...baseProps}
				activeThreadKey="thread-A"
			/>,
		)

		expect(html).toContain('data-testid="tool-approval-card"')
		expect(html).toContain("Allow a2a create project demo-a?")
		expect(html).toContain("Yes, allow this time")
	})

	it("does not render approval card when switching to thread without pending approval", () => {
		const html = renderToStaticMarkup(
			<MainContent
				{...baseProps}
				activeThreadKey="thread-B"
			/>,
		)

		expect(html).not.toContain('data-testid="tool-approval-card"')
		expect(html).not.toContain("Yes, allow this time")
	})

	it("renders corresponding approval card when switching to another thread with pending approval", () => {
		const html = renderToStaticMarkup(
			<MainContent
				{...baseProps}
				activeThreadKey="thread-C"
			/>,
		)

		expect(html).toContain('data-testid="tool-approval-card"')
		expect(html).toContain("Allow delete file?")
		expect(html).toContain("/tmp/old.txt")
	})
})
