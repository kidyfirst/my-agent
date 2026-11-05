import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { OverviewMenu } from "../components/OverviewMenu"
import { RightSidebarMenu } from "../components/RightSidebarMenu"
import { overviewPanelItems, overviewMenuItems } from "../utils/overviewMenu"

const dropdownMarkup = (hasGitRepo: boolean) =>
	renderToStaticMarkup(
		<OverviewMenu hasGitRepo={hasGitRepo} onSelect={() => {}} />,
	)

const sidebarMarkup = (hasGitRepo: boolean) =>
	renderToStaticMarkup(
		<RightSidebarMenu hasGitRepo={hasGitRepo} onSelect={() => {}} />,
	)

describe("Overview Panel dropdown", () => {
	it("renders a closed trigger in the title bar", () => {
		const html = dropdownMarkup(true)
		expect(html).toContain('data-testid="overview-menu-trigger"')
		expect(html).toContain('aria-label="Overview Panel"')
		expect(html).not.toContain('data-testid="overview-menu"')
	})

	it("advertises the chord that brings the panel back", () => {
		const html = dropdownMarkup(true)
		expect(html).toContain('data-tooltip="Toggle Overview Panel"')
		expect(html).toContain('data-shortcut="⌥⌘O"')
	})

	it("uses a muted, thin-stroke, soft-fill glyph instead of near-black ink", () => {
		const html = dropdownMarkup(true)
		expect(html).toContain("var(--muted)")
		expect(html).toContain('stroke-width="1"')
		expect(html).toContain('fill-opacity="0.5"')
		// A solid currentColor fill was the old heavy look.
		expect(html).not.toContain('fill-opacity="1"')
	})

	it("lists Files, Review and Terminal but not Browser", () => {
		const ids = overviewPanelItems(true).map((item) => item.id)
		expect(ids).toEqual(["files", "review", "terminal"])
	})

	it("drops Review for a plain folder", () => {
		expect(overviewPanelItems(false).map((item) => item.id)).toEqual([
			"files",
			"terminal",
		])
	})
})

describe("RightSidebarMenu", () => {
	it("lists Files, Review, Terminal and Browser", () => {
		const html = sidebarMarkup(true)
		for (const id of ["files", "review", "terminal", "browser"]) {
			expect(html).toContain(`data-testid="right-sidebar-menu-${id}"`)
		}
	})

	it("drops Review for a plain folder", () => {
		const html = sidebarMarkup(false)
		expect(html).toContain('data-testid="right-sidebar-menu-files"')
		expect(html).not.toContain('data-testid="right-sidebar-menu-review"')
		expect(html).toContain('data-testid="right-sidebar-menu-browser"')
	})

	it("keeps its icons muted too", () => {
		expect(sidebarMarkup(true)).toContain("var(--muted)")
	})

	it("is just the destinations — no search box, no background tasks", () => {
		const html = sidebarMarkup(true)
		expect(html).not.toContain("Search")
		expect(html).not.toContain("Background Tasks")
		expect(html.match(/<button/g)?.length).toBe(overviewMenuItems(true).length)
	})
})
