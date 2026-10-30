import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Sidebar } from "../components/Sidebar"
import type { EnrichedProject } from "../types/project-list"
import type { ThreadInfo } from "../types/ipc"

const thread = (id: string, title: string): ThreadInfo =>
	({
		id,
		resourceId: id,
		title,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
	}) as ThreadInfo

const projects: EnrichedProject[] = [
	{
		name: "alpha",
		rootPath: "/repo/alpha",
		lastOpened: "",
		gitBranch: "main",
		worktrees: [],
	},
	{
		name: "beta",
		rootPath: "/repo/beta",
		lastOpened: "",
		gitBranch: "main",
		worktrees: [],
	},
]

function renderSidebar(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	return renderToStaticMarkup(
		<Sidebar
			threads={[thread("t1", "Alpha session")]}
			threadsByPath={{
				"/repo/alpha": [thread("t1", "Alpha session")],
				"/repo/beta": [thread("t2", "Beta session")],
			}}
			currentThreadId="t1"
			loggedInProviders={new Set<string>()}
			projectName="alpha"
			sidebarVisible
			enrichedProjects={projects}
			activeProjectPath="/repo/alpha"
			isAgentActive={false}
			activeWorktrees={new Set<string>()}
			unreadWorktrees={new Set<string>()}
			worktreeStatuses={new Map()}
			isSettingsActive={false}
			isAgentsActive={false}
			activeAgentCount={0}
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
			{...overrides}
		/>,
	)
}

describe("Sidebar -> ProjectList", () => {
	it("hands the per-folder snapshots down so every project can be expanded", () => {
		const html = renderSidebar()
		expect(html).toContain("Alpha session")
		// `beta` is not the active project; its rows come from the snapshot.
		expect(html).toContain("Beta session")
	})

	it("renders no sessions for a project the snapshot does not cover", () => {
		const html = renderSidebar({ threadsByPath: {} })
		expect(html).toContain("Alpha session")
		expect(html).not.toContain("Beta session")
	})

	it("lets a sibling project's sessions be managed from here", () => {
		// The hover slot (only place the recording badge lives) must exist on a
		// row of a project that isn't open, so its ⋯ menu can rename/delete it.
		const html = renderSidebar({
			recordingThreads: new Set(["t2"]),
			onMutateForeignThread: vi.fn(),
		})
		expect(html).toContain("Stop recording and export")
	})

	it("keeps them read-only when no cross-project handler is wired", () => {
		const html = renderSidebar({ recordingThreads: new Set(["t2"]) })
		expect(html).not.toContain("Stop recording and export")
	})
})

describe("community banner", () => {
	it("sits above the Agents entry", () => {
		const html = renderSidebar()
		const banner = html.indexOf('aria-label="Support MyAgent"')
		const agents = html.indexOf(">Agents</span>")
		expect(banner).toBeGreaterThan(-1)
		expect(agents).toBeGreaterThan(-1)
		// The banner belongs to the top of the nav column: above Agents, below
		// the project list's own header.
		expect(banner).toBeLessThan(agents)
		expect(html.indexOf(">Star<")).toBeGreaterThan(banner)
	})
})
