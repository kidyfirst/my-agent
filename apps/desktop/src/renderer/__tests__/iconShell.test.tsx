import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Icon } from "../components/Icon"

describe("Icon shell", () => {
	it("defaults to a 1.5 stroke on the 24 grid", () => {
		const html = renderToStaticMarkup(<Icon><path d="M1 1" /></Icon>)
		expect(html).toContain('stroke-width="1.5"')
		expect(html).toContain('viewBox="0 0 24 24"')
		expect(html).toContain('stroke-linecap="round"')
		expect(html).toContain('flex-shrink:0')
		expect(html).toContain('aria-hidden="true"')
	})

	it("drops the stroke and fills instead when solid", () => {
		const html = renderToStaticMarkup(<Icon filled><path d="M1 1" /></Icon>)
		expect(html).toContain('fill="currentColor"')
		expect(html).toContain('stroke-width="0"')
	})

	it("lets callers override the weight and the grid", () => {
		const html = renderToStaticMarkup(<Icon strokeWidth={2.2} viewBox="0 0 16 16"><path d="M1 1" /></Icon>)
		expect(html).toContain('stroke-width="2.2"')
		expect(html).toContain('viewBox="0 0 16 16"')
	})

	it("labels itself only when given a title", () => {
		const plain = renderToStaticMarkup(<Icon><path d="M1 1" /></Icon>)
		expect(plain).not.toContain("<title>")
		const labelled = renderToStaticMarkup(<Icon title="Files"><path d="M1 1" /></Icon>)
		expect(labelled).toContain("<title>Files</title>")
		expect(labelled).toContain('role="img"')
		expect(labelled).not.toContain('aria-hidden')
	})
})
