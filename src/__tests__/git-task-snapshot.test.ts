import { execFileSync } from "child_process"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	captureGitSnapshot,
	diffBetweenSnapshots,
	diffFileBetweenSnapshots,
} from "../electron/git-task-snapshot.js"

let repo: string

function git(args: string[]) {
	return execFileSync("git", args, { cwd: repo, encoding: "utf-8" })
}

beforeEach(() => {
	repo = mkdtempSync(join(tmpdir(), "myagent-snapshot-test-"))
	git(["init", "-q"])
	git(["config", "user.email", "test@example.com"])
	git(["config", "user.name", "test"])
	git(["config", "commit.gpgsign", "false"])
	writeFileSync(join(repo, "a.ts"), "one\ntwo\n")
	writeFileSync(join(repo, "keep.ts"), "untouched\n")
	git(["add", "a.ts"])
	git(["commit", "-q", "-m", "initial"])
})

afterEach(() => {
	rmSync(repo, { recursive: true, force: true })
})

describe("git task snapshot", () => {
	it("reports changes even when the task commits them", () => {
		const before = captureGitSnapshot(repo)
		writeFileSync(join(repo, "a.ts"), "one\nthree\nfour\n")
		writeFileSync(join(repo, "new.ts"), "brand new\n")
		git(["add", "-A"])
		git(["commit", "-q", "-m", "task work"])

		const after = captureGitSnapshot(repo)
		expect(diffBetweenSnapshots(repo, before, after)).toEqual([
			{ path: "a.ts", added: 2, deleted: 1, status: "modified" },
			{ path: "new.ts", added: 1, deleted: 0, status: "added" },
		])
	})

	it("does not report files the task never touched", () => {
		// keep.ts is untracked when the task starts and stays untouched.
		const before = captureGitSnapshot(repo)
		const after = captureGitSnapshot(repo)
		expect(diffBetweenSnapshots(repo, before, after)).toEqual([])
	})

	it("ignores mode-only changes", () => {
		const before = captureGitSnapshot(repo)
		execFileSync("chmod", ["+x", join(repo, "a.ts")])
		const after = captureGitSnapshot(repo)
		expect(diffBetweenSnapshots(repo, before, after)).toEqual([])
	})

	it("diffs a single file between two snapshots", () => {
		const before = captureGitSnapshot(repo)
		writeFileSync(join(repo, "new.ts"), "brand new\n")
		const after = captureGitSnapshot(repo)

		const diff = diffFileBetweenSnapshots(repo, before, after, "new.ts")
		expect(diff).toContain("new.ts")
		expect(diff).toContain("+brand new")
	})

	it("leaves the working index alone", () => {
		const before = git(["status", "--porcelain"])
		captureGitSnapshot(repo)
		expect(git(["status", "--porcelain"])).toBe(before)
	})
})
