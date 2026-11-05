import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebarMenu } from "../components/RightSidebarMenu"

const markup = (hasGitRepo: boolean) =>
	renderToStaticMarkup(
		<RightSidebarMenu hasGitRepo={hasGitRepo} onSelect={() => {}} />,
	)

describe("RightSidebarMenu", () => {
	it("lists Files, Review, Terminal and Browser", () => {
		const html = markup(true)
		for (const id of ["files", "review", "terminal", "browser"]) {
			expect(html).toContain(`data-testid="right-sidebar-menu-${id}"`)
		}
	})

	it("drops Review for a plain folder", () => {
		const html = markup(false)
		expect(html).toContain('data-testid="right-sidebar-menu-files"')
		expect(html).not.toContain('data-testid="right-sidebar-menu-review"')
		expect(html).toContain('data-testid="right-sidebar-menu-browser"')
	})

	it("is just the destinations — no search box, no background tasks", () => {
		const html = markup(true)
		expect(html).not.toContain("Search")
		expect(html).not.toContain("Background Tasks")
		// Exactly one row per destination, nothing else clickable.
		expect(html.match(/<button/g)?.length).toBe(4)
	})
})
