/**
 * Left sidebar geometry.
 *
 * The sidebar can be dragged between a comfortable minimum and 300px. Dragging
 * is allowed below the "usable" width on purpose: releasing the mouse while the
 * panel is that narrow collapses it, which is how the user closes the sidebar
 * by dragging instead of hunting for the toggle button.
 */
export const SIDEBAR_DEFAULT_WIDTH = 260

/** Widest the sidebar may get, no matter how far the pointer travels. */
export const SIDEBAR_MAX_WIDTH = 300

/** Below this width the sidebar is not usable, so releasing the drag closes it. */
export const SIDEBAR_COLLAPSE_THRESHOLD = 150

/** How far the drag itself may go — below the threshold, so closing feels intentional. */
export const SIDEBAR_MIN_DRAG_WIDTH = 100

/** Width of the draggable strip on the sidebar's right edge (matches the right panel's splitter). */
export const SIDEBAR_RESIZE_HANDLE_WIDTH = 4

/** Clamp a candidate width (usually `startWidth + pointerDelta`) into range. */
export function clampSidebarWidth(width: number): number {
	if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH
	const clamped = Math.min(
		SIDEBAR_MAX_WIDTH,
		Math.max(SIDEBAR_MIN_DRAG_WIDTH, width),
	)
	return Math.round(clamped)
}

/** True when the drag ended narrow enough that the sidebar should disappear. */
export function shouldCollapseSidebar(width: number): boolean {
	return width < SIDEBAR_COLLAPSE_THRESHOLD
}

/**
 * Width to use when the sidebar becomes visible again. A width left behind by a
 * collapsing drag must not be restored — reopening into a 120px sliver would
 * look broken.
 */
export function restoreSidebarWidth(width: number): number {
	return shouldCollapseSidebar(width) ? SIDEBAR_DEFAULT_WIDTH : width
}
