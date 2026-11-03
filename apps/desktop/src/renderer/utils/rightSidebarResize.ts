/**
 * Right sidebar geometry.
 *
 * Mirrors the left sidebar: dragging may go below the usable width, and
 * releasing the mouse while the panel is that narrow hides it — the gesture
 * closes the panel, so there is no need to hunt for the toggle button.
 *
 * Width is bounded from above by the space the rest of the window needs: the
 * chat panel may not shrink below its own minimum, so the splitter stops there
 * instead of letting the right panel grow over (and clip) the chat column.
 */
import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	SIDEBAR_MIN_DRAG_WIDTH,
} from "./sidebarResize"

export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 380

/** Same closing gesture on both sides, so the drag feels identical. */
export const RIGHT_SIDEBAR_COLLAPSE_THRESHOLD = SIDEBAR_COLLAPSE_THRESHOLD
export const RIGHT_SIDEBAR_MIN_DRAG_WIDTH = SIDEBAR_MIN_DRAG_WIDTH

/** Chat panel minimum while the left sidebar is open (App's center `minWidth`). */
export const CENTER_MIN_WIDTH = 590

/** ... and once the left sidebar is hidden, where the chat panel takes over. */
export const CENTER_MIN_WIDTH_NO_SIDEBAR = 850

/** Space the right panel must leave free when no layout is supplied. */
export const RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH = 700

/** Width of the splitter on the panel's left edge (matches the left sidebar). */
export const RIGHT_SIDEBAR_RESIZE_HANDLE_WIDTH = 4

/**
 * Width the right panel must leave for the left sidebar plus the chat panel.
 * Grows and shrinks with the left sidebar, so dragging the right splitter can
 * never squeeze the chat column past its minimum.
 */
export function rightPanelLayoutReserve(
	sidebarVisible: boolean,
	sidebarWidth: number,
): number {
	const left = sidebarVisible ? Math.max(0, sidebarWidth) : 0
	return (
		left + (sidebarVisible ? CENTER_MIN_WIDTH : CENTER_MIN_WIDTH_NO_SIDEBAR)
	)
}

/** Widest the panel may be for a given window width and layout reserve. */
export function rightSidebarMaxWidth(
	viewportWidth: number,
	reserve: number = RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
): number {
	if (!Number.isFinite(viewportWidth)) return RIGHT_SIDEBAR_DEFAULT_WIDTH
	const available = viewportWidth - (Number.isFinite(reserve) ? reserve : 0)
	return Math.max(RIGHT_SIDEBAR_MIN_DRAG_WIDTH, Math.round(available))
}

/** Clamp a candidate width into the range the window currently allows. */
export function clampRightSidebarWidth(
	width: number,
	viewportWidth: number,
	reserve: number = RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
): number {
	const max = rightSidebarMaxWidth(viewportWidth, reserve)
	if (!Number.isFinite(width)) return Math.min(RIGHT_SIDEBAR_DEFAULT_WIDTH, max)
	const clamped = Math.min(max, Math.max(RIGHT_SIDEBAR_MIN_DRAG_WIDTH, width))
	return Math.round(clamped)
}

/** True when the drag ended narrow enough that the panel should disappear. */
export function shouldCollapseRightSidebar(width: number): boolean {
	return width < RIGHT_SIDEBAR_COLLAPSE_THRESHOLD
}

/**
 * Width to use when the panel becomes visible again. A width left behind by a
 * collapsing drag must not be restored — reopening into a 120px sliver would
 * look broken.
 */
export function restoreRightSidebarWidth(
	width: number,
	viewportWidth: number,
	reserve: number = RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
): number {
	const max = rightSidebarMaxWidth(viewportWidth, reserve)
	if (shouldCollapseRightSidebar(width)) {
		return Math.min(RIGHT_SIDEBAR_DEFAULT_WIDTH, max)
	}
	return Math.min(width, max)
}
