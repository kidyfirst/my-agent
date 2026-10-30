export interface ProjectInfo {
	name: string
	rootPath: string
	gitBranch?: string
	/** True when the project resolves to a git repo (branch can be empty without commits). */
	isGitRepo?: boolean
	isWorktree?: boolean
}

export type WorktreeStatus = "in_progress" | "in_review" | "done" | "archived"
