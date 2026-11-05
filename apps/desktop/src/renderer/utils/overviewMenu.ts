/**
 * Two entry points into the right sidebar share one destination list: the
 * title-bar "Overview Panel" dropdown and the sidebar's own landing view.
 * Keeping it as data stops the two menus from drifting apart.
 */

export type OverviewAction = "files" | "review" | "terminal" | "browser"

export interface OverviewItem {
	id: OverviewAction
	label: string
}

const FILES: OverviewItem = { id: "files", label: "Files" }
const REVIEW: OverviewItem = { id: "review", label: "Review" }
const TERMINAL: OverviewItem = { id: "terminal", label: "Terminal" }
const BROWSER: OverviewItem = { id: "browser", label: "Browser" }

/**
 * Every destination, browser included. Review only makes sense for a
 * git-backed project — a plain folder has nothing to diff or commit.
 */
export function overviewMenuItems(hasGitRepo: boolean): OverviewItem[] {
	return [FILES, ...(hasGitRepo ? [REVIEW] : []), TERMINAL, BROWSER]
}

/**
 * The title-bar dropdown is the panel shortcut: Files / Review / Terminal.
 * Browser lives in the sidebar's landing list, where the browser panel itself
 * is one destination among several.
 */
export function overviewPanelItems(hasGitRepo: boolean): OverviewItem[] {
	return [FILES, ...(hasGitRepo ? [REVIEW] : []), TERMINAL]
}
