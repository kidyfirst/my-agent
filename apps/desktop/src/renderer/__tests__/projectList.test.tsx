import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { ProjectList } from "../components/ProjectList"
import type { EnrichedProject } from "../types/project-list"

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

const threads = [
	{
		id: "t1",
		resourceId: "t1",
		title: "Fix login flow",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: "t2",
		resourceId: "t2",
		title: "Write docs",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
]

function render(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	return renderToStaticMarkup(
		<ProjectList
			projects={[
				project("alpha", "/repo/alpha", [
					{ path: "/repo/alpha-wt", branch: "feat/x" },
				]),
				project("beta", "/repo/beta"),
			]}
			activeProjectPath="/repo/alpha"
			isAgentActive={false}
			activeWorktrees={new Set<string>()}
			unreadWorktrees={new Set<string>()}
			worktreeStatuses={new Map()}
			threads={threads}
			currentThreadId="t1"
			onSwitchProject={noop}
			onOpenFolder={noop}
			onCloneRepo={noop}
			onRemoveProject={noop}
			onCreateWorktree={noop}
			onDeleteWorktree={noop}
			onRenameProject={noop}
			onSwitchThread={noop}
			onNewThread={noop}
			onDeleteThread={noop}
			onRenameThread={noop}
			{...overrides}
		/>,
	)
}

describe("ProjectList", () => {
	it("titles the section 'Project' and no longer offers Repo/Status grouping", () => {
		const html = render()
		expect(html).toContain("Project")
		expect(html).not.toContain("Workspaces")
		expect(html).not.toContain(">Repo<")
		expect(html).not.toContain(">Status<")
		expect(html).not.toContain("Filter...")
	})

	it("lists every project with its worktrees", () => {
		const html = render()
		expect(html).toContain("alpha")
		expect(html).toContain("beta")
		expect(html).toContain("feat/x")
	})

	it("uses the folder glyph — not a chevron — as the expand/collapse affordance", () => {
		const html = render()
		// The old chevron glyph is gone entirely.
		expect(html).not.toContain("9 18 15 12 9 6")
		// Expanded groups show the open folder.
		expect(html).toContain("M2 17.5V6a2 2 0 0 1 2-2h3.9")
	})

	it("nests the active project's sessions under its group", () => {
		const html = render()
		expect(html).toContain("Fix login flow")
		expect(html).toContain("Write docs")
		expect(html.indexOf("Fix login flow")).toBeGreaterThan(
			html.indexOf(">alpha</span>"),
		)
		expect(html.indexOf("Fix login flow")).toBeLessThan(
			html.indexOf(">beta</span>"),
		)
	})

	it("follows the active project when it changes", () => {
		const html = render({ activeProjectPath: "/repo/beta" })
		expect(html.indexOf("Fix login flow")).toBeGreaterThan(
			html.indexOf(">beta</span>"),
		)
	})

	it("lists the project's own sessions above its worktrees, one level deep", () => {
		const html = render()
		// The open project owns these sessions, so they belong directly under
		// its row — not below the worktree list, where they would read as
		// children of "feat/x".
		expect(html.indexOf("Fix login flow")).toBeGreaterThan(
			html.indexOf(">alpha</span>"),
		)
		expect(html.indexOf("Fix login flow")).toBeLessThan(html.indexOf("feat/x"))
	})

	it("nests a worktree's sessions under that worktree", () => {
		const html = render({ activeProjectPath: "/repo/alpha-wt" })
		expect(html.indexOf("Fix login flow")).toBeGreaterThan(
			html.indexOf("feat/x"),
		)
		expect(html.indexOf("Fix login flow")).toBeLessThan(
			html.indexOf(">beta</span>"),
		)
	})

	it("keeps the open folder's rows while its live list is still empty", () => {
		// Switching to a project or worktree re-lists nothing until the harness
		// answers; the snapshot already has the rows, so the folder must not
		// look collapsed in the meantime.
		const html = render({
			activeProjectPath: "/repo/alpha",
			threads: [],
			threadsByPath: { "/repo/alpha": threads },
		})
		expect(html).toContain("Fix login flow")
		expect(html).toContain("Write docs")
	})

	it("keeps the open worktree's rows while its live list is still empty", () => {
		const html = render({
			activeProjectPath: "/repo/alpha-wt",
			threads: [],
			threadsByPath: {
				"/repo/alpha-wt": [
					{
						id: "t7",
						resourceId: "t7",
						title: "Worktree session",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				],
			},
		})
		expect(html).toContain("Worktree session")
	})

	it("keeps every expanded project's sessions on screen at once", () => {
		// Only the open project has a live session; the rest come from the
		// per-folder snapshot, so opening "beta" no longer empties "alpha".
		const html = render({
			activeProjectPath: "/repo/alpha",
			threadsByPath: {
				"/repo/alpha": threads,
				"/repo/beta": [
					{
						id: "t9",
						resourceId: "t9",
						title: "Beta session",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				],
				"/repo/alpha-wt": [
					{
						id: "t8",
						resourceId: "t8",
						title: "Worktree session",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				],
			},
		})
		expect(html).toContain("Fix login flow")
		expect(html).toContain("Beta session")
		expect(html).toContain("Worktree session")
	})

	it("lets a non-active project with sessions be expanded too", () => {
		const html = render({
			threadsByPath: {
				"/repo/beta": [
					{
						id: "t9",
						resourceId: "t9",
						title: "Beta session",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				],
			},
		})
		// Two open folder glyphs: alpha (worktrees) and beta (its sessions).
		expect(html.split("M2 17.5V6a2 2 0 0 1 2-2h3.9").length - 1).toBe(2)
		expect(html).toContain("Beta session")
	})

	it("gives a sibling project's sessions their hover actions too", () => {
		// The ⋯ slot is the only holder of the recording/replay status icons, so
		// a recording session of another project proves the actions are rendered
		// there as well (the slot itself only appears on hover).
		const foreign = {
			id: "t9",
			resourceId: "t9",
			title: "Beta session",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}
		const withActions = render({
			threadsByPath: { "/repo/beta": [foreign] },
			recordingThreads: new Set(["t9"]),
			onMutateForeignThread: vi.fn(),
		})
		expect(withActions).toContain("Stop recording and export")

		const readOnly = render({
			threadsByPath: { "/repo/beta": [foreign] },
			recordingThreads: new Set(["t9"]),
		})
		expect(readOnly).not.toContain("Stop recording and export")
	})

	it("filters projects by name", () => {
		const html = render({ filterText: "beta" })
		expect(html).toContain("beta")
		expect(html).not.toContain("alpha")
	})

	it("leaves the project row unhighlighted while one of its sessions is open", () => {
		const html = render()
		// Only the open session row draws the selection; the project row above
		// it stays neutral so two accent bars don't stack.
		expect(html.match(/var\(--selected-bg\)/g)).toHaveLength(1)
		const sessionIndex = html.indexOf("Fix login flow")
		expect(html.indexOf("var(--selected-bg)")).toBeLessThan(sessionIndex)
		expect(html.indexOf(">alpha</span>")).toBeLessThan(
			html.indexOf("var(--selected-bg)"),
		)
	})

	it("highlights the active project row while no session is open in it", () => {
		const html = render({ currentThreadId: null })
		expect(html.match(/var\(--selected-bg\)/g)).toHaveLength(1)
		expect(html).toContain("3px solid var(--accent)")
		// The tint sits on the project row itself: before its name and its
		// (unopened) session rows.
		expect(html.indexOf("var(--selected-bg)")).toBeLessThan(
			html.indexOf(">alpha</span>"),
		)
	})

	it("keeps a project whose session matches the filter", () => {
		const html = render({ filterText: "login" })
		expect(html).toContain("alpha")
		expect(html).toContain("Fix login flow")
		expect(html).not.toContain("Write docs")
		expect(html).not.toContain("beta")
	})

	it("shows a 'no matches' state instead of an empty list", () => {
		const html = render({ filterText: "zzz-nothing" })
		expect(html).toContain("No matches")
	})

	it("no longer renders a row-level 'New worktree' button", () => {
		const html = render()
		expect(html).not.toContain(">New worktree<")
	})
})

describe("ProjectList ordering", () => {
	const withCreatedAt = (
		name: string,
		rootPath: string,
		createdAt: string,
		extra: Record<string, unknown> = {},
	) => ({
		name,
		rootPath,
		lastOpened: createdAt,
		createdAt,
		gitBranch: "main",
		worktrees: [],
		...extra,
	})

	it("orders projects by creation time, newest first", () => {
		const html = render({
			projects: [
				withCreatedAt("older", "/repo/older", "2026-01-01T00:00:00.000Z"),
				withCreatedAt("newer", "/repo/newer", "2026-06-01T00:00:00.000Z"),
				withCreatedAt("oldest", "/repo/oldest", "2025-01-01T00:00:00.000Z"),
			],
			activeProjectPath: "/repo/older",
		})
		expect(html.indexOf(">newer</span>")).toBeLessThan(
			html.indexOf(">older</span>"),
		)
		expect(html.indexOf(">older</span>")).toBeLessThan(
			html.indexOf(">oldest</span>"),
		)
	})

	it("ignores lastOpened, so opening a project never moves it to the top", () => {
		const html = render({
			projects: [
				withCreatedAt("first", "/repo/first", "2025-01-01T00:00:00.000Z"),
				// Most recently opened, but created later — must stay below "second".
				withCreatedAt("second", "/repo/second", "2025-02-01T00:00:00.000Z"),
			],
			activeProjectPath: "/repo/first",
		})
		expect(html.indexOf(">second</span>")).toBeLessThan(
			html.indexOf(">first</span>"),
		)
	})

	it("orders a repo's worktrees by creation time", () => {
		const html = render({
			projects: [
				withCreatedAt("repo", "/repo/r", "2025-01-01T00:00:00.000Z", {
					worktrees: [
						{
							path: "/repo/r-wt-b",
							branch: "feat/older",
							createdAt: "2025-03-01T00:00:00.000Z",
						},
						{
							path: "/repo/r-wt-a",
							branch: "feat/newer",
							createdAt: "2025-05-01T00:00:00.000Z",
						},
					],
				}),
			],
			activeProjectPath: "/repo/r",
		})
		expect(html.indexOf("feat/newer")).toBeLessThan(html.indexOf("feat/older"))
	})

	it("orders sessions by creation time, not by last activity", () => {
		const html = render({
			threads: [
				{
					id: "t-old",
					resourceId: "t-old",
					title: "Old session",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-09-01T00:00:00.000Z",
				},
				{
					id: "t-new",
					resourceId: "t-new",
					title: "New session",
					createdAt: "2026-06-01T00:00:00.000Z",
					updatedAt: "2026-06-02T00:00:00.000Z",
				},
			],
		})
		expect(html.indexOf("New session")).toBeLessThan(
			html.indexOf("Old session"),
		)
	})

	it("keeps entries without a timestamp at the bottom", () => {
		const html = render({
			projects: [
				{
					name: "legacy",
					rootPath: "/repo/legacy",
					lastOpened: "",
					worktrees: [],
				},
				withCreatedAt("dated", "/repo/dated", "2024-01-01T00:00:00.000Z"),
			],
			activeProjectPath: "/repo/legacy",
		})
		expect(html.indexOf(">dated</span>")).toBeLessThan(
			html.indexOf(">legacy</span>"),
		)
	})
})

describe("Project and session row menus", () => {
	// Rows expose their actions behind the hover ⋯ button only; right-click
	// menus were removed, so nothing may wire `onContextMenu` any more.
	it("no longer wires right-click menus on project, worktree or session rows", () => {
		for (const file of [
			"ProjectList.tsx",
			"project-list/ProjectSessionRow.tsx",
		]) {
			const src = readFileSync(
				new URL(`../components/${file}`, import.meta.url),
				"utf8",
			)
			expect(src).not.toContain("onContextMenu")
		}
	})

	it("drops the redundant 'Switch to this directory' entry", () => {
		const src = readFileSync(
			new URL("../components/ProjectList.tsx", import.meta.url),
			"utf8",
		)
		expect(src).not.toContain("Switch to this directory")
	})
})

describe("Sidebar wiring", () => {
	// The sidebar owns the per-folder session snapshots, so it has to hand them
	// to the list. Without them every non-active project reads as session-less
	// and only the open project can be expanded (see sidebarProjectList.test).
	const sidebarProjectList = () => {
		const src = readFileSync(
			new URL("../components/Sidebar.tsx", import.meta.url),
			"utf8",
		)
		const start = src.indexOf("<ProjectList")
		return src.slice(start, src.indexOf("/>", start))
	}

	it("forwards the cross-project session opener", () => {
		// A session row of a non-active project must switch project first.
		expect(sidebarProjectList()).toContain("onOpenSession={onOpenSession}")
	})

	it("forwards the per-folder session snapshots", () => {
		expect(sidebarProjectList()).toContain("threadsByPath={threadsByPath}")
	})
})

describe("ProjectList branch chip", () => {
	const chipCount = (html: string) => html.split("Current branch: ").length - 1

	it("shows the current branch for every repo project", () => {
		const html = render()
		expect(html).toContain("Current branch: main")
		expect(chipCount(html)).toBe(2) // alpha + beta
	})

	it("does not add a chip to worktree rows (their branch is the label)", () => {
		const html = render()
		expect(html).toContain("feat/x")
		expect(chipCount(html)).toBe(2)
	})

	it("hides the chip for a plain folder", () => {
		const html = render({
			projects: [
				{
					name: "notes",
					rootPath: "/docs/notes",
					lastOpened: "",
					worktrees: [],
				},
			],
		})
		expect(html).toContain("notes")
		expect(chipCount(html)).toBe(0)
	})

	it("hides the chip when the project itself is a worktree", () => {
		const html = render({
			projects: [
				{
					name: "alpha-wt",
					rootPath: "/repo/alpha-wt",
					lastOpened: "",
					gitBranch: "feat/x",
					isWorktree: true,
					worktrees: [],
				},
			],
		})
		expect(html).toContain("alpha-wt")
		expect(chipCount(html)).toBe(0)
	})
})

describe("live list attribution", () => {
	it("renders the live list under the folder it was listed for, not the open one", () => {
		// Switching to "beta" makes it active before its own session list
		// arrives, so `threads` is still alpha's. Those rows belong to alpha and
		// must stay there — painting them under beta made rows appear and then
		// vanish a moment later, which read as the sidebar jittering.
		const html = render({
			activeProjectPath: "/repo/beta",
			threadsPath: "/repo/alpha",
		})
		expect(html).toContain("Fix login flow")
		expect(html.indexOf("Fix login flow")).toBeLessThan(
			html.indexOf(">beta</span>"),
		)
	})

	it("still follows the open project when no folder tag is known", () => {
		// Older callers (and the SSR tests) pass the live list only; the open
		// project is then the only sensible owner.
		const html = render({ activeProjectPath: "/repo/beta" })
		expect(html.indexOf("Fix login flow")).toBeGreaterThan(
			html.indexOf(">beta</span>"),
		)
	})
})
