import { describe, expect, it } from "vitest"
import { formatPageSnapshot, type PageSnapshot } from "../page-snapshot.js"

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
	return {
		url: "https://example.com/login",
		title: "Sign in",
		text: "Welcome back\nEnter your credentials",
		elements: [
			{ id: 1, tag: "input", label: "Email", x: 300, y: 220 },
			{ id: 2, tag: "button", label: "Continue", x: 300, y: 300 },
		],
		viewport: { width: 1024, height: 768 },
		...overrides,
	}
}

describe("formatPageSnapshot", () => {
	it("renders url, title, viewport and page text", () => {
		const text = formatPageSnapshot(snapshot())
		expect(text).toContain("URL: https://example.com/login")
		expect(text).toContain("Title: Sign in")
		expect(text).toContain("Viewport: 1024x768")
		expect(text).toContain("Welcome back")
	})

	it("lists clickable elements with ids and coordinates", () => {
		const text = formatPageSnapshot(snapshot())
		expect(text).toContain("[1] <input> Email @ (300, 220)")
		expect(text).toContain("[2] <button> Continue @ (300, 300)")
		expect(text).toContain("`element: <id>`")
	})

	it("tells the model ids are only valid for this snapshot", () => {
		expect(formatPageSnapshot(snapshot())).toContain("screenshot")
	})

	it("handles an empty page without emitting a bare 'undefined'", () => {
		const text = formatPageSnapshot(snapshot({ text: "", elements: [] }))
		expect(text).toContain("(none visible")
		expect(text).toContain("(empty)")
		expect(text).not.toContain("undefined")
	})
})
