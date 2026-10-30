import type { WorktreeStatus } from "../types/project"

// Stable color palette for worktree branches — visually distinct
export const branchColors = [
	"#7c3aed", // purple
	"#2563eb", // blue
	"#059669", // green
	"#d97706", // amber
	"#dc2626", // red
	"#0891b2", // cyan
	"#c026d3", // fuchsia
	"#ea580c", // orange
	"#16a34a", // emerald
	"#e11d48", // rose
]

// Hash a string to a stable color index so the same branch always gets the same color
export function hashColor(str: string): string {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
	}
	return branchColors[Math.abs(hash) % branchColors.length]
}

export const statusConfig: Record<
	WorktreeStatus,
	{ label: string; color: string }
> = {
	in_progress: { label: "In Progress", color: "#d97706" },
	in_review: { label: "In Review", color: "#2563eb" },
	done: { label: "Done", color: "#059669" },
	archived: { label: "Archived", color: "#6b7280" },
}

export const statusOrder: WorktreeStatus[] = [
	"in_progress",
	"in_review",
	"done",
	"archived",
]

/**
 * Whether the project actually lives inside a git repository.
 *
 * Every git-specific surface (Git tab, Create PR, branch chips, "New worktree")
 * keys off this: a plain folder has no repo, so none of that UI makes sense and
 * must not be rendered. `detectProject` reports `isGitRepo` directly; older
 * payloads only carry `gitBranch`, hence the fallback.
 */
export function hasGitRepo(
	project: { isGitRepo?: boolean; gitBranch?: string } | null | undefined,
): boolean {
	if (!project) return false
	if (typeof project.isGitRepo === "boolean") return project.isGitRepo
	return Boolean(project.gitBranch)
}

/**
 * Worktrees can only be created inside a git repo.
 *
 * `detectProject` leaves `gitBranch` empty for a plain folder (and for a repo
 * without any commit yet), which is our signal that there is nothing to branch
 * off — such a project must not offer "New worktree".
 */
export function supportsWorktrees(project: {
	isWorktree?: boolean
	gitBranch?: string
}): boolean {
	return !project.isWorktree && Boolean(project.gitBranch)
}

/** Epoch millis for a creation timestamp; unparseable/absent values sort last. */
export function createdTime(value?: string | null): number {
	if (!value) return 0
	const ms = new Date(value).getTime()
	return Number.isNaN(ms) ? 0 : ms
}

/**
 * Stable "creation order" for projects, worktrees and sessions.
 *
 * The sidebar used to be ordered by `lastOpened`, which reshuffled every time a
 * session was opened — the active project jumped to the top. Ordering by the
 * moment something was created keeps rows where the user last saw them: new
 * entries appear on top, existing ones never move.
 */
export function sortByCreatedAt<T>(
	items: T[],
	getTime: (item: T) => string | null | undefined,
): T[] {
	return [...items].sort(
		(a, b) => createdTime(getTime(b)) - createdTime(getTime(a)),
	)
}

/**
 * Live sessions plus whatever the stored snapshot knows that the live list does
 * not.
 *
 * Right after switching projects (or opening a worktree) the live list is
 * briefly empty — the harness has not listed its threads yet — and the folder
 * you just opened looked like it had collapsed, even though its rows were still
 * in the snapshot. Sessions are keyed by id, so this de-dupes rather than
 * concatenates: a session created a second ago exists only in the live list,
 * and one that is not listed yet still exists in the snapshot.
 */
export function mergeLiveThreads<T extends { id: string }>(
	live: T[],
	snapshot: T[],
): T[] {
	if (live.length === 0) return snapshot
	if (snapshot.length === 0) return live
	const liveIds = new Set(live.map((t) => t.id))
	const missing = snapshot.filter((t) => !liveIds.has(t.id))
	return missing.length === 0 ? live : [...live, ...missing]
}

