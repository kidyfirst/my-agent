import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ToastNotification } from "../components/ToastNotification"

describe("ToastNotification", () => {
	it("renders toast message, glyph, and styling below header", () => {
		const html = renderToStaticMarkup(
			<ToastNotification
				toast={{
					id: 1,
					message: "Project skills are up to date.",
					type: "info",
				}}
				onClose={() => {}}
			/>,
		)

		expect(html).toContain("Project skills are up to date.")
		expect(html).toContain("•")
		expect(html).toContain("top:48px")
		expect(html).toContain("position:absolute")
	})

	it("renders error toast with error glyph", () => {
		const html = renderToStaticMarkup(
			<ToastNotification
				toast={{
					id: 2,
					message: "Operation failed",
					type: "error",
				}}
				onClose={() => {}}
			/>,
		)

		expect(html).toContain("Operation failed")
		expect(html).toContain("⚠")
	})

	it("renders success toast with success glyph", () => {
		const html = renderToStaticMarkup(
			<ToastNotification
				toast={{
					id: 3,
					message: "Changes saved",
					type: "success",
				}}
				onClose={() => {}}
			/>,
		)

		expect(html).toContain("Changes saved")
		expect(html).toContain("✓")
	})
})
