import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ComputerUsePreviewCard } from "../components/ComputerUsePreview"
import type { PreviewFrame } from "../utils/computerUsePreview"

const frame: PreviewFrame = {
	dataUrl: "data:image/jpeg;base64,AAAA",
	url: "https://example.com/pricing?plan=pro",
	title: "Pricing",
	capturedAt: 1_700_000_000_000,
	worktreePath: "/repo",
	threadId: "thread-1",
}

const markup = (overrides: { hovered?: boolean; active?: boolean } = {}) =>
	renderToStaticMarkup(
		<ComputerUsePreviewCard
			frame={frame}
			active={overrides.active ?? true}
			hovered={overrides.hovered ?? false}
			onHoverStart={() => {}}
			onHoverEnd={() => {}}
			onOpen={() => {}}
		/>,
	)

describe("ComputerUsePreviewCard", () => {
	it("renders the screenshot frame", () => {
		const html = markup()
		expect(html).toContain('data-testid="computer-use-preview"')
		expect(html).toContain('src="data:image/jpeg;base64,AAAA"')
		expect(html).toContain('alt="Pricing"')
	})

	it("shows the host and path instead of the whole url", () => {
		const html = markup()
		expect(html).toContain("example.com/pricing")
		// The full url is still available as a tooltip, not as visible text.
		expect(html).toContain('title="https://example.com/pricing?plan=pro"')
	})

	it("hides the expand button until the pointer is over the panel", () => {
		expect(markup({ hovered: false })).toContain("opacity:0")
		expect(markup({ hovered: true })).toContain("opacity:1")
	})

	it("always provides the open affordance for keyboard users", () => {
		// Opens a tab in the sidebar's browser panel, not the system browser.
		expect(markup()).toContain('aria-label="Open in browser panel"')
	})

	it("is pinned to the conversation pane, not to the viewport", () => {
		// Absolute inside the pane (`position: relative`, never scrolls): the
		// card cannot be shifted by an inline card appearing in the transcript,
		// and it cannot end up floating over the right sidebar either — when
		// that panel opens, the pane narrows and the card travels with it.
		const html = markup()
		expect(html).toContain("position:absolute")
		expect(html).not.toContain("position:fixed")
		expect(html).toContain("top:12px")
		expect(html).toContain("right:12px")
	})

	it("never grows wider than the pane it is pinned to", () => {
		// `max-width` is what keeps a 300px card inside a pane narrower than
		// that, instead of spilling over whatever is to the right.
		expect(markup()).toContain("max-width:calc(100% - 24px)")
	})

	it("places the card at the inset it is given", () => {
		const html = renderToStaticMarkup(
			<ComputerUsePreviewCard
				frame={frame}
				active
				hovered={false}
				placement={20}
				onHoverStart={() => {}}
				onHoverEnd={() => {}}
				onOpen={() => {}}
			/>,
		)
		expect(html).toContain("top:20px")
		expect(html).toContain("right:20px")
		expect(html).toContain("max-width:calc(100% - 40px)")
	})

	it("labels the frame as live only while a browser tool runs", () => {
		expect(markup({ active: true })).toContain("BROWSER")
		expect(markup({ active: false })).toContain("USED BROWSER")
	})
})
