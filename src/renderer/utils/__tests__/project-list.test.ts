import { describe, expect, it } from "vitest"
import {
	collapseTargets,
	createdTime,
	hasGitRepo,
	mergeLiveThreads,
	sortByCreatedAt,
	supportsWorktrees,
} from "../project-list"

describe("supportsWorktrees", () => {
	it("allows worktrees for a git repo", () => {
		expect(supportsWorktrees({ gitBranch: "main" })).toBe(true)
		expect(supportsWorktrees({ gitBranch: "feat/sidebar" })).toBe(true)
	})

	it("rejects a plain folder (no branch detected)", () => {
		expect(supportsWorktrees({})).toBe(false)
		expect(supportsWorktrees({ gitBranch: undefined })).toBe(false)
		expect(supportsWorktrees({ gitBranch: "" })).toBe(false)
	})

	it("rejects a worktree itself", () => {
		expect(supportsWorktrees({ gitBranch: "feat/x", isWorktree: true })).toBe(
			false,
		)
	})
})

describe("hasGitRepo", () => {
	it("trusts the explicit flag from detectProject", () => {
		expect(hasGitRepo({ isGitRepo: true })).toBe(true)
		// A repo without commits has a flag but no branch.
		expect(hasGitRepo({ isGitRepo: true, gitBranch: undefined })).toBe(true)
		expect(hasGitRepo({ isGitRepo: false, gitBranch: "main" })).toBe(false)
	})

	it("falls back to the branch for older payloads", () => {
		expect(hasGitRepo({ gitBranch: "feat/sidebar" })).toBe(true)
		expect(hasGitRepo({ gitBranch: "" })).toBe(false)
	})

	it("treats a missing project as a plain folder", () => {
		expect(hasGitRepo(null)).toBe(false)
		expect(hasGitRepo(undefined)).toBe(false)
		expect(hasGitRepo({})).toBe(false)
	})
})

describe("createdTime", () => {
	it("parses an ISO timestamp", () => {
		expect(createdTime("2026-05-01T12:00:00.000Z")).toBe(
			Date.parse("2026-05-01T12:00:00.000Z"),
		)
	})

	it("treats missing and unparseable values as the epoch", () => {
		expect(createdTime(undefined)).toBe(0)
		expect(createdTime(null)).toBe(0)
		expect(createdTime("")).toBe(0)
		expect(createdTime("not-a-date")).toBe(0)
	})
})

describe("sortByCreatedAt", () => {
	it("puts the newest entry first and leaves the input untouched", () => {
		const items = [
			{ id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
			{ id: "b", createdAt: "2026-06-01T00:00:00.000Z" },
			{ id: "c", createdAt: "2025-01-01T00:00:00.000Z" },
		]
		const snapshot = [...items]
		expect(sortByCreatedAt(items, (i) => i.createdAt).map((i) => i.id)).toEqual(
			["b", "a", "c"],
		)
		expect(items).toEqual(snapshot)
	})

	it("pushes entries without a timestamp to the bottom", () => {
		const items = [
			{ id: "legacy" },
			{ id: "dated", createdAt: "2024-01-01T00:00:00.000Z" },
		]
		expect(sortByCreatedAt(items, (i) => i.createdAt).map((i) => i.id)).toEqual(
			["dated", "legacy"],
		)
	})

	it("keeps the original order for equal timestamps", () => {
		const same = "2026-01-01T00:00:00.000Z"
		const items = [
			{ id: "first", createdAt: same },
			{ id: "second", createdAt: same },
			{ id: "third", createdAt: same },
		]
		expect(sortByCreatedAt(items, (i) => i.createdAt).map((i) => i.id)).toEqual(
			["first", "second", "third"],
		)
	})
})

describe("collapseTargets", () => {
	it("collects project roots and, one level down, their worktrees", () => {
		const targets = collapseTargets([
			{
				root: { rootPath: "/repo/alpha" },
				worktrees: [{ rootPath: "/repo/alpha-wt" }],
			},
			{ root: { rootPath: "/repo/beta" }, worktrees: [] },
		])
		expect(targets.projects).toEqual(["/repo/alpha", "/repo/beta"])
		expect(targets.worktrees).toEqual(["/repo/alpha-wt"])
	})

	it("covers every worktree, so collapsing all hides every session", () => {
		const targets = collapseTargets([
			{
				root: { rootPath: "/repo/alpha" },
				worktrees: [{ rootPath: "/a1" }, { rootPath: "/a2" }],
			},
			{
				root: { rootPath: "/repo/beta" },
				worktrees: [{ rootPath: "/b1" }],
			},
		])
		expect(targets.worktrees).toEqual(["/a1", "/a2", "/b1"])
	})

	it("returns empty lists for a sidebar with no projects", () => {
		expect(collapseTargets([])).toEqual({ projects: [], worktrees: [] })
	})
})

describe("mergeLiveThreads", () => {
	const t = (id: string, title = id) => ({ id, title })

	it("falls back to the snapshot while the live list is empty", () => {
		// The moment a project or worktree is opened, its live list is still
		// empty; showing nothing made the folder look collapsed.
		expect(mergeLiveThreads([], [t("a"), t("b")])).toEqual([t("a"), t("b")])
	})

	it("keeps a session that only the live list knows yet", () => {
		expect(mergeLiveThreads([t("new")], [t("old")])).toEqual([
			t("new"),
			t("old"),
		])
	})

	it("de-dupes by id, preferring the live copy", () => {
		const merged = mergeLiveThreads(
			[t("a", "renamed")],
			[t("a", "old title"), t("b")],
		)
		expect(merged).toEqual([t("a", "renamed"), t("b")])
	})

	it("returns the live list untouched when the snapshot adds nothing", () => {
		const live = [t("a"), t("b")]
		expect(mergeLiveThreads(live, [t("a")])).toBe(live)
	})
})
