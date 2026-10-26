import { spawnSync } from "child_process"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

export interface ChangedFile {
	path: string
	added: number
	deleted: number
	status: "added" | "modified" | "deleted"
}

/**
 * Object id of a tree holding the whole working tree (tracked files plus
 * untracked files that aren't gitignored), captured at a point in time.
 */
export interface GitSnapshot {
	tree: string
}

export const EMPTY_SNAPSHOT: GitSnapshot = { tree: "" }

function git(root: string, args: string[], env?: NodeJS.ProcessEnv): string {
	const result = spawnSync("git", args, {
		cwd: root,
		encoding: "utf-8",
		maxBuffer: 20 * 1024 * 1024,
		env: env ? { ...process.env, ...env } : process.env,
	})
	if (result.error) throw result.error
	return result.stdout || ""
}

/**
 * Tree id of the current working tree. A throwaway index is used so the
 * user's own index and stash are never touched.
 */
function snapshotTree(root: string): string {
	const dir = mkdtempSync(join(tmpdir(), "myagent-snapshot-"))
	try {
		const env = { GIT_INDEX_FILE: join(dir, "index") }
		git(root, ["add", "-A"], env)
		return git(root, ["write-tree"], env).trim()
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

/** Snapshot of the working tree, used both as a task baseline and as its end state. */
export function captureGitSnapshot(root: string): GitSnapshot {
	if (!root) return EMPTY_SNAPSHOT
	try {
		const tree = snapshotTree(root)
		return tree ? { tree } : EMPTY_SNAPSHOT
	} catch (err) {
		console.warn("captureGitSnapshot failed:", err)
		return EMPTY_SNAPSHOT
	}
}

function parseNumstat(
	out: string,
): Map<string, { added: number; deleted: number; binary: boolean }> {
	const counts = new Map<
		string,
		{ added: number; deleted: number; binary: boolean }
	>()
	for (const line of out.split("\n")) {
		const [added, deleted, ...rest] = line.split("\t")
		const path = rest.join("\t")
		if (!path) continue
		const binary = added === "-" || deleted === "-"
		counts.set(path, {
			added: binary ? 0 : Number(added) || 0,
			deleted: binary ? 0 : Number(deleted) || 0,
			binary,
		})
	}
	return counts
}

function treePaths(root: string, tree: string): Set<string> {
	if (!tree) return new Set()
	const out = git(root, ["ls-tree", "-r", "--name-only", "-z", tree])
	return new Set(out.split("\0").filter(Boolean))
}

/**
 * Files that differ between two snapshots. Comparing snapshots (rather than
 * the working tree against HEAD) keeps the report correct when the task
 * commits its own work, and avoids reporting files the task never touched.
 */
export function diffBetweenSnapshots(
	root: string,
	before: GitSnapshot,
	after: GitSnapshot,
): ChangedFile[] {
	if (!root || !before.tree || !after.tree) return []
	if (before.tree === after.tree) return []

	let numstat: Map<string, { added: number; deleted: number; binary: boolean }>
	try {
		numstat = parseNumstat(
			git(root, ["diff", "--numstat", "--no-renames", before.tree, after.tree]),
		)
	} catch (err) {
		console.warn("diffBetweenSnapshots failed:", err)
		return []
	}

	const beforePaths = treePaths(root, before.tree)
	const afterPaths = treePaths(root, after.tree)

	const files: ChangedFile[] = []
	for (const [path, counts] of numstat) {
		const status = !beforePaths.has(path)
			? "added"
			: !afterPaths.has(path)
				? "deleted"
				: "modified"
		// A mode-only change (e.g. chmod) shows up with zero line counts. It is
		// not a content change, so it should not produce a changed-files card.
		if (
			status === "modified" &&
			!counts.binary &&
			counts.added === 0 &&
			counts.deleted === 0
		) {
			continue
		}
		files.push({
			path,
			added: counts.added,
			deleted: counts.deleted,
			status,
		})
	}
	return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** Unified diff of one file between two snapshots. */
export function diffFileBetweenSnapshots(
	root: string,
	before: GitSnapshot,
	after: GitSnapshot,
	path: string,
): string {
	if (!root || !before.tree || !after.tree) return ""
	try {
		return git(root, ["diff", before.tree, after.tree, "--", path])
	} catch (err) {
		console.warn("diffFileBetweenSnapshots failed:", err)
		return ""
	}
}
