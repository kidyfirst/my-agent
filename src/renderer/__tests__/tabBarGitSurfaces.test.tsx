import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TabBar } from "../components/TabBar"

const baseProps = {
	activeTab: "chat",
	openThreadTabs: [] as string[],
	openFiles: [] as string[],
	dirtyFiles: new Set<string>(),
	threads: [],
	sidebarVisible: true,
	rightSidebarVisible: true,
	prStatus: null,
	isAgentActive: false,
	onSelectTab: vi.fn(),
	onCloseTab: vi.fn(),
	onSwitchThread: vi.fn(async () => {}),
	onNewThread: vi.fn(),
	onToggleRightSidebar: vi.fn(),
	onCreatePR: vi.fn(),
	projectRootPath: "/repo/alpha",
}

const render = (overrides: Record<string, unknown>) =>
	renderToStaticMarkup(<TabBar {...baseProps} {...overrides} />)

describe("TabBar git surfaces", () => {
	it("offers Create PR for a git repo on a feature branch", () => {
		const html = render({ gitBranch: "feat/sidebar", hasGitRepo: true })
		expect(html).toContain("Create PR")
	})

	it("hides Create PR for a plain folder", () => {
		const html = render({ gitBranch: undefined, hasGitRepo: false })
		expect(html).not.toContain("Create PR")
	})

	it("hides Create PR when the project is flagged as non-git even with a stale branch", () => {
		const html = render({ gitBranch: "feat/sidebar", hasGitRepo: false })
		expect(html).not.toContain("Create PR")
	})

	it("keeps Open in available regardless of git", () => {
		expect(render({ hasGitRepo: false })).toContain("Open in")
	})
})
