import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TabBar } from "../components/TabBar"

const baseProps = {
	activeTab: "chat",
	currentThreadId: "t1" as string | null,
	openFiles: [] as string[],
	dirtyFiles: new Set<string>(),
	threads: [{ id: "t1", title: "New Session" }],
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
	projectRootPath: "/repo/dsh-superagent-prototype",
	projectName: "dsh-superagent-prototype",
}

const render = (overrides: Record<string, unknown>) =>
	renderToStaticMarkup(<TabBar {...baseProps} {...overrides} />)

/** The title block sits between the sidebar toggle and the file tabs. */
const titleBlock = (html: string) => {
	const marker = 'title="dsh-superagent-prototype / New Session"'
	const attr = html.indexOf(marker)
	expect(attr).toBeGreaterThan(-1)
	// The style attribute precedes `title`, so walk back to the opening tag.
	const start = html.lastIndexOf("<div", attr)
	return html.slice(start, html.indexOf("</div>", attr))
}

describe("conversation title affordance", () => {
	it("does not offer a hand cursor while the conversation is already in front", () => {
		// Selecting the tab the title points at is a no-op here, so the title is
		// a label: a pointer would promise a click that changes nothing.
		expect(titleBlock(render({ activeTab: "thread:t1" }))).toContain(
			"cursor:default",
		)
		expect(titleBlock(render({ activeTab: "chat" }))).toContain(
			"cursor:default",
		)
	})

	it("becomes a way back to the conversation once a file tab owns the pane", () => {
		const html = render({
			activeTab: "src/renderer/App.tsx",
			openFiles: ["src/renderer/App.tsx"],
		})
		expect(titleBlock(html)).toContain("cursor:pointer")
	})

	it("keeps the full title as a tooltip even when it is just a label", () => {
		// Truncation still needs the full string on hover.
		expect(render({ activeTab: "thread:t1" })).toContain(
			'title="dsh-superagent-prototype / New Session"',
		)
	})
})
