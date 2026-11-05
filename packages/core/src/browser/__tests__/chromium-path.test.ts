import { describe, it, expect, beforeEach, afterEach } from "vitest"
import path from "node:path"
import {
	CHROMIUM_PATH_ENV,
	type BrowserCacheIo,
	defaultCacheDirs,
	envChromiumPath,
	findInstalledChromium,
	chromiumFallbacks,
} from "../chromium-path.js"

/**
 * In-memory stand-in for the Playwright cache. Keeping the tests off the real
 * filesystem makes them deterministic and immune to sandbox restrictions on
 * temp directories.
 */
function memoryIo(
	files: string[],
	dirs: Record<string, string[]>,
): BrowserCacheIo {
	const existing = new Set(files)
	return {
		exists: (target) => existing.has(target),
		list: (dir) => dirs[dir] ?? [],
	}
}

/** Path of the launcher inside a `chromium-<rev>` dir for a given platform. */
function executableFor(
	cacheDir: string,
	revision: number,
	platform: NodeJS.Platform,
): string {
	const dir = path.join(cacheDir, `chromium-${revision}`)
	if (platform === "darwin") {
		return path.join(
			dir,
			"chrome-mac",
			"Chromium.app",
			"Contents",
			"MacOS",
			"Chromium",
		)
	}
	if (platform === "win32") return path.join(dir, "chrome-win", "chrome.exe")
	return path.join(dir, "chrome-linux", "chrome")
}

const CACHE = "/fake/ms-playwright"

describe("chromium-path", () => {
	const originalEnv = process.env[CHROMIUM_PATH_ENV]

	beforeEach(() => {
		delete process.env[CHROMIUM_PATH_ENV]
	})

	afterEach(() => {
		if (originalEnv === undefined) delete process.env[CHROMIUM_PATH_ENV]
		else process.env[CHROMIUM_PATH_ENV] = originalEnv
	})

	it("returns null when no chromium build is installed", () => {
		const io = memoryIo([], { [CACHE]: [] })
		expect(findInstalledChromium([CACHE], "darwin", io)).toBeNull()
	})

	it("returns null for a cache dir that does not exist", () => {
		const io = memoryIo([], {})
		expect(findInstalledChromium(["/nope"], "darwin", io)).toBeNull()
	})

	it("ignores directories that are not chromium-<rev>", () => {
		const io = memoryIo([], {
			[CACHE]: [
				"chromium_headless_shell-1208",
				"ffmpeg-1011",
				"chromium-latest",
				"chromium-",
			],
		})
		expect(findInstalledChromium([CACHE], "darwin", io)).toBeNull()
	})

	it("resolves the macOS bundle layout", () => {
		const exe = executableFor(CACHE, 1248, "darwin")
		const io = memoryIo([exe], { [CACHE]: ["chromium-1248"] })
		expect(findInstalledChromium([CACHE], "darwin", io)).toEqual({
			executablePath: exe,
			revision: 1248,
		})
	})

	it("resolves the linux layout", () => {
		const exe = executableFor(CACHE, 1208, "linux")
		const io = memoryIo([exe], { [CACHE]: ["chromium-1208"] })
		expect(findInstalledChromium([CACHE], "linux", io)?.executablePath).toBe(
			exe,
		)
	})

	it("resolves the windows layout", () => {
		const exe = executableFor(CACHE, 1208, "win32")
		const io = memoryIo([exe], { [CACHE]: ["chromium-1208"] })
		expect(findInstalledChromium([CACHE], "win32", io)?.executablePath).toBe(
			exe,
		)
	})

	it("prefers the highest revision", () => {
		const all = [1194, 1248, 1223].map((rev) =>
			executableFor(CACHE, rev, "darwin"),
		)
		const io = memoryIo(all, {
			[CACHE]: ["chromium-1194", "chromium-1248", "chromium-1223"],
		})
		expect(findInstalledChromium([CACHE], "darwin", io)?.revision).toBe(1248)
	})

	it("skips a build whose executable is missing", () => {
		const exe = executableFor(CACHE, 1208, "darwin")
		const io = memoryIo([exe], {
			[CACHE]: ["chromium-9999", "chromium-1208"],
		})
		expect(findInstalledChromium([CACHE], "darwin", io)?.executablePath).toBe(
			exe,
		)
	})

	it("scans several cache dirs in order", () => {
		const exe = executableFor("/other/ms-playwright", 1208, "darwin")
		const io = memoryIo([exe], {
			[CACHE]: [],
			["/other/ms-playwright"]: ["chromium-1208"],
		})
		expect(
			findInstalledChromium([CACHE, "/other/ms-playwright"], "darwin", io)
				?.executablePath,
		).toBe(exe)
	})

	it("honours the env override and ignores a bogus path", () => {
		const exe = executableFor(CACHE, 1208, "darwin")
		const io = memoryIo([exe], {})
		process.env[CHROMIUM_PATH_ENV] = exe
		expect(envChromiumPath(io)).toBe(exe)

		process.env[CHROMIUM_PATH_ENV] = "/nope/chromium"
		expect(envChromiumPath(io)).toBeNull()
	})

	it("puts the env override ahead of the discovered build", () => {
		const override = "/custom/chromium"
		const installed = executableFor(
			defaultCacheDirs()[0]!,
			1208,
			process.platform,
		)
		const io = memoryIo([override, installed], {
			[defaultCacheDirs()[0]!]: ["chromium-1208"],
		})
		process.env[CHROMIUM_PATH_ENV] = override
		expect(chromiumFallbacks(io)).toEqual([override, installed])
	})

	it("builds platform-specific default cache dirs", () => {
		expect(
			defaultCacheDirs("darwin").some((d) => d.includes("ms-playwright")),
		).toBe(true)
		expect(
			defaultCacheDirs("linux").some((d) => d.includes("ms-playwright")),
		).toBe(true)
		expect(
			defaultCacheDirs("win32").some((d) => d.includes("ms-playwright")),
		).toBe(true)
	})
})
