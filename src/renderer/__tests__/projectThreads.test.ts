import { describe, expect, it } from "vitest"
import { collectProjectPaths } from "../hooks/useProjectThreads"
import {
	applySnapshotRead,
	mergeThreadsByPath,
	rememberLiveList,
	removedThreadIds,
	sessionRowsByPath,
	type ThreadSources,
} from "../utils/project-list"
import type { EnrichedProject } from "../types/project-list"
import type { ThreadInfo } from "../types/ipc"

const thread = (id: string, title: string): ThreadInfo =>
	({
		id,
		resourceId: id,
		title,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
	}) as ThreadInfo

const project = (
	name: string,
	rootPath: string,
	worktrees: Array<{ path: string; branch: string }> = [],
): EnrichedProject => ({
	name,
	rootPath,
	lastOpened: "",
	gitBranch: "main",
	worktrees,
})

describe("collectProjectPaths", () => {
	it("lists each project root and each of its worktrees", () => {
		expect(
			collectProjectPaths([
				project("alpha", "/repo/alpha", [
					{ path: "/repo/alpha-wt", branch: "feat/x" },
					{ path: "/repo/alpha-wt2", branch: "feat/y" },
				]),
				project("beta", "/repo/beta"),
			]),
		).toEqual([
			"/repo/alpha",
			"/repo/alpha-wt",
			"/repo/alpha-wt2",
			"/repo/beta",
		])
	})

	it("skips duplicates and empty paths", () => {
		expect(
			collectProjectPaths([
				project("alpha", "/repo/alpha", [
					{ path: "/repo/alpha", branch: "main" },
					{ path: "", branch: "ghost" },
				]),
				project("alpha again", "/repo/alpha"),
			]),
		).toEqual(["/repo/alpha"])
	})

	it("returns nothing for an empty list", () => {
		expect(collectProjectPaths([])).toEqual([])
	})
})

describe("mergeThreadsByPath", () => {
	it("overwrites the folders the response carries", () => {
		const merged = mergeThreadsByPath(
			{ "/repo/alpha": [thread("a1", "old")] },
			["/repo/alpha"],
			{ "/repo/alpha": [thread("a1", "new")] },
		)
		expect(merged["/repo/alpha"]).toHaveLength(1)
		expect(merged["/repo/alpha"][0].title).toBe("new")
	})

	it("keeps an already loaded folder when the response omits it", () => {
		// A failed/partial read must not blank out rows that are on screen —
		// that is what made a project look collapsed after switching away.
		const merged = mergeThreadsByPath(
			{ "/repo/alpha": [thread("a1", "alpha session")] },
			["/repo/alpha", "/repo/beta"],
			{ "/repo/beta": [] },
		)
		expect(merged["/repo/alpha"].map((t) => t.id)).toEqual(["a1"])
		expect(merged["/repo/beta"]).toEqual([])
	})

	it("clears a folder the response reports as empty", () => {
		const merged = mergeThreadsByPath(
			{ "/repo/alpha": [thread("a1", "deleted")] },
			["/repo/alpha"],
			{ "/repo/alpha": [] },
		)
		expect(merged["/repo/alpha"]).toEqual([])
	})

	it("leaves the cache untouched when the call returned nothing", () => {
		const previous = { "/repo/alpha": [thread("a1", "alpha session")] }
		expect(mergeThreadsByPath(previous, ["/repo/alpha"], null)).toEqual(
			previous,
		)
		expect(mergeThreadsByPath(previous, ["/repo/alpha"], {})).toEqual(previous)
	})
})

describe("removedThreadIds", () => {
	it("reports the ids a shrinking snapshot no longer has", () => {
		expect(
			removedThreadIds(
				[thread("a1", "one"), thread("a2", "two")],
				[thread("a1", "one")],
			),
		).toEqual(["a2"])
	})

	it("treats a same-size or growing snapshot as no deletion", () => {
		expect(
			removedThreadIds([thread("a1", "one")], [thread("a1", "one (renamed)")]),
		).toEqual([])
		expect(removedThreadIds(undefined, [thread("a1", "one")])).toEqual([])
	})

	it("reads an empty-but-answered snapshot as everything deleted", () => {
		// A folder that came back empty was read successfully and really holds no
		// sessions (an unreadable folder is left out of the response instead, see
		// `readProjectThreadsByPath`).
		expect(removedThreadIds([thread("a1", "one")], [])).toEqual(["a1"])
	})
})

describe("rememberLiveList", () => {
	it("caches the list under the folder it was listed for", () => {
		const next = rememberLiveList<ThreadInfo>(
			{ snapshots: {}, live: {} },
			"/repo/a",
			[thread("a1", "one")],
		)
		expect(next.live["/repo/a"]?.map((t) => t.id)).toEqual(["a1"])
		expect(next.live["/repo/b"]).toBeUndefined()
	})

	it("ignores a list with no known folder", () => {
		const sources: ThreadSources<ThreadInfo> = { snapshots: {}, live: {} }
		expect(rememberLiveList(sources, null, [thread("a1", "one")])).toBe(sources)
		expect(rememberLiveList(sources, "", [thread("a1", "one")])).toBe(sources)
	})

	it("keeps the same state object when nothing changed", () => {
		const sources = rememberLiveList<ThreadInfo>(
			{ snapshots: {}, live: {} },
			"/repo/a",
			[thread("a1", "one")],
		)
		// A rebuilt-but-identical list (every harness event produces one) must not
		// re-render the sidebar.
		expect(rememberLiveList(sources, "/repo/a", [thread("a1", "one")])).toBe(
			sources,
		)
	})
})

