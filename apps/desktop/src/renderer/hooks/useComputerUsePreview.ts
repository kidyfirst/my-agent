import { useCallback, useEffect, useReducer, useRef } from "react"
import {
	PREVIEW_HIDE_DELAY_MS,
	belongsToView,
	initialPreviewState,
	needsHideTimer,
	reducePreview,
	type PreviewFrame,
} from "../utils/computerUsePreview"

/**
 * Subscribes to the browser mirror published by the main process and decides
 * whether the floating panel is on screen.
 *
 * The main window and the pop-out window both use this; the pop-out simply
 * renders a larger version and never auto-hides (see `useBrowserPreviewFrames`).
 */
export function useComputerUsePreview(
	threadId: string | null | undefined,
	worktreePath: string | null | undefined,
) {
	const [state, dispatch] = useReducer(
		reducePreview,
		undefined,
		initialPreviewState,
	)
	// Read the latest scope inside the subscription without re-subscribing on
	// every thread switch.
	const scopeRef = useRef({ threadId, worktreePath })
	scopeRef.current = { threadId, worktreePath }

	useEffect(() => {
		const off = window.api.onEvent((raw: unknown) => {
			const event = raw as {
				type?: string
				toolName?: string
				threadId?: string
				worktreePath?: string
				dataUrl?: string
				url?: string
				title?: string
				capturedAt?: number
			}
			if (!event?.type) return

			if (event.type === "browser_preview") {
				if (typeof event.dataUrl !== "string") return
				const frame: PreviewFrame = {
					dataUrl: event.dataUrl,
					url: event.url ?? "",
					title: event.title ?? "",
					capturedAt: event.capturedAt ?? Date.now(),
					worktreePath: event.worktreePath ?? "",
					threadId: event.threadId,
				}
				const { threadId: currentThread, worktreePath: currentRoot } =
					scopeRef.current
				if (!belongsToView(frame, currentThread, currentRoot)) return
				dispatch({ type: "frame", frame })
				return
			}

			if (event.type === "browser_preview_closed") {
				const { worktreePath: currentRoot } = scopeRef.current
				if (
					currentRoot &&
					event.worktreePath &&
					event.worktreePath !== currentRoot
				) {
					return
				}
				dispatch({ type: "closed" })
				return
			}

			if (event.type === "tool_start") {
				// Another project's run must not pin or release this panel.
				if (
					isForeignProject(event.worktreePath, scopeRef.current.worktreePath)
				) {
					return
				}
				dispatch({ type: "toolStart", toolName: event.toolName ?? "" })
			} else if (event.type === "tool_end") {
				if (
					isForeignProject(event.worktreePath, scopeRef.current.worktreePath)
				) {
					return
				}
				dispatch({ type: "toolEnd", toolName: event.toolName ?? "" })
			} else if (event.type === "agent_end") {
				dispatch({ type: "agentEnd" })
			} else if (event.type === "thread_changed") {
				// Frames belong to the conversation that produced them.
				dispatch({ type: "closed" })
			}
		})
		return off
	}, [])

	// One timer, derived from state: it exists exactly while the panel is shown
	// and idle, and any new frame or tool start cancels it by changing state.
	useEffect(() => {
		if (!needsHideTimer(state)) return
		const timer = setTimeout(
			() => dispatch({ type: "hide" }),
			PREVIEW_HIDE_DELAY_MS,
		)
		return () => clearTimeout(timer)
	}, [state])

	const onHoverStart = useCallback(() => dispatch({ type: "hoverStart" }), [])
	const onHoverEnd = useCallback(() => dispatch({ type: "hoverEnd" }), [])
	const hide = useCallback(() => dispatch({ type: "hide" }), [])

	return { ...state, onHoverStart, onHoverEnd, hide }
}

/**
 * Frame stream only — used by the pop-out window, which shows whatever the
 * browser is doing until it is closed.
 */ export function useBrowserPreviewFrames(
	worktreePath: string | null,
	initialFrame?: PreviewFrame | null,
) {
	const [state, dispatch] = useReducer(reducePreview, undefined, () => ({
		...initialPreviewState(),
		...(initialFrame ? { frame: initialFrame, visible: true } : {}),
	}))
	const rootRef = useRef(worktreePath)
	rootRef.current = worktreePath

	useEffect(() => {
		if (!worktreePath) return
		// A window opened mid-run has missed every broadcast so far.
		window.api
			.invoke({ type: "getBrowserPreview", worktreePath })
			.then((result) => {
				const payload = result as {
					frame?: PreviewFrame
					threadId?: string
				} | null
				if (!payload?.frame) return
				dispatch({
					type: "frame",
					frame: {
						...payload.frame,
						worktreePath,
						threadId: payload.threadId,
					},
				})
			})
			.catch(() => {})
	}, [worktreePath])

	useEffect(() => {
		const off = window.api.onEvent((raw: unknown) => {
			const event = raw as {
				type?: string
				toolName?: string
				dataUrl?: string
				url?: string
				title?: string
				capturedAt?: number
				worktreePath?: string
				threadId?: string
			}
			if (event?.type === "browser_preview") {
				if (typeof event.dataUrl !== "string") return
				if (rootRef.current && event.worktreePath !== rootRef.current) return
				dispatch({
					type: "frame",
					frame: {
						dataUrl: event.dataUrl,
						url: event.url ?? "",
						title: event.title ?? "",
						capturedAt: event.capturedAt ?? Date.now(),
						worktreePath: event.worktreePath ?? "",
						threadId: event.threadId,
					},
				})
			} else if (event?.type === "browser_preview_closed") {
				if (rootRef.current && event.worktreePath !== rootRef.current) return
				dispatch({ type: "closed" })
			} else if (event?.type === "tool_start" || event?.type === "tool_end") {
				// The docked panel labels its stream from this, so another
				// project's run must not flip it to "live".
				if (
					rootRef.current &&
					event.worktreePath &&
					event.worktreePath !== rootRef.current
				) {
					return
				}
				dispatch({
					type: event.type === "tool_start" ? "toolStart" : "toolEnd",
					toolName: event.toolName ?? "",
				})
			}
		})
		return off
	}, [])

	return state
}

/** An event from a project the user is not looking at. */
function isForeignProject(
	eventRoot: string | undefined,
	viewRoot: string | null | undefined,
): boolean {
	if (!eventRoot || !viewRoot) return false
	return eventRoot.replace(/[\\/]+$/, "") !== viewRoot.replace(/[\\/]+$/, "")
}
