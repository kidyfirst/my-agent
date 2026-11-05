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

describe("TabBar overflow behaviour", () => {
	it("keeps the bar on a single row and clips what does not fit", () => {
		const html = render({})
		// The title bar itself never wraps and hides overflowing tabs.
		expect(html).toContain("flex-wrap:nowrap")
		expect(html).toContain("overflow:hidden")
	})

	it("truncates file tab labels with an ellipsis and tooltips the full path", () => {
		const html = render({
			openFiles: ["src/renderer/components/veryLongComponentName.tsx"],
		})
		// The filename lives in a nowrap + ellipsis span.
		expect(html).toMatch(
			/overflow:hidden;text-overflow:ellipsis;white-space:nowrap/,
		)
		// Hovering the tab reveals the full path, not just the basename.
		expect(html).toContain(
			'title="src/renderer/components/veryLongComponentName.tsx"',
		)
	})

	it("lets the conversation title shrink to a floor and tooltips the full title", () => {
		const html = render({
			projectName: "my-app",
			currentThreadId: "t1",
			threads: [{ id: "t1", title: "A very long conversation title" }],
		})
		// The title can shrink (so tabs never wrap) but keeps a readable floor.
		expect(html).toContain("min-width:140px")
		// Hover shows the full "project / conversation" string.
		expect(html).toContain('title="my-app / A very long conversation title"')
	})

	it("keeps a gutter between the tabs and the title-bar controls", () => {
		// The flexible spacer fills the slack; its minimum is what stops the
		// hover highlight on the right from butting against the tab's close
		// button when tabs run to the edge.
		expect(render({})).toContain("min-width:10px")
	})
})
