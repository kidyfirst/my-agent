import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { ProjectList } from "../components/ProjectList"
import type { EnrichedProject } from "../types/project-list"

/**
 * A worktree row is labelled by the branch it has checked out, so renaming it
 * inline has to reach git. These tests pin the wiring on both ends: the row
 * commits through the worktree path, and that path ends in `git branch -m`.
 */

/** Renderer paths are read from `src/renderer`; the rest from `src`. */
const read = (rel: string) =>
	readFileSync(
		new URL(
			`../${rel.startsWith("src/") ? "../../" : ""}${rel}`,
			import.meta.url,
		),
		"utf-8",
	).replace(/\r\n/g, "\n")

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

function render(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	const projectList = renderToStaticMarkup(
		<ProjectList
			projects={[
				project("my-agent", "/repo/my-agent", [
					{ path: "/repo/wt-hello", branch: "hellobore" },
				]),
			]}
			activeProjectPath="/repo/my-agent"
			isAgentActive={false}
			activeWorktrees={new Set<string>()}
			unreadWorktrees={new Set<string>()}
			worktreeStatuses={new Map()}
			threads={[]}
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
	return { html: projectList, noop }
}

describe("worktree inline rename", () => {
	it("labels the worktree row with its branch", () => {
		const { html } = render()

		// The thing the double-click edits is exactly what the row shows.
		expect(html).toContain("hellobore")
	})

	it("commits the worktree edit as a worktree rename, the project edit as a name", () => {
		const source = read("components/ProjectList.tsx")

		expect(source).toContain("commitRename(wt.rootPath, true)")
		expect(source).toContain("commitRename(root.rootPath)")
		expect(source).not.toContain("commitRename(root.rootPath, true)")
		// The flag picks the callback; a project must never fall into the
		// worktree branch, which would try to rename a branch that isn't there.
		expect(source).toMatch(
			/if \(isWorktree\) onRenameWorktree\?\.\(targetPath, name\)\s*\n\s*else onRenameProject\(targetPath, name\)/,
		)
	})

	it("double-clicks open the same inline editor a project row uses", () => {
		const source = read("components/ProjectList.tsx")
		const worktreeRow = source.slice(source.indexOf("worktrees.map((wt)"))

		expect(worktreeRow).toMatch(
			/onDoubleClick=\{\(e\) => \{[\s\S]{0,200}setEditingProjectPath\(wt\.rootPath\)/,
		)
		expect(worktreeRow).toContain(
			"setEditingProjectName(wt.gitBranch || wt.name)",
		)
	})

	it("threads the handler from the sidebar down to the list", () => {
		expect(read("components/Sidebar.tsx")).toContain(
			"onRenameWorktree={onRenameWorktree}",
		)
		expect(read("App.tsx")).toContain("onRenameWorktree={handleRenameWorktree}")
	})

	it("invokes the main process and keeps the label when it fails", () => {
		const app = read("App.tsx")

		expect(app).toContain('type: "renameWorktree"')
		expect(app).toContain("if (!res?.success) {")
		expect(app).toContain('showToast(res?.error || "Rename failed", "error")')
	})

	it("renames the branch itself, in the worktree", () => {
		const handlers = read("src/electron/ipc/project-handlers.ts")

		expect(handlers).toContain("renameWorktree:")
		// No source branch: git only accepts `-m <new>` for a branch that is
		// checked out, and that is the branch the row is showing.
		expect(handlers).toContain('execFileSync("git", ["branch", "-m", newName]')
		expect(handlers).toContain('"check-ref-format"')
	})
})
