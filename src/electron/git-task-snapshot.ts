import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { readFileSync, statSync } from "fs"
import { join } from "path"

export interface ChangedFile {
	path: string
	added: number
	deleted: number
	status: "added" | "modified" | "deleted"
}

export type GitSnapshot = Record<string, string>

function git(root: string, args: string[]): string {
	const result = spawnSync("git", args, {
		cwd: root,
		encoding: "utf-8",
		maxBuffer: 20 * 1024 * 1024,
	})
	if (result.error) throw result.error
	return result.stdout || ""
}

function trackedFiles(root: string): string[] {
	try {
		return git(root, ["ls-files", "-z"]).split("\0").filter(Boolean)
	} catch {
		return []
	}
}

function hashContent(root: string, path: string): string | null {
	try {
		return createHash("sha1")
			.update(readFileSync(join(root, path)))
			.digest("hex")
	} catch {
		return null
	}
}

/**
 * Path -> content hash of every tracked file, used as a per-task baseline.
 * Hashes the working tree (not the index) so uncommitted edits are detected.
 */
export function captureGitBaseline(root: string): GitSnapshot {
	const hashes: GitSnapshot = {}
	for (const path of trackedFiles(root)) {
		if (!statSync(join(root, path), { throwIfNoEntry: false })?.isFile())
			continue
		const hash = hashContent(root, path)
		if (hash) hashes[path] = hash
	}
	return hashes
}

/** Lines added/deleted for a file, read from `git diff --numstat`. */
function numstatFor(
	root: string,
	args: string[],
): { added: number; deleted: number } {
	let out = ""
	try {
		out = git(root, args)
	} catch {
		return { added: 0, deleted: 0 }
	}
	const line = out.split("\n").find((l) => l.includes("\t"))
	if (!line) return { added: 0, deleted: 0 }
	const [added, deleted] = line.split("\t")
	return {
		added: added === "-" ? 0 : Number(added) || 0,
		deleted: deleted === "-" ? 0 : Number(deleted) || 0,
	}
}

/** Files changed relative to a baseline taken with captureGitBaseline. */
export function diffSinceBaseline(
	root: string,
	baseline: GitSnapshot,
): ChangedFile[] {
	const files: ChangedFile[] = []

	for (const path of trackedFiles(root)) {
		const before = baseline[path]
		if (before && hashContent(root, path) === before) continue
		files.push({
			path,
			...numstatFor(root, ["diff", "--numstat", "HEAD", "--", path]),
			status: before ? "modified" : "added",
		})
	}

	// Files created during the task are still untracked, so `git diff` misses them.
	const untracked = git(root, [
		"ls-files",
		"--others",
		"--exclude-standard",
		"-z",
	])
		.split("\0")
		.filter(Boolean)
	for (const path of untracked) {
		if (!statSync(join(root, path), { throwIfNoEntry: false })?.isFile())
			continue
		files.push({
			path,
			...numstatFor(root, [
				"diff",
				"--numstat",
				"--no-index",
				"/dev/null",
				path,
			]),
			status: "added",
		})
	}

	for (const path of Object.keys(baseline)) {
		if (statSync(join(root, path), { throwIfNoEntry: false })) continue
		files.push({ path, added: 0, deleted: 0, status: "deleted" })
	}

	return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** Unified diff of one file against a baseline taken with captureGitBaseline. */
export function diffFileSinceBaseline(
	root: string,
	_baseline: GitSnapshot,
	path: string,
): string {
	const tracked = trackedFiles(root).includes(path)
	try {
		return tracked
			? git(root, ["diff", "HEAD", "--", path])
			: git(root, ["diff", "--no-index", "/dev/null", path])
	} catch (err: unknown) {
		// `git diff --no-index` exits with 1 when the files differ
		const stdout = (err as { stdout?: string | Buffer }).stdout
		return stdout ? String(stdout) : ""
	}
}
