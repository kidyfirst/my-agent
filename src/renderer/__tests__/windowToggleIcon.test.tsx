import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { WindowToggleIcon } from "../components/WindowToggleIcon"

describe("WindowToggleIcon", () => {
	it("renders left closed state (Screenshot 1: outline with left divider, no fill)", () => {
		const html = renderToStaticMarkup(
			<WindowToggleIcon side="left" open={false} />,
		)
		expect(html).toContain("<svg")
		expect(html).toContain('rx="2.5"')
		expect(html).toContain('x1="5.5"')
		expect(html).toContain('x2="5.5"')
		expect(html).not.toContain("<path")
	})

	it("renders left open state (Screenshot 3: left section filled solid)", () => {
		const html = renderToStaticMarkup(
			<WindowToggleIcon side="left" open={true} />,
		)
		expect(html).toContain("<svg")
		expect(html).toContain("<path")
		expect(html).toContain('fill="currentColor"')
		expect(html).toContain("M 1.5 5")
		expect(html).toContain("H 5.5")
		expect(html).toContain('x1="5.5"')
	})

	it("renders right closed state (Screenshot 2: outline with right divider, no fill)", () => {
		const html = renderToStaticMarkup(
			<WindowToggleIcon side="right" open={false} />,
		)
		expect(html).toContain("<svg")
		expect(html).toContain('x1="10.5"')
		expect(html).toContain('x2="10.5"')
		expect(html).not.toContain("<path")
	})

	it("renders right open state (Screenshot 4: right section filled solid)", () => {
		const html = renderToStaticMarkup(
			<WindowToggleIcon side="right" open={true} />,
		)
		expect(html).toContain("<svg")
		expect(html).toContain("<path")
		expect(html).toContain('fill="currentColor"')
		expect(html).toContain("M 10.5 2.5")
		expect(html).toContain("H 12")
		expect(html).toContain('x1="10.5"')
	})
})
