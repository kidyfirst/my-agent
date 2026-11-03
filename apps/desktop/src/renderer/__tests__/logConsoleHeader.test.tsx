import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LogConsoleModal } from "../components/LogConsoleModal"
import { LogIcon } from "../components/LogIcon"

/** The page-with-folded-corner glyph shared by the menu row and the title tile. */
const PAGE_PATH = "M14.25 3.25H7"

describe("LogIcon", () => {
	it("draws the page glyph at the sidebar's weight by default", () => {
		const html = renderToStaticMarkup(<LogIcon />)
		expect(html).toContain(PAGE_PATH)
		expect(html).toContain('width="16"')
		expect(html).toContain('stroke-width="1.5"')
	})

	it("takes a thicker stroke for the smaller tile rendering", () => {
		const html = renderToStaticMarkup(<LogIcon size={13} strokeWidth={2.2} />)
		expect(html).toContain('width="13"')
		expect(html).toContain('stroke-width="2.2"')
	})
})

describe("Log console header", () => {
	it("puts the same glyph on a rounded tile, like the Settings dialog", () => {
		const html = renderToStaticMarkup(<LogConsoleModal onClose={vi.fn()} />)
		expect(html).toContain(PAGE_PATH)
		expect(html).toContain("width:22px")
		expect(html).toContain("border-radius:5px")
		// Same accent gradient as Settings, built from theme tokens only.
		expect(html).toContain(
			"linear-gradient(135deg, var(--accent), var(--accent-2))",
		)
		expect(html).toContain("color:var(--on-accent)")
		expect(html).toContain("Logging")
	})
})
