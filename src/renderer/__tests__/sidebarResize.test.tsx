import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Sidebar } from "../components/Sidebar"
import { SIDEBAR_RESIZE_HANDLE_WIDTH } from "../utils/sidebarResize"

function render(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	return renderToStaticMarkup(
		<Sidebar
			threads={[]}
			currentThreadId={null}
			loggedInProviders={new Set<string>()}
			projectName="demo"
			sidebarVisible
			enrichedProjects={[]}
			activeProjectPath={null}
			isAgentActive={false}
			activeWorktrees={new Set<string>()}
			unreadWorktrees={new Set<string>()}
			worktreeStatuses={new Map()}
			onSwitchThread={noop}
			onNewThread={noop}
			onDeleteThread={noop}
			onRenameThread={noop}
			onLogin={noop}
			onSwitchProject={noop}
			onOpenFolder={noop}
			onCloneRepo={noop}
			onRemoveProject={noop}
			onRenameProject={noop}
			onCreateWorktree={noop}
			onDeleteWorktree={noop}
			onOpenSettings={noop}
			onOpenAgents={noop}
			onOpenAccounts={noop}
			isSettingsActive={false}
			isAgentsActive={false}
			activeAgentCount={0}
			width={260}
			onWidthChange={noop}
			onCollapse={noop}
			{...overrides}
		/>,
	)
}

describe("Sidebar resize", () => {
	it("renders a drag strip on its right edge", () => {
		const html = render()
		expect(html).toContain("data-sidebar-resize-handle")
		expect(html).toContain("col-resize")
		expect(html).toContain(`width:${SIDEBAR_RESIZE_HANDLE_WIDTH}px`)
	})

	it("uses the width it is given instead of a hardcoded 260px", () => {
		expect(render({ width: 300 })).toContain("width:300px")
		expect(render({ width: 180 })).toContain("width:180px")
	})

	it("uses the same 4px splitter line as the right panel", () => {
		const html = render()
		expect(SIDEBAR_RESIZE_HANDLE_WIDTH).toBe(4)
		expect(html).toContain("padding-right:4px")
		expect(html).toContain("background:var(--border-muted)")
	})

	it("hides the strip while the sidebar is collapsed", () => {
		const html = render({ sidebarVisible: false })
		expect(html).not.toContain("data-sidebar-resize-handle")
		// The whole panel is pushed out of view by its own width.
		expect(html).toContain("margin-left:-260px")
	})

	it("dims the panel once it is dragged into the closing range", () => {
		expect(render({ width: 140 })).toContain("opacity:0.55")
		expect(render({ width: 260 })).toContain("opacity:1")
	})
})
