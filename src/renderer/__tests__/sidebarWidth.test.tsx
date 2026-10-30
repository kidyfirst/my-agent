import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Sidebar } from "../components/Sidebar"

const baseProps = {
	threads: [],
	threadsByPath: {},
	currentThreadId: null,
	loggedInProviders: new Set<string>(),
	projectName: "my-agent",
	sidebarVisible: true,
	onWidthChange: vi.fn(),
	enrichedProjects: [],
	activeProjectPath: null,
	isAgentActive: false,
	activeWorktrees: new Set<string>(),
	unreadWorktrees: new Set<string>(),
	worktreeStatuses: new Map(),
	onSwitchThread: vi.fn(),
	onNewThread: vi.fn(),
	onDeleteThread: vi.fn(),
	onRenameThread: vi.fn(),
	onLogin: vi.fn(),
	onSwitchProject: vi.fn(),
	onOpenFolder: vi.fn(),
	onCloneRepo: vi.fn(),
	onRemoveProject: vi.fn(),
	onRenameProject: vi.fn(),
	onCreateWorktree: vi.fn(),
	onDeleteWorktree: vi.fn(),
	onOpenSettings: vi.fn(),
	onOpenAgents: vi.fn(),
	onOpenAccounts: vi.fn(),
	isSettingsActive: false,
	isAgentsActive: false,
	activeAgentCount: 0,
}

const render = (width: number) =>
	renderToStaticMarkup(<Sidebar {...baseProps} width={width} />)

describe("sidebar content follows the dragged width", () => {
	it("sizes the panel from the current width", () => {
		expect(render(380)).toContain("width:380px")
	})

	/**
	 * The rows, the header actions and the footer used to live in a wrapper with
	 * a hard-coded `width: 260`, so widening the panel left the content stuck at
	 * the default size (and narrowing it overflowed). Everything inside must be
	 * fluid instead.
	 */
	it("leaves no fixed content width behind", () => {
		const html = render(380)
		expect(html).not.toContain("width:260px")
		// The scrolling column itself is the fluid one.
		expect(html).toContain("width:100%;flex:1")
	})

	it("works the same at the narrow end of the range", () => {
		const html = render(180)
		expect(html).toContain("width:180px")
		expect(html).not.toContain("width:260px")
	})
})
