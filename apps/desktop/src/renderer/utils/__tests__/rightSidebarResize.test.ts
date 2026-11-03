import { describe, expect, it } from "vitest"
import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	SIDEBAR_MIN_DRAG_WIDTH,
} from "../sidebarResize"
import {
	CENTER_MIN_WIDTH,
	CENTER_MIN_WIDTH_NO_SIDEBAR,
	RIGHT_SIDEBAR_COLLAPSE_THRESHOLD,
	RIGHT_SIDEBAR_DEFAULT_WIDTH,
	RIGHT_SIDEBAR_MIN_DRAG_WIDTH,
	clampRightSidebarWidth,
	restoreRightSidebarWidth,
	rightPanelLayoutReserve,
	rightSidebarMaxWidth,
	shouldCollapseRightSidebar,
} from "../rightSidebarResize"

describe("rightSidebarMaxWidth", () => {
	it("leaves 700px for the chat panel and the left sidebar", () => {
		expect(rightSidebarMaxWidth(1440)).toBe(740)
		expect(rightSidebarMaxWidth(1200)).toBe(500)
	})

	it("never drops below the drag minimum on a tiny window", () => {
		expect(rightSidebarMaxWidth(800)).toBe(RIGHT_SIDEBAR_MIN_DRAG_WIDTH)
		expect(rightSidebarMaxWidth(Number.NaN)).toBe(RIGHT_SIDEBAR_DEFAULT_WIDTH)
	})
})

describe("rightPanelLayoutReserve", () => {
	it("counts the left sidebar plus the chat minimum while the sidebar is open", () => {
		expect(rightPanelLayoutReserve(true, 260)).toBe(260 + CENTER_MIN_WIDTH)
		expect(rightPanelLayoutReserve(true, 300)).toBe(300 + CENTER_MIN_WIDTH)
	})

	it("only needs the wider chat minimum once the left sidebar is hidden", () => {
		expect(rightPanelLayoutReserve(false, 260)).toBe(
			CENTER_MIN_WIDTH_NO_SIDEBAR,
		)
	})
})

describe("rightSidebarMaxWidth with a layout reserve", () => {
	it("stops dragging where the chat column hits its minimum", () => {
		const reserve = rightPanelLayoutReserve(true, 260)
		// 1200 - (260 + 590) — dragging further would squeeze the chat panel.
		expect(rightSidebarMaxWidth(1200, reserve)).toBe(350)
		expect(clampRightSidebarWidth(600, 1200, reserve)).toBe(350)
		expect(clampRightSidebarWidth(360, 1200, reserve)).toBe(350)
	})

	it("tightens as the left sidebar gets wider", () => {
		expect(
			clampRightSidebarWidth(600, 1400, rightPanelLayoutReserve(true, 300)),
		).toBe(1400 - (300 + CENTER_MIN_WIDTH))
	})

	it("hands the space back when the left sidebar is hidden", () => {
		expect(
			clampRightSidebarWidth(600, 1400, rightPanelLayoutReserve(false, 300)),
		).toBe(1400 - CENTER_MIN_WIDTH_NO_SIDEBAR)
	})
})

describe("clampRightSidebarWidth", () => {
	it("keeps a comfortable width untouched", () => {
		expect(clampRightSidebarWidth(420, 1440)).toBe(420)
	})

	it("caps the width at what the window allows", () => {
		expect(clampRightSidebarWidth(900, 1200)).toBe(500)
	})

	it("lets the drag go below the usable width so the panel can be closed", () => {
		expect(clampRightSidebarWidth(120, 1440)).toBe(120)
		expect(clampRightSidebarWidth(10, 1440)).toBe(RIGHT_SIDEBAR_MIN_DRAG_WIDTH)
		expect(RIGHT_SIDEBAR_MIN_DRAG_WIDTH).toBeLessThan(
			RIGHT_SIDEBAR_COLLAPSE_THRESHOLD,
		)
	})

	it("rounds and survives junk input", () => {
		expect(clampRightSidebarWidth(321.6, 1440)).toBe(322)
		expect(clampRightSidebarWidth(Number.NaN, 1440)).toBe(
			RIGHT_SIDEBAR_DEFAULT_WIDTH,
		)
	})
})

describe("shouldCollapseRightSidebar", () => {
	it("closes under 150px, exactly like the left sidebar", () => {
		expect(RIGHT_SIDEBAR_COLLAPSE_THRESHOLD).toBe(SIDEBAR_COLLAPSE_THRESHOLD)
		expect(SIDEBAR_MIN_DRAG_WIDTH).toBe(RIGHT_SIDEBAR_MIN_DRAG_WIDTH)
		expect(shouldCollapseRightSidebar(149)).toBe(true)
		expect(shouldCollapseRightSidebar(100)).toBe(true)
		expect(shouldCollapseRightSidebar(150)).toBe(false)
		expect(shouldCollapseRightSidebar(380)).toBe(false)
	})
})

describe("restoreRightSidebarWidth", () => {
	it("reopens at the default width after a collapsing drag", () => {
		expect(restoreRightSidebarWidth(120, 1440)).toBe(
			RIGHT_SIDEBAR_DEFAULT_WIDTH,
		)
	})

	it("keeps a width that is still usable", () => {
		expect(restoreRightSidebarWidth(300, 1440)).toBe(300)
		expect(restoreRightSidebarWidth(150, 1440)).toBe(150)
	})

	it("shrinks a remembered width the window no longer allows", () => {
		expect(restoreRightSidebarWidth(380, 1000)).toBe(300)
	})
})
