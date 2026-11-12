import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PanelBrowser } from "../components/PanelBrowser"

const html = renderToStaticMarkup(<PanelBrowser worktreePath="/repo/demo" />)

describe("PanelBrowser chrome", () => {
	it("keeps the tab strip draggable but lets its chips take clicks", () => {
		// A `-webkit-app-region: drag` parent swallows mouse events, so every
		// control living inside it must opt out — otherwise clicking a tab does
		// nothing and the browser looks stuck on one page.
		expect(html).toMatch(/class="titlebar-drag"/)
		expect(html).toMatch(/class="titlebar-no-drag"[^>]*max-width:150px/)
	})

	it("labels a blank tab and gives it a close target", () => {
		expect(html).toContain(">New tab<")
		expect(html).toContain('aria-label="Close New tab"')
	})

	it("offers an address bar and a new-tab button", () => {
		expect(html).toContain('aria-label="Address"')
		expect(html).toContain('aria-label="New browser tab"')
		expect(html).toContain('data-testid="panel-browser-views"')
	})

	it("preserves original icon sizes for tab close (9x9) and navigation chrome (13x13)", () => {
		// Close button inside tab chip must be 9x9 with 16x16 coordinate space
		expect(html).toMatch(/<svg[^>]*width="9"[^>]*height="9"[^>]*viewBox="0 0 16 16"/)
		// Navigation buttons (plus, back, forward, reload, external) must be 13x13 with 16x16 coordinate space
		expect(html).toMatch(/<svg[^>]*width="13"[^>]*height="13"[^>]*viewBox="0 0 16 16"/)
	})
})
