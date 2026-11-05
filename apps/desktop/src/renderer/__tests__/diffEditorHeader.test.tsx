import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { DiffEditor } from "../components/DiffEditor"

describe("DiffEditor header", () => {
	it("offers the Open in... menu instead of an Open File button", () => {
		const html = renderToStaticMarkup(
			<DiffEditor filePath="src/client/client.css" projectPath="/repo/alpha" />,
		)
		expect(html).toContain("Open in...")
		expect(html).not.toContain("Open File")
	})

	it("keeps the view-mode switch", () => {
		const html = renderToStaticMarkup(
			<DiffEditor filePath="src/client/client.css" projectPath="/repo/alpha" />,
		)
		expect(html).toContain("Side-by-Side")
	})

	it("shows the changed path in the header", () => {
		const html = renderToStaticMarkup(
			<DiffEditor filePath="src/client/client.css" projectPath="/repo/alpha" />,
		)
		expect(html).toContain("src/client/client.css")
	})

	it("renders no menu trigger without a project path", () => {
		// Without a root there is nothing to open, so the menu stays out of
		// the header rather than opening onto an empty list.
		const html = renderToStaticMarkup(
			<DiffEditor filePath="src/a.ts" projectPath={null} />,
		)
		expect(html).not.toContain("Open in...")
	})
})
