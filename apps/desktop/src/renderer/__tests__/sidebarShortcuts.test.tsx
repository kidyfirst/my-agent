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
	onToggleSidebar: vi.fn(),
}

const render = (overrides: Record<string, unknown> = {}) =>
	renderToStaticMarkup(<Sidebar {...baseProps} {...overrides} />)

describe("sidebar header shortcuts", () => {
	it("names the chord that collapses the panel", () => {
		const html = render()
		expect(html).toContain('data-tooltip="Toggle Sidebar"')
		expect(html).toContain('data-shortcut="⌘B"')
	})

	it("names the chord that opens conversation search", () => {
		const html = render()
		expect(html).toContain('data-tooltip="Search Conversations"')
		expect(html).toContain('data-shortcut="⌘K"')
		expect(html).toContain('aria-label="Search projects and sessions"')
	})
})
