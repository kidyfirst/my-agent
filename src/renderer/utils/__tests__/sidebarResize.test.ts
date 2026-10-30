import { describe, expect, it } from "vitest"
import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_DRAG_WIDTH,
	clampSidebarWidth,
	restoreSidebarWidth,
	shouldCollapseSidebar,
} from "../sidebarResize"

describe("clampSidebarWidth", () => {
	it("keeps a width inside the drag range", () => {
		expect(clampSidebarWidth(240)).toBe(240)
	})

	it("never exceeds 300px", () => {
		expect(clampSidebarWidth(520)).toBe(SIDEBAR_MAX_WIDTH)
		expect(SIDEBAR_MAX_WIDTH).toBe(300)
	})

	it("stops at the drag floor, which is below the collapse threshold", () => {
		expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_DRAG_WIDTH)
		expect(SIDEBAR_MIN_DRAG_WIDTH).toBeLessThan(SIDEBAR_COLLAPSE_THRESHOLD)
	})

	it("rounds fractional widths coming from pointer deltas", () => {
		expect(clampSidebarWidth(233.7)).toBe(234)
	})

	it("falls back to the default for garbage input", () => {
		expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH)
		expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(
			SIDEBAR_DEFAULT_WIDTH,
		)
	})
})

describe("shouldCollapseSidebar", () => {
	it("collapses below 150px", () => {
		expect(shouldCollapseSidebar(149)).toBe(true)
		expect(shouldCollapseSidebar(120)).toBe(true)
	})

	it("stays open at or above 150px", () => {
		expect(shouldCollapseSidebar(150)).toBe(false)
		expect(shouldCollapseSidebar(300)).toBe(false)
	})
})

describe("restoreSidebarWidth", () => {
	it("reopens a collapsed sidebar at the default width", () => {
		expect(restoreSidebarWidth(120)).toBe(SIDEBAR_DEFAULT_WIDTH)
	})

	it("keeps a width the user deliberately chose", () => {
		expect(restoreSidebarWidth(300)).toBe(300)
		expect(restoreSidebarWidth(150)).toBe(150)
	})
})
