/**
 * Find a Chromium binary that `playwright-core` can actually launch.
 *
 * `playwright-core` hard-codes one expected browser revision. When the local
 * cache holds a different revision — extremely common on a dev machine, since
 * every Electron/Playwright upgrade bumps it — `chromium.launch()` throws
 * "Executable doesn't exist" and the only way out is a ~150MB download.
 *
 * The tool call that triggered the launch just hangs while that download runs.
 * Reusing any already-installed build avoids the download entirely: the
 * automation surface the agent uses (click/type/scroll/evaluate) is stable
 * across revisions, and taking a text snapshot of a page does not care about
 * the exact browser build.
 *
 * Filesystem access goes through the tiny `BrowserCacheIo` interface so the
 * layout rules can be tested without creating real directories.
 */
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

/** Env var that pins an explicit Chromium binary. */
export const CHROMIUM_PATH_ENV = "MY_AGENT_CHROMIUM_PATH"

/** The two filesystem reads this module needs. */
export interface BrowserCacheIo {
	exists(target: string): boolean
	list(dir: string): string[]
}

export const nodeCacheIo: BrowserCacheIo = {
	exists: (target) => fs.existsSync(target),
	list: (dir) => {
		try {
			return fs.readdirSync(dir)
		} catch {
			return []
		}
	},
}

/** Standard Playwright browser cache locations, most specific first. */
export function defaultCacheDirs(platform = process.platform): string[] {
	const home = os.homedir()
	const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH].filter(
		(value): value is string => Boolean(value),
	)
	if (platform === "darwin") {
		dirs.push(path.join(home, "Library", "Caches", "ms-playwright"))
	} else if (platform === "win32") {
		dirs.push(path.join(process.env.LOCALAPPDATA ?? home, "ms-playwright"))
	} else {
		dirs.push(path.join(home, ".cache", "ms-playwright"))
	}
	return dirs
}

/** Where the launcher lives inside a `chromium-<rev>` directory. */
function executableInside(
	dir: string,
	platform: NodeJS.Platform,
	io: BrowserCacheIo,
): string | null {
	if (platform === "darwin") {
		const app = path.join(
			dir,
			"chrome-mac",
			"Chromium.app",
			"Contents",
			"MacOS",
		)
		for (const name of ["Chromium", "chromium"]) {
			const candidate = path.join(app, name)
			if (io.exists(candidate)) return candidate
		}
		return null
	}
	const relative =
		platform === "win32"
			? path.join("chrome-win", "chrome.exe")
			: path.join("chrome-linux", "chrome")
	const candidate = path.join(dir, relative)
	return io.exists(candidate) ? candidate : null
}

export interface FoundChromium {
	executablePath: string
	revision: number
}

/**
 * Highest-revision installed Chromium build, or null. Higher revision is just
 * a heuristic for "most recently downloaded, most likely to work".
 */
export function findInstalledChromium(
	cacheDirs: string[] = defaultCacheDirs(),
	platform: NodeJS.Platform = process.platform,
	io: BrowserCacheIo = nodeCacheIo,
): FoundChromium | null {
	const found: FoundChromium[] = []
	for (const cacheDir of cacheDirs) {
		for (const entry of io.list(cacheDir)) {
			const match = /^chromium-(\d+)$/.exec(entry)
			if (!match) continue
			const executablePath = executableInside(
				path.join(cacheDir, entry),
				platform,
				io,
			)
			if (executablePath) {
				found.push({ executablePath, revision: Number(match[1]) })
			}
		}
	}
	if (found.length === 0) return null
	found.sort((a, b) => b.revision - a.revision)
	return found[0]!
}

/** Explicit override from the environment, if it points at a real file. */
export function envChromiumPath(
	io: BrowserCacheIo = nodeCacheIo,
): string | null {
	const fromEnv = process.env[CHROMIUM_PATH_ENV]
	return fromEnv && io.exists(fromEnv) ? fromEnv : null
}

/**
 * Executables to try when the default launch fails, in order. Empty when the
 * only option is to install.
 */
export function chromiumFallbacks(io: BrowserCacheIo = nodeCacheIo): string[] {
	const candidates: string[] = []
	const fromEnv = envChromiumPath(io)
	if (fromEnv) candidates.push(fromEnv)
	const installed = findInstalledChromium(
		defaultCacheDirs(),
		process.platform,
		io,
	)
	if (installed && installed.executablePath !== fromEnv) {
		candidates.push(installed.executablePath)
	}
	return candidates
}
