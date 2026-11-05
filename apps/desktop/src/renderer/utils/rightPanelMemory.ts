import {
	createRightSidebarTabs,
	type RightSidebarTabsState,
} from "./rightSidebarTabs"

/**
 * What a session remembers about its right panel.
 *
 * The panel is per-conversation furniture: one session may be busy with the
 * file tree, another may have four tabs open, a third may have closed it. The
 * app keeps every session's answer and hands it back when that session is
 * opened again.
 */
export interface RightPanelState {
	visible: boolean
	tabs: RightSidebarTabsState
}

/** Puts a session's panel state away. */
export function rememberRightPanel(
	memory: Map<string, RightPanelState>,
	key: string,
	state: RightPanelState,
): void {
	memory.set(key, state)
}

/**
 * Hands a session's panel state back — or `null` for a session that has never
 * had one, which the caller must not confuse with "had one, and it was closed".
 */
export function recallRightPanel(
	memory: Map<string, RightPanelState>,
	key: string,
): RightPanelState | null {
	return memory.get(key) ?? null
}

/** State to open a session with when it has nothing remembered. */
export function defaultRightPanelState(): RightPanelState {
	return { visible: false, tabs: createRightSidebarTabs() }
}
