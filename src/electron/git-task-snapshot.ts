import { spawnSync } from "child_process"

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

function hashMap(root: string): GitSnapshot {
	const hashes: GitSnapshot = {}
	let out = ""
	try {
		out = git(root, ["ls-files", "-s", "-z"])
	} catch {
		return hashes
	}
	for (const entry of out.split("\0")) {
		if (!entry) continue
		const tab = entry.indexOf("\t")
		if (tab < 0) continue
		const sha = entry.slice(0, tab).split(" ")[1]
		hashes[entry.slice(tab + 1)] = sha || ""
	}
	return hashes
}

/** Absolute path -> blob hash of every tracked file. Used as a per-task baseline. */
export function captureGitBaseline(root: string): GitSnapshot {
	return hashMap(root)
}

function numstatFor(
	root: string,
	before: string,
	path: string,
): { added: number; deleted: number } {
	let out: string
	try {
		out = before
			? git(root, ["diff", "--numstat", before, "--", path])
			: git(root, ["diff", "--numstat", "--no-index", "/dev/null", path])
	} catch (err: unknown) {
		const stdout = (err as { stdout?: string | Buffer }).stdout
		out = stdout ? String(stdout) : ""
	}
	const line = out.split("\n").find((l) => l.includes(path))
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
	const current = hashMap(root)
	const files: ChangedFile[] = []

	for (const [path, sha] of Object.entries(current)) {
		const before = baseline[path]
		if (before === sha) continue
		files.push({
			path,
			...numstatFor(root, before, path),
			status: before ? "modified" : "added",
		})
	}

	for (const path of Object.keys(baseline)) {
		if (current[path] === undefined) {
			files.push({ path, added: 0, deleted: 0, status: "deleted" })
		}
	}

	return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** Unified diff of one file against a baseline taken with captureGitBaseline. */
export function diffFileSinceBaseline(
	root: string,
	baseline: GitSnapshot,
	path: string,
): string {
	const before = baseline[path]
	try {
		return before
			? git(root, ["diff", before, "--", path])
			: git(root, ["diff", "--no-index", "/dev/null", path])
	} catch (err: unknown) {
		// git diff --no-index exits with 1 when files differ
		const stdout = (err as { stdout?: string | Buffer }).stdout
		return stdout ? String(stdout) : ""
	}
}
