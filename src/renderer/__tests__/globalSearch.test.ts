import { describe, expect, it } from "vitest"
import {
	buildSearchItems,
	filterSearchItems,
} from "../components/GlobalSearchModal"
import type { EnrichedProject } from "../types/project-list"

const now = new Date("2026-10-30T10:00:00Z").getTime()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

const projects: EnrichedProject[] = [
	{
		name: "older-repo",
		rootPath: "/repo/older",
		lastOpened: iso(9 * 86_400_000),
		gitBranch: "main",
		worktrees: [],
	},
	{
		name: "newer-repo",
		rootPath: "/repo/newer",
		lastOpened: iso(3_600_000),
		gitBranch: "feat/search",
		worktrees: [],
	},
	{
		name: "Plain Brain",
		rootPath: "/repo/plain",
		lastOpened: iso(2 * 86_400_000),
		worktrees: [],
	},
]

const threads = [
	{
		id: "t1",
		resourceId: "t1",
		title: "Electron Page Loading Control",
		createdAt: iso(3 * 86_400_000),
		updatedAt: iso(18 * 3_600_000),
	},
	{
		id: "t2",
		resourceId: "t2",
		title: "Expo Go NitroModules Error",
		createdAt: iso(5 * 86_400_000),
		updatedAt: iso(3 * 86_400_000),
	},
]

const items = buildSearchItems({
	projects,
	threads,
	activeProjectName: "newer-repo",
	now,
})

describe("buildSearchItems", () => {
	it("puts sessions before projects", () => {
		expect(items.slice(0, 2).every((i) => i.kind === "thread")).toBe(true)
		expect(items.slice(2).every((i) => i.kind === "project")).toBe(true)
	})

	it("labels a session with its project and relative time", () => {
		const first = items[0]
		expect(first.title).toBe("Electron Page Loading Control")
		expect(first.context).toBe("newer-repo")
		expect(first.meta).toBe("18h")
		expect(first.value).toBe("t1")
	})

	it("orders projects by recency and shows branch or 'Folder'", () => {
		const projectItems = items.filter((i) => i.kind === "project")
		expect(projectItems.map((i) => i.title)).toEqual([
			"newer-repo",
			"Plain Brain",
			"older-repo",
		])
		expect(projectItems[0].context).toBe("feat/search")
		expect(projectItems[1].context).toBe("Folder")
		expect(projectItems[0].value).toBe("/repo/newer")
	})

	it("falls back to a placeholder title for untitled sessions", () => {
		const [only] = buildSearchItems({
			projects: [],
			threads: [
				{
					id: "x",
					resourceId: "x",
					title: "",
					createdAt: iso(0),
					updatedAt: iso(0),
				},
			],
			activeProjectName: "p",
			now,
		})
		expect(only.title).toBe("New session")
	})
})

describe("filterSearchItems", () => {
	it("returns everything for an empty query", () => {
		expect(filterSearchItems(items, "   ")).toHaveLength(items.length)
	})

	it("matches titles case-insensitively", () => {
		const result = filterSearchItems(items, "expo")
		expect(result).toHaveLength(1)
		expect(result[0].title).toBe("Expo Go NitroModules Error")
	})

	it("matches the project label attached to a session", () => {
		const result = filterSearchItems(items, "newer-repo")
		// both sessions are labelled with the active project + the project row itself
		expect(result.map((i) => i.kind)).toEqual(["thread", "thread", "project"])
	})

	it("returns nothing when no row matches", () => {
		expect(filterSearchItems(items, "zzz")).toHaveLength(0)
	})
})
