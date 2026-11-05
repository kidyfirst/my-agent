import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebar } from "../components/RightSidebar"

function render(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	return renderToStaticMarkup(
		<RightSidebar
			visible
			activeTab="menu"
			openTabs={[]}
			onTabChange={noop}
			onCloseTab={noop}
			projectName="demo"
			projectPath="/repo/demo"
			hasGitRepo
			onFileClick={noop}
			onDiffClick={noop}
			{...overrides}
		/>,
	)
}

describe("right sidebar tab strip", () => {
	it("shows Overview as a header, with no tabs on the landing page", () => {
		const html = render()
		expect(html).toContain('data-testid="right-sidebar-overview-header"')
		expect(html).toContain('data-testid="right-sidebar-tabs"')
		expect(html).not.toContain('data-testid="right-sidebar-tab-menu"')
		expect(html).toContain('data-testid="right-sidebar-menu-files"')
	})

	it("never lists Overview as a tab — only real destinations", () => {
		const html = render({
			openTabs: ["files", "terminal", "browser"],
			activeTab: "terminal",
		})
		for (const id of ["files", "terminal", "browser"]) {
			expect(html).toContain(`data-testid="right-sidebar-tab-${id}"`)
		}
		expect(html).not.toContain('data-testid="right-sidebar-tab-menu"')
		expect(html).not.toContain('aria-label="Close Overview"')
		// Overview is a header, so only the three destinations are tabs.
		expect(html.match(/role="tab"/g)?.length).toBe(3)
		expect(html).toContain('aria-label="Close Files"')
		expect(html).toContain('aria-label="Close Terminal"')
		expect(html).toContain('aria-label="Close Browser"')
	})

	it("marks only the active tab as selected", () => {
		const html = render({
			openTabs: ["files", "terminal"],
			activeTab: "terminal",
		})
		expect(html.match(/aria-selected="true"/g)?.length).toBe(1)
		expect(html).toContain("Terminal")
	})

	it("keeps the Overview header reachable while tabs are open", () => {
		const html = render({ openTabs: ["files"], activeTab: "menu" })
		expect(html).toContain('data-testid="right-sidebar-overview-header"')
		expect(html).toContain('aria-current="page"')
		// No tab is highlighted while the landing list is showing.
		expect(html).not.toContain('aria-selected="true"')
		expect(html).toContain('data-testid="right-sidebar-menu-files"')
	})

	it("renders Terminal full-height in its own pane, with no bottom dock", () => {
		const html = render({ openTabs: ["terminal"], activeTab: "terminal" })
		// TerminalPanel fills the pane instead of taking a fixed docked height.
		expect(html).toContain("flex:1 1 0")
		expect(html).not.toContain("height:350px")
		// The old vertical splitter between panel and terminal is gone.
		expect(html).not.toContain("row-resize")
	})

	it("keeps every pane mounted while only one is visible", () => {
		const html = render({
			openTabs: ["files", "terminal"],
			activeTab: "terminal",
		})
		// display:none, not an unmount — PTY sessions survive tab switches.
		expect(html).toContain("display:none")
		expect(html).toContain("display:flex")
		expect(html).toContain('data-testid="right-sidebar-menu-pane"')
	})

	it("hides a stale Review tab for a plain folder", () => {
		const html = render({
			openTabs: ["git", "files"],
			activeTab: "files",
			hasGitRepo: false,
		})
		expect(html).not.toContain('data-testid="right-sidebar-tab-git"')
		expect(html).toContain('data-testid="right-sidebar-tab-files"')
	})
})

describe("right sidebar pane controls", () => {
	const controls = { onCollapse: vi.fn(), onToggleMaximize: vi.fn() }

	it("puts maximize and hide at the panel's right edge", () => {
		const html = render(controls)
		expect(html).toContain('data-testid="right-sidebar-pane-controls"')
		expect(html).toContain('data-testid="right-sidebar-maximize"')
		expect(html).toContain('data-testid="right-sidebar-hide"')
	})

	it("labels maximize with its shortcut, and flips to restore", () => {
		// The pair of words and the chord live on the trigger; the bubble is a
		// portal that only exists while hovered.
		expect(render(controls)).toContain('data-tooltip="Maximize Pane"')
		expect(render(controls)).toContain('data-shortcut="⇧⌘M"')
		expect(render({ ...controls, maximized: true })).toContain(
			'data-tooltip="Restore Pane Size"',
		)
		expect(render({ ...controls, maximized: true })).toContain(
			'aria-label="Restore pane size"',
		)
		expect(render(controls)).toContain('aria-label="Maximize pane"')
	})

	it("tells the hide button which chord brings the panel back", () => {
		expect(render(controls)).toContain('data-tooltip="Toggle Side Panel"')
		expect(render(controls)).toContain('data-shortcut="⇧⌘B"')
	})

	it("gives up its fixed width and the splitter while maximized", () => {
		const open = render({
			...controls,
			openTabs: ["files"],
			activeTab: "files",
		})
		expect(open).toContain('data-right-sidebar-resize-handle=""')

		const maximal = render({
			...controls,
			openTabs: ["files"],
			activeTab: "files",
			maximized: true,
		})
		// No width to drag, nothing to drag it with: the panel fills instead.
		expect(maximal).not.toContain('data-right-sidebar-resize-handle=""')
		expect(maximal).toContain("flex-grow:1")
	})

	it("animates the grow instead of jumping to full width", () => {
		// Both ends of the swap are lengths, so the browser can interpolate
		// them: the panel widens while the conversation column narrows, the
		// same 0.22s motion as the panel sliding in and out.
		const open = render({
			...controls,
			openTabs: ["files"],
			activeTab: "files",
		})
		expect(open).toContain("flex-basis:380px")
		expect(open).toContain("flex-grow 0.22s ease")
		expect(open).toContain("flex-basis 0.22s ease")

		const maximal = render({
			...controls,
			openTabs: ["files"],
			activeTab: "files",
			maximized: true,
		})
		expect(maximal).toContain("flex-basis:0")
		expect(maximal).toContain("flex-grow 0.22s ease")
		expect(maximal).toContain("flex-basis 0.22s ease")
	})

	it("drops the controls when the shell offers no handlers", () => {
		const html = render()
		expect(html).not.toContain('data-testid="right-sidebar-pane-controls"')
	})

	it("wears the title bar's chrome: bare 28px squares, no pill", () => {
		const html = render(controls)
		// A coloured container behind the pair read as a second control
		// family next to the title bar; the icons now stand on their own and
		// only light up individually on hover.
		const group = html.slice(
			html.indexOf('data-testid="right-sidebar-pane-controls"'),
			html.indexOf('data-testid="right-sidebar-maximize"'),
		)
		expect(group).not.toContain("border-radius")
		expect(group).not.toContain("background")
		// Same hit target and corner radius as the title-bar icons.
		expect(html).toContain("width:28px;height:28px")
		expect(html).toContain("border-radius:6px")
	})
})