/**
 * Fold a fresh snapshot into the cache instead of replacing it.
 *
 * Only the paths the response actually carries are overwritten: a folder that
 * came back empty is genuinely empty, but a response that is missing a folder
 * (main process unable to read it, call failed) must not wipe rows that are
 * already on screen — a project you just left would suddenly look collapsed.
 */
export function mergeThreadsByPath<T>(
	previous: Record<string, T[]>,
	requested: string[],
	response: Record<string, T[]> | null | undefined,
): Record<string, T[]> {
	const next = { ...previous }
	if (!response) return next
	for (const folderPath of requested) {
		if (!(folderPath in response)) continue
		const list = response[folderPath]
		next[folderPath] = Array.isArray(list) ? list : []
	}
	return next
}

/**
 * Ids a snapshot proves deleted.
 *
 * The threads table only grows on create, so a read that comes back with fewer
 * rows than last time means rows were deleted — never that they moved. Only an
 * actual shrink counts: an empty/absent folder is a failed or partial read and
 * must not be read as "everything was deleted".
 */
export function removedThreadIds(
	before: Array<{ id: string }> | undefined,
	after: Array<{ id: string }> | undefined,
): string[] {
	if (!before?.length || !after) return []
	if (after.length >= before.length) return []
	const alive = new Set(after.map((t) => t.id))
	return before.filter((t) => !alive.has(t.id)).map((t) => t.id)
}

/**
 * Sessions of every folder: what is on disk, plus what is only in memory.
 *
 * The two sources have different scopes — `listThreads` answers for the open
 * project only, the table read answers for every folder — so they are kept apart
 * instead of merged into one bag. `live` is keyed by the folder the list was
 * listed for; a switch makes the next project active before its own list
 * arrives, and using "the active project" as the key there painted the previous
 * project's sessions under the new one (they then vanished again a frame later).
 */
export interface ThreadSources<T> {
	/** Persisted rows, keyed by folder path. */
	snapshots: Record<string, T[]>
	/** Last live list seen for a folder, keyed by that folder's path. */
	live: Record<string, T[]>
}

/** Remember a live list under the folder it was listed for. */
export function rememberLiveList<T extends { id: string }>(
	sources: ThreadSources<T>,
	folderPath: string | null | undefined,
	list: T[],
): ThreadSources<T> {
	if (!folderPath) return sources
	const previous = sources.live[folderPath]
	// An empty list is "not listed yet", not "no sessions": a project switch
	// clears the live list before the new one arrives, and overwriting the cache
	// there would blank a folder that still has rows. Real deletions arrive as a
	// shrinking snapshot (see `applySnapshotRead`).
	if (list.length === 0 && previous && previous.length > 0) return sources
	// The list is rebuilt on every harness event; skip no-op writes so the
	// sidebar does not re-render (and re-measure) for nothing.
	if (previous && previous.length === list.length) {
		let same = true
		for (let i = 0; i < list.length; i++) {
			if (previous[i]?.id !== list[i]?.id) {
				same = false
				break
			}
		}
		if (same) return sources
	}
	return { ...sources, live: { ...sources.live, [folderPath]: list } }
}

/**
 * Apply a snapshot read.
 *
 * A snapshot that lost rows is the authority on a deletion (the table only grows
 * on create), so those ids are dropped from the live cache too — otherwise the
 * union would resurrect a deleted row until the next reload.
 */
export function applySnapshotRead<T extends { id: string }>(
	sources: ThreadSources<T>,
	requested: string[],
	response: Record<string, T[]> | null | undefined,
): ThreadSources<T> {
	const snapshots = mergeThreadsByPath(sources.snapshots, requested, response)
	let live: Record<string, T[]> | null = null
	for (const folderPath of requested) {
		const gone = removedThreadIds(
			sources.snapshots[folderPath],
			snapshots[folderPath],
		)
		if (gone.length === 0) continue
		const dead = new Set(gone)
		live = live ?? { ...sources.live }
		live[folderPath] = (live[folderPath] ?? []).filter((t) => !dead.has(t.id))
	}
	return live ? { snapshots, live } : { ...sources, snapshots }
}

