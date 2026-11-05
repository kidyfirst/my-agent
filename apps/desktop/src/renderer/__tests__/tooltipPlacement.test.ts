import { describe, expect, it } from "vitest"
import {
	placeTooltip,
	TOOLTIP_EDGE,
	TOOLTIP_GAP,
} from "../utils/tooltipPlacement"

const anchor = { left: 200, top: 5, width: 28, height: 28 }

describe("placeTooltip", () => {
	it("centres the bubble under the trigger", () => {
		const { left, top } = placeTooltip(anchor, 120, 1200)
		expect(left).toBe(154) // 200 + 14 - 60
		expect(top).toBe(5 + 28 + TOOLTIP_GAP)
	})

	it("aligns to the trigger's leading or trailing edge", () => {
		expect(placeTooltip(anchor, 120, 1200, "start").left).toBe(200)
		expect(placeTooltip(anchor, 120, 1200, "end").left).toBe(108) // 228 - 120
	})

	it("keeps the bubble inside the window", () => {
		// A title-bar icon near the right edge would otherwise hang off it.
		const edge = { left: 1150, top: 5, width: 28, height: 28 }
		expect(placeTooltip(edge, 160, 1200).left).toBe(1200 - 160 - TOOLTIP_EDGE)

		const corner = { left: 0, top: 5, width: 28, height: 28 }
		expect(placeTooltip(corner, 160, 1200, "start").left).toBe(TOOLTIP_EDGE)
	})

	it("does not push a bubble wider than the window off the left edge", () => {
		const { left } = placeTooltip(anchor, 2400, 1200)
		expect(left).toBe(TOOLTIP_EDGE)
	})
})
