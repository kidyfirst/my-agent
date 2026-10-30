/**
 * Child-process helpers that never write to the app's terminal.
 *
 * `execSync` / `execFileSync` forward a child's stderr to the *parent* process
 * unless `stdio` is given explicitly. Every git probe in the main process is
 * written to fail softly — `git status` in a folder that is not a repository,
 * `gh pr view` in a repo without a PR — and the thrown error already carries
 * stderr, so the copy printed on the terminal is pure noise:
 *
 *     fatal: not a git repository (or any of the parent directories): .git
 *
 * That line appears in `npm run dev` whenever a task touches a project that is
 * not a git repo (an Obsidian vault, say) while the UI refreshes git status.
 *
 * Use these instead of `execSync` / `execFileSync` directly for anything that
 * is expected to fail as part of normal operation.
 */
import { execFileSync, execSync } from "node:child_process"

/** stdin ignored, stdout/stderr captured into the result (and the error). */
function quietStdio(): ["ignore", "pipe", "pipe"] {
	return ["ignore", "pipe", "pipe"]
}

export interface QuietExecOptions {
	cwd?: string
	timeout?: number
	maxBuffer?: number
	env?: NodeJS.ProcessEnv
}

/** `execSync` with stdout captured and stderr kept out of the terminal. */
export function execQuiet(
	command: string,
	options: QuietExecOptions = {},
): string {
	return execSync(command, {
		...options,
		encoding: "utf-8",
		stdio: quietStdio(),
	}) as unknown as string
}

/** `execFileSync` with stdout captured and stderr kept out of the terminal. */
export function execFileQuiet(
	file: string,
	args: string[],
	options: QuietExecOptions = {},
): string {
	return execFileSync(file, args, {
		...options,
		encoding: "utf-8",
		stdio: quietStdio(),
	}) as unknown as string
}
