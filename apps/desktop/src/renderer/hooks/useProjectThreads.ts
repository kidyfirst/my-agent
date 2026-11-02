import { useCallback, useEffect, useMemo, useState } from "react"
import type { ThreadInfo } from "../types/ipc"
import type { EnrichedProject } from "../types/project-list"
import {
	applySnapshotRead,
	rememberLiveList,
	sessionRowsByPath,
	type ThreadSources,
} from "../utils/project-list"

/**
 * Every folder the sidebar can show sessions for: each project root plus each of
 * its worktrees. Worktrees are listed separately because a worktree carries its
 * own sessions, independent of the project above it.
 */
export function collectProjectPaths(projects: EnrichedProject[]): string[] {
	const paths: string[] = []
	const seen = new Set<string>()
	const push = (p?: string) => {
		if (!p || seen.has(p)) return
		seen.add(p)
		paths.push(p)
	}
	for (const project of projects) {
		push(project.rootPath)
		for (const wt of project.worktrees || []) push(wt.path)
	}
	return paths
}

/** What the sidebar needs: rows per folder, plus a way to re-read them. */
export interface ProjectThreadsResult {
	/** Sessions keyed by folder path (project root or worktree path). */
	threadsByPath: Record<string, ThreadInfo[]>
	/**
	 * Re-read the snapshots. Sessions of a closed project can be renamed or
	 * deleted from the sidebar, and those writes bypass the (not running)
	 * harness, so nothing else would tell this hook that a row changed.
	 */
	refresh: () => void
	/**
	 * True once the first snapshot round trip has answered (successfully or
	 * not). The boot splash waits for it: before that the groups are on screen
	 * but still empty, which reads as "this project has no sessions".
	 */
	loaded: boolean
}

/**
 * Sessions per folder, so that every expanded group shows its own list instead
 * of only the open project's.
 *
 * Two sources feed it:
 *  - `getSession`/`listThreads` only ever describe the *open* project, and that
 *    live list also knows about a session created a moment ago that the table
 *    snapshot may not have yet. It is therefore cached **under the folder it was
 *    listed for** (`activeThreadsPath`), never under "whatever is active now":
 *    during a switch the new project becomes active before its list arrives, and
 *    merging the old project's list into it painted rows under the wrong
 *    project — they then vanished again when the real list landed.
 *  - every folder, open or not, has a snapshot read straight from the threads
 *    table (see `project-threads.ts`).
 *
 * Rows are the union of both, so a folder never loses rows that are still on
 * disk, and a session created seconds ago never blinks out.
 */
export function useProjectThreads(
	projects: EnrichedProject[],
	activeProjectPath: string | null,
	activeThreads: ThreadInfo[],
	/** Folder the live list was listed for (`null` when nothing is known yet). */
	activeThreadsPath: string | null = null,
): ProjectThreadsResult {
	const paths = useMemo(() => collectProjectPaths(projects), [projects])
	// Effect keys are strings: the arrays are rebuilt on every render.
	const pathsKey = paths.join("\n")

	// Titles and counts of the open project move while you work (a title gets
	// generated, a thread is deleted), and those rows also live in the other
	// projects' fetch — so refetch whenever this signature changes. `updatedAt`
	// is deliberately left out: it bumps on every save, and the other groups'
	// rows don't change when the open one talks.
	const activeKey = useMemo(
		() => activeThreads.map((t) => `${t.id}\u0000${t.title ?? ""}`).join("\n"),
		[activeThreads],
	)

	const [sources, setSources] = useState<ThreadSources<ThreadInfo>>({
		snapshots: {},
		live: {},
	})

	// Remember the live list of the folder it belongs to. Keeping it around is
	// what makes a folder keep its rows after it stops being the open one: the
	// persisted snapshot only catches up on the next read.
	useEffect(() => {
		if (!activeThreadsPath) return
		setSources((current) =>
			rememberLiveList(current, activeThreadsPath, activeThreads),
		)
	}, [activeThreadsPath, activeThreads])

	// Bumped by `refresh` so the fetch below runs again after a write made
	// outside the harness (renaming or deleting a sibling project's session).
	const [revision, setRevision] = useState(0)
	// Sticky: one answered request is enough to know what the groups contain.
	const [loaded, setLoaded] = useState(false)

	useEffect(() => {
		const list = pathsKey ? pathsKey.split("\n") : []
		if (list.length === 0) {
			setSources((current) =>
				Object.keys(current.snapshots).length === 0 &&
				Object.keys(current.live).length === 0
					? current
					: { snapshots: {}, live: {} },
			)
			return
		}
		let cancelled = false
		window.api
			.invoke({ type: "listProjectThreads", paths: list })
			.then((res) => {
				if (cancelled) return
				setSources((current) =>
					applySnapshotRead(
						current,
						list,
						res as Record<string, ThreadInfo[]> | null,
					),
				)
				setLoaded(true)
			})
			.catch(() => {
				// A dead request must not hold the boot splash hostage.
				if (!cancelled) setLoaded(true)
			})
		return () => {
			cancelled = true
		}
	}, [pathsKey, activeKey, activeProjectPath, revision])

	const threadsByPath = useMemo(
		() => sessionRowsByPath(sources, activeThreadsPath, activeThreads),
		[sources, activeThreads, activeThreadsPath],
	)

	const refresh = useCallback(() => setRevision((n) => n + 1), [])

	return { threadsByPath, refresh, loaded }
}