describe("applySnapshotRead", () => {
	it("drops deleted ids from the live cache", () => {
		const live = rememberLiveList<ThreadInfo>(
			{
				snapshots: { "/repo/a": [thread("a1", "one"), thread("a2", "two")] },
				live: {},
			},
			"/repo/a",
			[thread("a1", "one"), thread("a2", "two")],
		)
		const next = applySnapshotRead(live, ["/repo/a"], {
			"/repo/a": [thread("a1", "one")],
		})
		expect(next.snapshots["/repo/a"].map((t) => t.id)).toEqual(["a1"])
		expect(next.live["/repo/a"].map((t) => t.id)).toEqual(["a1"])
	})

	it("keeps a session that only the live list knows about", () => {
		// Created a second ago: the row is not in the snapshot read yet.
		const live = rememberLiveList<ThreadInfo>(
			{ snapshots: {}, live: {} },
			"/repo/a",
			[thread("new", "New Session"), thread("a1", "one")],
		)
		const next = applySnapshotRead(live, ["/repo/a"], {
			"/repo/a": [thread("a1", "one")],
		})
		expect(next.live["/repo/a"].map((t) => t.id)).toEqual(["new", "a1"])
		// ... and the union the sidebar renders keeps it too.
		const rows = sessionRowsByPath(next, "/repo/a", [
			thread("new", "New Session"),
			thread("a1", "one"),
		])
		expect(Object.keys(rows)).toEqual(["/repo/a"])
		expect(rows["/repo/a"].map((t) => t.id)).toEqual(["new", "a1"])
	})

	it("leaves other folders alone", () => {
		const sources: ThreadSources<ThreadInfo> = {
			snapshots: { "/repo/b": [thread("b1", "beta")] },
			live: { "/repo/b": [thread("b1", "beta")] },
		}
		const next = applySnapshotRead(sources, ["/repo/a"], { "/repo/a": [] })
		expect(next.live["/repo/b"].map((t) => t.id)).toEqual(["b1"])
		expect(next.snapshots["/repo/b"].map((t) => t.id)).toEqual(["b1"])
	})
})

describe("sessionRowsByPath", () => {
	it("never renders one folder's live list under another folder", () => {
		// The switch case: /repo/alpha was open, so its list is the live one;
		// /repo/beta has just become active but its own list has not arrived.
		const sources: ThreadSources<ThreadInfo> = {
			snapshots: {
				"/repo/alpha": [thread("a1", "Fix login flow")],
				"/repo/beta": [thread("b1", "Beta session")],
			},
			live: { "/repo/alpha": [thread("a1", "Fix login flow")] },
		}
		const rows = sessionRowsByPath(sources, "/repo/alpha", [
			thread("a1", "Fix login flow"),
		])
		expect(rows["/repo/beta"].map((t) => t.id)).toEqual(["b1"])
		expect(rows["/repo/alpha"].map((t) => t.id)).toEqual(["a1"])
	})

	it("never renders the same session under two projects", () => {
		// The reported bug: switching sessions made the newly activated row show
		// up under both the project that owns it and the one that just became
		// active — and because selection is by thread id, both rows looked
		// selected. The live list of the new project is stale here: it still
		// carries the other project's thread.
		const sources: ThreadSources<ThreadInfo> = {
			snapshots: {
				"/repo/brain": [thread("b1", "Project layout")],
				"/repo/deepseek": [thread("d1", "Why this design")],
			},
			live: {
				"/repo/deepseek": [
					thread("b1", "Project layout"),
					thread("d1", "Why this design"),
				],
			},
		}
		const rows = sessionRowsByPath(sources, "/repo/deepseek", [
			thread("b1", "Project layout"),
			thread("d1", "Why this design"),
		])
		expect(rows["/repo/brain"].map((t) => t.id)).toEqual(["b1"])
		expect(rows["/repo/deepseek"].map((t) => t.id)).toEqual(["d1"])
	})

	it("keeps a brand-new session with the project it was created in", () => {
		// Nothing is persisted yet, so the table cannot arbitrate: the open
		// folder's live list decides, and no other group may pick it up.
		const sources: ThreadSources<ThreadInfo> = {
			snapshots: { "/repo/alpha": [thread("a1", "Old")] },
			live: { "/repo/beta": [thread("b2", "Just created")] },
		}
		const rows = sessionRowsByPath(sources, "/repo/beta", [
			thread("b2", "Just created"),
		])
		expect(rows["/repo/beta"].map((t) => t.id)).toEqual(["b2"])
		expect(rows["/repo/alpha"].map((t) => t.id)).toEqual(["a1"])
	})

	it("keeps a folder's rows after it stops being the open one", () => {
		// The rows exist only in the live list (nothing persisted yet); leaving
		// the folder must not blank its group.
		const live = rememberLiveList<ThreadInfo>(
			{ snapshots: {}, live: {} },
			"/repo/alpha",
			[thread("a1", "Fix login flow")],
		)
		const rows = sessionRowsByPath(live, "/repo/beta", [thread("b1", "Beta")])
		expect(rows["/repo/alpha"].map((t) => t.id)).toEqual(["a1"])
		expect(rows["/repo/beta"].map((t) => t.id)).toEqual(["b1"])
	})

	it("answers for the open folder even before its snapshot lands", () => {
		const rows = sessionRowsByPath<ThreadInfo>(
			{ snapshots: {}, live: {} },
			"/repo/alpha",
			[thread("a1", "Fix login flow")],
		)
		expect(rows["/repo/alpha"].map((t) => t.id)).toEqual(["a1"])
	})
})
