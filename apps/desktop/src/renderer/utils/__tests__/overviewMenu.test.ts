import { describe, expect, it } from "vitest"
import { overviewMenuItems, overviewPanelItems } from "../overviewMenu"

describe("overview menu items", () => {
	it("lists every destination for a git repo", () => {
		expect(overviewMenuItems(true).map((item) => item.label)).toEqual([
			"Files",
			"Review",
			"Terminal",
			"Browser",
		])
	})

	it("drops Review for a plain folder", () => {
		const ids = overviewMenuItems(false).map((item) => item.id)
		expect(ids).toEqual(["files", "terminal", "browser"])
	})

	it("always offers the browser, even for a plain folder", () => {
		expect(overviewMenuItems(false).map((item) => item.id)).toContain("browser")
	})

	it("keeps the dropdown to the three sidebar panels", () => {
		expect(overviewPanelItems(true).map((item) => item.id)).toEqual([
			"files",
			"review",
			"terminal",
		])
	})

	it("keeps the dropdown in the same order as the landing list", () => {
		const dropdown = overviewPanelItems(true).map((item) => item.id)
		const sidebar = overviewMenuItems(true).map((item) => item.id)
		expect(sidebar.filter((id) => dropdown.includes(id))).toEqual(dropdown)
	})
})
