/**
 * Visibility rules for the floating "the agent is using the browser" panel.
 *
 * Keeping this pure makes the fiddly part — when the panel should disappear —
 * testable without timers, IPC or a browser. The hook owns the timer, the
 * component owns the pixels.
 */

export interface PreviewFrame {
	dataUrl: string
	url: string
	title: string
	capturedAt: number
	worktreePath: string
	threadId?: string
}

export interface ComputerUsePreviewState {
	frame: PreviewFrame | null
	visible: boolean
	/** A browser tool is running right now. */
	active: boolean
	/** The pointer is over the panel, which must keep it open. */
	hovered: boolean
}

export type ComputerUsePreviewAction =
	| { type: "frame"; frame: PreviewFrame }
	| { type: "toolStart"; toolName: string }
	| { type: "toolEnd"; toolName: string }
	| { type: "agentEnd" }
	| { type: "hoverStart" }
	| { type: "hoverEnd" }
	| { type: "hide" }
	| { type: "closed" }

/** How long the panel lingers after the browser tool stops. */
export const PREVIEW_HIDE_DELAY_MS = 2500

const BROWSER_TOOLS = new Set(["computer", "navigate-browser"])

export function isBrowserToolName(name: string | undefined): boolean {
	return name != null && BROWSER_TOOLS.has(name)
}

export function initialPreviewState(): ComputerUsePreviewState {
	return { frame: null, visible: false, active: false, hovered: false }
}

export function reducePreview(
	state: ComputerUsePreviewState,
	action: ComputerUsePreviewAction,
): ComputerUsePreviewState {
	switch (action.type) {
		case "frame":
			// A frame is proof the browser is live: show it even if an earlier
			// hide already fired (e.g. the model called `computer` again after a
			// long think).
			return { ...state, frame: action.frame, visible: true }

		case "toolStart":
			if (!isBrowserToolName(action.toolName)) return state
			return { ...state, active: true }

		case "toolEnd":
			if (!isBrowserToolName(action.toolName)) return state
			return { ...state, active: false }

		case "agentEnd":
			return { ...state, active: false }

		case "hoverStart":
			return { ...state, hovered: true }

		case "hoverEnd":
			return { ...state, hovered: false }

		case "hide":
			// Never yank the panel out from under the pointer.
			return state.hovered ? state : { ...state, visible: false }

		case "closed":
			return { ...initialPreviewState(), hovered: state.hovered }

		default:
			return state
	}
}

/**
 * True when a hide timer should be running: the panel is on screen, no browser
 * tool is executing, and the pointer is elsewhere.
 */
export function needsHideTimer(state: ComputerUsePreviewState): boolean {
	return state.visible && !state.active && !state.hovered
}

/** Frames from another project or conversation must never appear here. */
export function belongsToView(
	frame: PreviewFrame,
	threadId: string | null | undefined,
	worktreePath: string | null | undefined,
): boolean {
	if (worktreePath && frame.worktreePath) {
		if (normalizeRoot(frame.worktreePath) !== normalizeRoot(worktreePath)) {
			return false
		}
	}
	// `activeThreadKey` falls back to "default" while a new conversation has no
	// id yet. Treating that as a real thread would reject every frame, so only
	// filter on ids that are actually known.
	if (
		isRealThreadId(threadId) &&
		frame.threadId &&
		frame.threadId !== threadId
	) {
		return false
	}
	return true
}

/** Trailing separators differ between sources; they never identify a project. */
function normalizeRoot(root: string): string {
	return root.replace(/[\\/]+$/, "")
}

function isRealThreadId(
	threadId: string | null | undefined,
): threadId is string {
	return Boolean(threadId) && threadId !== "default"
}
