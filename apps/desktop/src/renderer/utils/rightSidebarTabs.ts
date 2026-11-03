/**
 * Right sidebar tab model.
 *
 * Kept outside the component so the visibility rules stay pure and testable:
 * the "Git" tab only exists for projects that actually resolve to a git repo.
 */

export type RightSidebarTab = "files" | "git" | "context"

const allTabs: Array<{ id: RightSidebarTab; label: string }> = [
	{ id: "files", label: "Files" },
	{ id: "git", label: "Git" },
	{ id: "context", label: "Context" },
]

/**
 * Tabs to render for the current project. Without a git repo the Git tab is
 * dropped entirely — there is no status to show and nothing to stage/commit.
 */
export function rightSidebarTabs(
	hasGitRepo: boolean,
): Array<{ id: RightSidebarTab; label: string }> {
	return hasGitRepo ? allTabs : allTabs.filter((tab) => tab.id !== "git")
}

/**
 * Which tab should actually be shown. Guards against a stale "git" selection
 * after switching from a repo to a plain folder (or when the panel reopens).
 */
export function resolveRightSidebarTab(
	activeTab: RightSidebarTab,
	hasGitRepo: boolean,
): RightSidebarTab {
	return activeTab === "git" && !hasGitRepo ? "files" : activeTab
}
