import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * `execSync` forwards a child's stderr to the parent unless `stdio` is given,
 * which is how `fatal: not a git repository` used to land in the terminal that
 * runs `npm run dev` while the renderer refreshed git status for a project that
 * is not a repo. These cover the helper, plus a guard so a new call site cannot
 * reintroduce the leak.
 */
const execSyncMock = vi.fn((_command: string, _options?: any) => "out")
const execFileSyncMock = vi.fn(
	(_file: string, _args: string[], _o?: any) => "out",
)

vi.mock("node:child_process", () => ({
	execSync: (command: string, options?: any) => execSyncMock(command, options),
	execFileSync: (file: string, args: string[], options?: any) =>
		execFileSyncMock(file, args, options),
}))

const { execFileQuiet, execQuiet } = await import("../quiet-exec.js")

beforeEach(() => {
	execSyncMock.mockClear()
	execFileSyncMock.mockClear()
})

describe("execQuiet", () => {
	it("captures stdout and keeps stderr out of the parent process", () => {
		expect(execQuiet("git status --porcelain", { cwd: "/tmp/x" })).toBe("out")
		const options = execSyncMock.mock.calls[0][1]
		expect(options.cwd).toBe("/tmp/x")
		expect(options.encoding).toBe("utf-8")
		// stdin closed, stdout/stderr piped — `inherit` here is the bug.
		expect(options.stdio).toEqual(["ignore", "pipe", "pipe"])
	})

	it("passes timeout and maxBuffer through", () => {
		execQuiet("git fetch origin", { timeout: 60_000, maxBuffer: 1024 })
		expect(execSyncMock.mock.calls[0][1]).toMatchObject({
			timeout: 60_000,
			maxBuffer: 1024,
		})
	})

	it("still hands the caller the failure", () => {
		execSyncMock.mockImplementationOnce(() => {
			const err: any = new Error("Command failed: git status")
			err.stderr = "fatal: not a git repository"
			throw err
		})
		expect(() => execQuiet("git status")).toThrow(/Command failed/)
	})
})

describe("execFileQuiet", () => {
	it("forwards argv untouched and pipes stderr", () => {
		expect(
			execFileQuiet("git", ["branch", "-m", "feature/x"], { cwd: "/tmp/y" }),
		).toBe("out")
		const [file, args, options] = execFileSyncMock.mock.calls[0]
		expect(file).toBe("git")
		expect(args).toEqual(["branch", "-m", "feature/x"])
		expect(options.stdio).toEqual(["ignore", "pipe", "pipe"])
	})
})

describe("main-process call sites", () => {
	const dirs = ["src/electron", "src/utils"]

	function sources(dir: string, found: string[] = []): string[] {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name)
			if (statSync(full).isDirectory()) {
				if (name !== "__tests__" && name !== "node_modules")
					sources(full, found)
				continue
			}
			if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue
			if (name === "quiet-exec.ts") continue
			found.push(full)
		}
		return found
	}

	it("never calls execSync/execFileSync without piped stdio", () => {
		const offenders: string[] = []
		for (const file of dirs.flatMap((dir) => sources(dir))) {
			const lines = readFileSync(file, "utf-8").split("\n")
			lines.forEach((line, index) => {
				if (!/exec(Sync|FileSync)\(/.test(line)) return
				const block = lines.slice(index, index + 9).join("\n")
				if (!/stdio/.test(block)) offenders.push(`${file}:${index + 1}`)
			})
		}
		expect(offenders).toEqual([])
	})
})
