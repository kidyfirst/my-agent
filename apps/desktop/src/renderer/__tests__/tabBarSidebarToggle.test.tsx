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
	rightSidebarVisible: false,
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

describe("TabBar right panel toggle", () => {
	it("offers a way back to the panel once it is hidden", () => {
		const html = render({ rightSidebarVisible: false })
		expect(html).toContain('data-testid="right-sidebar-show"')
		expect(html).toContain('aria-label="Toggle Side Panel"')
	})

	it("advertises the chord that reopens it", () => {
		const html = render({ rightSidebarVisible: false })
		expect(html).toContain('data-tooltip="Toggle Side Panel"')
		expect(html).toContain('data-shortcut="⇧⌘B"')
	})

	it("steps aside while the panel is open", () => {
		// Open, the panel carries its own maximize/hide controls at its right
		// edge; a second toggle in the title bar would be redundant.
		const html = render({ rightSidebarVisible: true })
		expect(html).not.toContain('data-testid="right-sidebar-show"')
	})
})
