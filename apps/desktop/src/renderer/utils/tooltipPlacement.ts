/** Where the bubble sits horizontally relative to its trigger. */
export type TooltipAlign = "center" | "start" | "end"

export interface AnchorRect {
	left: number
	top: number
	width: number
	height: number
}

/** Breathing room between the trigger and the bubble. */
export const TOOLTIP_GAP = 8
/** Minimum distance the bubble keeps from the window edges. */
export const TOOLTIP_EDGE = 8

/**
 * Put the bubble under the trigger. Alignment is a preference, not a promise:
 * a tooltip near the right edge of the window is pulled back inside the viewport
 * instead of hanging off it.
 */
export function placeTooltip(
	anchor: AnchorRect,
	bubbleWidth: number,
	viewportWidth: number,
	align: TooltipAlign = "center",
): { left: number; top: number } {
	let left: number
	if (align === "start") {
		left = anchor.left
	} else if (align === "end") {
		left = anchor.left + anchor.width - bubbleWidth
	} else {
		left = anchor.left + anchor.width / 2 - bubbleWidth / 2
	}

	const maxLeft = viewportWidth - bubbleWidth - TOOLTIP_EDGE
	left = Math.min(Math.max(left, TOOLTIP_EDGE), Math.max(TOOLTIP_EDGE, maxLeft))

	return { left, top: anchor.top + anchor.height + TOOLTIP_GAP }
}
