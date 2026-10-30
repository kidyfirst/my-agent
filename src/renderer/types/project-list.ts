import type { QueuedMessage } from "./chat"
import type { ThreadInfo } from "./ipc"
import type { WorktreeStatus } from "./project"

export interface WorktreeInfo {
	path: string
	branch: string
	/** When the worktree directory was created, used to keep rows in place. */
	createdAt?: string
}

export interface EnrichedProject {
	name: string
	rootPath: string
	lastOpened: string
	/** When the project was first added; the list is ordered by this, not by lastOpened. */
	createdAt?: string
	gitBranch?: string
	isWorktree?: boolean
	mainRepoPath?: string
	worktrees: WorktreeInfo[]
}

export interface ProjectListProps {
	projects: EnrichedProject[]
	activeProjectPath: string | null
	isAgentActive: boolean
	activeWorktrees: Set<string>
	unreadWorktrees: Set<string>
	worktreeStatuses: Map<string, WorktreeStatus>
	recordingProjects?: Set<string>
	recordingThreads?: Set<string>
	replayingProjects?: Set<string>
	replayingThreads?: Set<string>
	onToggleRecording?: (threadId?: string, projectPath?: string) => void
	onStopReplay?: (threadId?: string, projectPath?: string) => void
	linkedIssues?: Record<
		string,
		{ issueId: string; issueIdentifier: string; provider?: string }
	>
	/** Sessions of the currently active project, nested under its group. */
	threads?: ThreadInfo[]
	/**
	 * Sessions keyed by folder path (project root or worktree path). Lets every
	 * expanded group render its own list, not just the open project's.
	 */
	threadsByPath?: Record<string, ThreadInfo[]>
	/**
	 * Folder path `threads` was listed for. Without it the live list is assumed
	 * to be the open project's; with it, it is only ever rendered under that
	 * exact folder — a switch to another project must not paint the previous
	 * project's sessions under the new one while its own list is still loading.
	 */
	threadsPath?: string | null
	currentThreadId?: string | null
	runningThreadId?: string | null
	queuesByThread?: Record<string, QueuedMessage[]>
	/** Case-insensitive filter applied to project names, branches and sessions. */
	filterText?: string
	onSwitchProject: (path: string) => void
	/**
	 * Open a session that may live in another project: switch project first when
	 * needed, then switch thread.
	 */
	onOpenSession?: (projectPath: string, threadId: string) => void
	/**
	 * Rename or delete a session whose project isn't open. Without it those rows
	 * are read-only (the active harness can't reach their threads).
	 */
	onMutateForeignThread?: (
		projectPath: string,
		threadId: string,
		action: "rename" | "delete",
		title?: string,
	) => void
	onOpenFolder: () => void
	onCloneRepo: () => void
	onRemoveProject: (path: string, deleteHistory?: boolean) => void
	onCreateWorktree: (repoPath: string) => void
	onDeleteWorktree: (worktreePath: string) => void
	onRenameProject: (projectPath: string, newName: string) => void
	/**
	 * Rename a worktree's branch. Its sidebar row is labelled by the branch, so
	 * an inline rename there has to move the branch instead of a display name.
	 */
	onRenameWorktree?: (worktreePath: string, newName: string) => void
	onSwitchThread: (threadId: string) => void
	onNewThread: (projectPath?: string) => void
	onDeleteThread: (threadId: string) => void
	onRenameThread: (threadId: string, title: string) => void
	onAbort?: () => void
}