/** Union of both sources, per folder, ready for the sidebar to render. */
export function sessionRowsByPath<T extends { id: string }>(
	sources: ThreadSources<T>,
	activeThreadsPath: string | null,
	activeThreads: T[],
): Record<string, T[]> {
	const result: Record<string, T[]> = { ...sources.snapshots }
	if (activeThreadsPath && !(activeThreadsPath in result)) {
		// The open folder is always answered for, even before its first snapshot
		// lands: the rows on screen must not depend on a round trip.
		result[activeThreadsPath] = activeThreads
	}
	for (const [folderPath, cached] of Object.entries(sources.live)) {
		// The open folder's list is the live list itself (the cache may be one
		// render behind); every other folder uses what was last listed for it.
		const live =
			folderPath === activeThreadsPath ? activeThreads : (cached ?? [])
		result[folderPath] = mergeLiveThreads(
			live ?? [],
			sources.snapshots[folderPath] ?? [],
		)
	}
	return withSingleOwner(
		result,
		sources.snapshots,
		activeThreadsPath,
		activeThreads,
	)
}

/**
 * One session, one row.
 *
 * The live list is tagged with the folder it was listed for, but the tag can
 * still be wrong: the main process resumes a thread and reports it as active
 * before the list of the folder it came from is re-read, so a switch can leave
 * another project's session tagged with the folder that just became active. The
 * union with that folder's snapshot then painted the same row under two
 * projects — and since selection is by thread id, **both** rows looked selected.
 *
 * Ownership is decided by evidence, strongest first:
 *  1. the folder whose persisted snapshot lists the row — the threads table is
 *     the only authority on which folder a session belongs to;
 *  2. the open folder's live list — a session created a second ago is in no
 *     table yet, and it must show where it was just created;
 *  3. any folder that lists it, so a row known only to a cached list is not
 *     dropped from the only group that has it.
 *
 * Rows that lose are dropped rather than shown twice: a session that is listed
 * under the wrong project is worse than one that briefly sits under its real
 * one.
 */
function withSingleOwner<T extends { id: string }>(
	result: Record<string, T[]>,
	snapshots: Record<string, T[]>,
	activeThreadsPath: string | null,
	activeThreads: T[],
): Record<string, T[]> {
	const owners = new Map<string, string>()
	const claim = (rows: T[] | undefined, folderPath: string) => {
		for (const row of rows ?? []) {
			if (!owners.has(row.id)) owners.set(row.id, folderPath)
		}
	}
	for (const [folderPath, rows] of Object.entries(snapshots)) {
		claim(rows, folderPath)
	}
	if (activeThreadsPath) claim(activeThreads, activeThreadsPath)
	for (const [folderPath, rows] of Object.entries(result))
		claim(rows, folderPath)

	let dropped = false
	const next: Record<string, T[]> = {}
	for (const [folderPath, rows] of Object.entries(result)) {
		const owned = rows.filter((row) => owners.get(row.id) === folderPath)
		if (owned.length !== rows.length) dropped = true
		next[folderPath] = owned
	}
	return dropped ? next : result
}

/** The two nesting levels the sidebar can collapse. */
export interface SidebarGroup {
	root: { rootPath: string }
	worktrees: Array<{ rootPath: string }>
}

/**
 * Every row that owns hidden rows: project roots and, one level down, their
 * worktrees. Sessions hang under whichever folder opened them, so a folder that
 * stays collapsed keeps its sessions out of sight — "Collapse all" has to reach
 * both levels for the list to actually end up empty.
 */
export function collapseTargets(groups: SidebarGroup[]): {
	projects: string[]
	worktrees: string[]
} {
	return {
		projects: groups.map((g) => g.root.rootPath),
		worktrees: groups.flatMap((g) => g.worktrees.map((wt) => wt.rootPath)),
	}
}
