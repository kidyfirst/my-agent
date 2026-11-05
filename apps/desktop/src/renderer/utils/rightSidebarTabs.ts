/**
 * Right sidebar navigation model.
 *
 * The sidebar is a tabbed container, not a single destination: picking a row
 * from the Overview list opens it as a closeable tab. Several destinations can
 * stay open at once (Files + Terminal + Browser, …) and each keeps its own
 * state while hidden.
 *
 * "menu" is *not* a tab — it is the empty state the panel falls back to when
 * nothing is open, so the strip only ever lists real destinations.
 *
 * Kept as pure data so the shell, the command palette, keyboard shortcuts and
 * harness events all drive the very same tab model.
 */

import type { OverviewAction } from "./overviewMenu"

export type RightSidebarPanel =
	| "files"
	| "git"
	| "context"
	| "browser"
	| "terminal"
export type RightSidebarTab = "menu" | RightSidebarPanel

/** An Overview menu row always opens exactly one destination tab. */
export function overviewActionToTab(action: OverviewAction): RightSidebarTab {
	switch (action) {
		case "review":
			return "git"
		case "terminal":
			return "terminal"
		case "browser":
			return "browser"
		default:
			return "files"
	}
}

const LABELS: Record<RightSidebarTab, string> = {
	menu: "Overview",
	files: "Files",
	git: "Review",
	context: "Context",
	browser: "Browser",
	terminal: "Terminal",
}

export function rightSidebarTabLabel(tab: RightSidebarTab): string {
	return LABELS[tab]
}

export interface RightSidebarTabsState {
	/** Opened destinations in display order. Overview is never one of them. */
	open: RightSidebarPanel[]
	active: RightSidebarTab
}

export function createRightSidebarTabs(): RightSidebarTabsState {
	return { open: [], active: "menu" }
}

/** Open a destination, or just focus it when it is already open. */
export function openRightSidebarTab(
	state: RightSidebarTabsState,
	tab: RightSidebarTab,
): RightSidebarTabsState {
	if (tab === "menu") {
		return state.active === "menu" ? state : { ...state, active: "menu" }
	}
	const open = state.open.includes(tab) ? state.open : [...state.open, tab]
	if (state.active === tab && open === state.open) return state
	return { open, active: tab }
}

/** Close a destination tab, focusing a neighbour — or the landing list. */
export function closeRightSidebarTab(
	state: RightSidebarTabsState,
	tab: RightSidebarPanel,
): RightSidebarTabsState {
	const index = state.open.indexOf(tab)
	if (index === -1) return state
	const open = state.open.filter((id) => id !== tab)
	if (state.active !== tab) return { open, active: state.active }
	return { open, active: open[Math.min(index, open.length - 1)] ?? "menu" }
}

/**
 * Which destination should actually be shown. Guards against a stale "git"
 * selection after switching from a repo to a plain folder.
 */
export function resolveRightSidebarTab(
	activeTab: RightSidebarTab,
	hasGitRepo: boolean,
): RightSidebarTab {
	return activeTab === "git" && !hasGitRepo ? "files" : activeTab
}

/** Tabs to draw: every opened destination, in the order it was opened. */
export function visibleRightSidebarTabs(
	state: RightSidebarTabsState,
	hasGitRepo: boolean,
): RightSidebarPanel[] {
	const available = (tab: RightSidebarPanel) => tab !== "git" || hasGitRepo
	const open = state.open.filter(available)
	// A caller may activate a destination it never explicitly opened (a
	// shortcut, the command palette). It still needs a tab to look active.
	if (
		state.active !== "menu" &&
		available(state.active) &&
		!open.includes(state.active)
	) {
		open.push(state.active)
	}
	return open
}

/**
 * Active tab. Overview is not a tab any more, so selecting it shows the landing
 * list with no tab highlighted; a stale destination (Git going away with the
 * repo) falls back to the first tab that is still open.
 */
export function resolveRightSidebarTabs(
	state: RightSidebarTabsState,
	hasGitRepo: boolean,
): RightSidebarTab {
	const tabs = visibleRightSidebarTabs(state, hasGitRepo)
	const wanted = resolveRightSidebarTab(state.active, hasGitRepo)
	if (wanted === "menu") return "menu"
	return tabs.includes(wanted) ? wanted : (tabs[0] ?? "menu")
}
