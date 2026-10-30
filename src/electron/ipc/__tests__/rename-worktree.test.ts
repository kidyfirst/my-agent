import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getProjectHandlers } from "../project-handlers.js"

/**
 * The sidebar labels a worktree by its branch, so its inline rename has to move
 * the branch itself. These tests run against a throwaway repository to check
 * that the branch really changes, that the worktree directory stays put, and
 * that git's own refusals (bad ref name, branch already taken) come back as
 * readable errors instead of being swallowed.
 */
const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, encoding: "utf-8" }).trim()

let repo: string
let worktree: string

beforeAll(() => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-wt-rename-"))
	repo = path.join(root, "repo")
	worktree = path.join(root, "worktrees", "feature-one")

	fs.mkdirSync(repo, { recursive: true })
	git(repo, "init", "-b", "main")
	git(repo, "config", "user.email", "test@example.com")
	git(repo, "config", "user.name", "test")
	fs.writeFileSync(path.join(repo, "README.md"), "hello\n")
	git(repo, "add", "README.md")
	git(repo, "commit", "-m", "init")
	fs.mkdirSync(path.dirname(worktree), { recursive: true })
	git(repo, "worktree", "add", worktree, "-b", "feature-one")
})

afterAll(() => {
	try {
		fs.rmSync(path.dirname(path.dirname(worktree)), {
			recursive: true,
			force: true,
		})
	} catch {
		// best effort — a leftover temp dir must not fail the suite
	}
})

const rename = async (newName: string) =>
	(await getProjectHandlers().renameWorktree(
		{ worktreePath: worktree, newName },
		{} as any,
	)) as { success: boolean; error?: string }

describe("renameWorktree", () => {
	it("renames the branch the worktree has checked out", async () => {
		const res = await rename("feature-two")

		expect(res).toEqual({ success: true, branch: "feature-two" })
		expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
			"feature-two",
		)
		// The directory keeps its name: session rows, task changes and issue
		// links are all keyed by path.
		expect(fs.existsSync(worktree)).toBe(true)
		expect(path.basename(worktree)).toBe("feature-one")
	})

	it("rejects a name git would not accept, leaving the branch alone", async () => {
		const res = await rename("not a branch")

		expect(res.success).toBe(false)
		expect(res.error).toBeTruthy()
		expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
			"feature-two",
		)
	})

	it("reports a name that is already taken", async () => {
		git(repo, "branch", "feature-three")

		const res = await rename("feature-three")

		expect(res.success).toBe(false)
		expect(res.error).toBeTruthy()
		expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
			"feature-two",
		)
	})
})
