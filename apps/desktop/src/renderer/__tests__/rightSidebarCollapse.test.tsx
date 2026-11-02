import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebar } from "../components/RightSidebar"
import {
	RIGHT_SIDEBAR_DEFAULT_WIDTH,
	RIGHT_SIDEBAR_RESIZE_HANDLE_WIDTH,
} from "../utils/rightSidebarResize"

function render(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	return renderToStaticMarkup(
		<RightSidebar
			visible
			activeTab="files"
			onTabChange={noop}
			projectName="demo"
			projectPath="/repo/demo"
			hasGitRepo={false}
			onFileClick={noop}
			onDiffClick={noop}
			onCollapse={noop}
			{...overrides}
		/>,
	)
}

describe("RightSidebar collapse", () => {
	it("renders a splitter on its left edge, same 4px line as the left sidebar", () => {
		const html = render()
		expect(html).toContain("data-right-sidebar-resize-handle")
		expect(html).toContain("col-resize")
		expect(html).toContain(`width:${RIGHT_SIDEBAR_RESIZE_HANDLE_WIDTH}px`)
		expect(html).toContain("release below 150px to hide")
	})

	it("sits at its width while visible", () => {
		const html = render()
		expect(html).toContain(`width:${RIGHT_SIDEBAR_DEFAULT_WIDTH}px`)
		expect(html).toContain("margin-right:0")
		expect(html).toContain("transition:margin-right 0.22s ease")
	})

	it("slides out instead of unmounting when hidden", () => {
		const html = render({ visible: false })
		// Still rendered, pushed out by exactly its own width.
		expect(html).toContain(`margin-right:-${RIGHT_SIDEBAR_DEFAULT_WIDTH}px`)
		expect(html).toContain("data-right-sidebar-resize-handle")
	})

	it("keeps the panel mounted across visibility changes", () => {
		// A hidden panel still contains its tab strip, so the terminal inside it
		// is not torn down (and re-spawned) just because the panel is closed.
		expect(render({ visible: false })).toContain("Files")
	})
})
