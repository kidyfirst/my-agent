import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TabBar } from "../components/TabBar"

const baseProps = {
	activeTab: "chat",
	currentThreadId: null as string | null,
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
	onToggleRightSidebar: vi.fn(),
	onOverviewSelect: vi.fn(),
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

	it("keeps the Overview Panel entry in the title bar", () => {
		const html = render({ hasGitRepo: true })
		expect(html).toContain('data-testid="overview-menu-trigger"')
		expect(html).toContain('aria-label="Overview Panel"')
	})

	it("prefers the optimistic title while another project's session opens", () => {
		const html = render({
			projectName: "old-proj",
			currentThreadId: "t-old",
			threads: [{ id: "t-old", title: "Old chat" }],
			titleOverride: { projectName: "new-proj", conversationName: "Fresh chat" },
		})
		expect(html).toContain("new-proj")
		expect(html).toContain("Fresh chat")
		expect(html).not.toContain("Old chat")
	})

	it("renders title as project name / conversation name and does not render + or conversation close buttons", () => {
		const html = render({
			projectName: "my-app",
			currentThreadId: "t1",
			threads: [{ id: "t1", title: "Investigate bug" }],
		})
		expect(html).toContain("my-app")
		expect(html).toContain("Investigate bug")
		// No + button in TabBar
		expect(html).not.toMatch(/>\s*\+\s*<\/button>/)
		// No close button on the conversation tab
		expect(html).not.toContain("&times;")
	})

	it("falls back to projectRootPath directory name when projectName is absent", () => {
		const html = render({
			projectName: undefined,
			projectRootPath: "/Users/dev/cool-proj",
			currentThreadId: "t2",
			threads: [{ id: "t2", title: "Feature draft" }],
		})
		expect(html).toContain("cool-proj")
		expect(html).toContain("Feature draft")
	})

	it("retains close button on editor/file tabs but not on conversation title", () => {
		const html = render({
			projectName: "my-app",
			currentThreadId: "t1",
			threads: [{ id: "t1", title: "Chat" }],
			openFiles: ["src/app.ts"],
		})
		expect(html).toContain("my-app")
		expect(html).toContain("Chat")
		expect(html).toContain("app.ts")
		// Only 1 close button, which is for the file tab
		const closeButtons = html.match(/title="Close"/g)
		expect(closeButtons).toHaveLength(1)
	})
})
