import { afterEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import {
	DEFAULT_LOGGING_CONFIG,
	Logger,
	formatLogLine,
	isLevelEnabled,
	normalizeLoggingConfig,
	type LogEntry,
} from "../index.js"

const tmpDirs: string[] = []
function tmpFile(name = "app.log"): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-log-"))
	tmpDirs.push(dir)
	return path.join(dir, name)
}

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) {
		try {
			fs.rmSync(dir, { recursive: true, force: true })
		} catch {}
	}
})

describe("level filtering", () => {
	it("drops everything when off", () => {
		for (const level of ["trace", "debug", "info", "warn", "error"] as const) {
			expect(isLevelEnabled(level, "off")).toBe(false)
		}
	})

	it("keeps the configured level and everything above it", () => {
		expect(isLevelEnabled("debug", "info")).toBe(false)
		expect(isLevelEnabled("info", "info")).toBe(true)
		expect(isLevelEnabled("error", "info")).toBe(true)
	})

	it("does not record entries below the configured level", () => {
		const logger = new Logger()
		logger.configure({ level: "warn" })

		logger.info("test", "hidden")
		logger.warn("test", "shown")
		logger.error("test", "also shown")

		const entries = logger.getEntries()
		expect(entries.map((e) => e.message)).toEqual(["shown", "also shown"])
	})

	it("records nothing at all while disabled", () => {
		const logger = new Logger()
		logger.configure({ level: "off" })
		logger.error("test", "boom")
		expect(logger.getEntries()).toHaveLength(0)
	})
})

describe("ring buffer", () => {
	it("keeps only the newest maxEntries", () => {
		const logger = new Logger()
		logger.configure({ level: "info", maxEntries: 3 })
		for (let i = 0; i < 10; i++) logger.info("test", `line ${i}`)

		const entries = logger.getEntries()
		expect(entries).toHaveLength(3)
		expect(entries.map((e) => e.message)).toEqual([
			"line 7",
			"line 8",
			"line 9",
		])
	})

	it("supports incremental reads by sequence number", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		logger.info("test", "a")
		logger.info("test", "b")
		logger.info("test", "c")

		const all = logger.getEntries()
		const since = logger.getEntries({ since: all[0].seq })
		expect(since.map((e) => e.message)).toEqual(["b", "c"])
	})

	it("assigns increasing sequence numbers", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		const a = logger.info("test", "a")!
		const b = logger.info("test", "b")!
		expect(b.seq).toBeGreaterThan(a.seq)
	})
})

describe("data sanitizing", () => {
	it("survives circular references", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		const circular: Record<string, unknown> = { name: "loop" }
		circular.self = circular

		const entry = logger.info("test", "circular", circular)!
		expect((entry.data as any).name).toBe("loop")
		expect((entry.data as any).self).toBe("[circular]")
	})

	it("truncates very long strings instead of blowing up memory", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		const entry = logger.info("test", "long", { text: "x".repeat(10_000) })!
		const text = (entry.data as any).text as string
		expect(text.length).toBeLessThan(5_000)
		expect(text).toContain("…")
	})

	it("keeps Error details including the stack", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		const entry = logger.info("test", "failed", new Error("nope"))!
		expect((entry.data as any).message).toBe("nope")
		expect((entry.data as any).stack).toContain("Error")
	})
})

describe("file output", () => {
	it("writes one formatted line per entry", () => {
		const file = tmpFile()
		const logger = new Logger()
		logger.configure({ level: "info" })
		logger.openFile(file)

		logger.info("boot", "started", { pid: 42 })
		logger.warn("ipc", "slow call")
		logger.flushNow()
		logger.close()

		const lines = fs.readFileSync(file, "utf8").trim().split("\n")
		expect(lines).toHaveLength(2)
		expect(lines[0]).toContain("INFO")
		expect(lines[0]).toContain("[boot] started")
		expect(lines[0]).toContain('{"pid":42}')
		expect(lines[1]).toContain("WARN")
	})

	it("appends to an existing file", () => {
		const file = tmpFile()
		fs.writeFileSync(file, "existing\n", "utf8")

		const logger = new Logger()
		logger.configure({ level: "info" })
		logger.openFile(file)
		logger.info("boot", "second run")
		logger.flushNow()
		logger.close()

		const content = fs.readFileSync(file, "utf8")
		expect(content.startsWith("existing\n")).toBe(true)
		expect(content).toContain("second run")
	})

	it("clear() truncates the file and empties the buffer", () => {
		const file = tmpFile()
		const logger = new Logger()
		logger.configure({ level: "info" })
		logger.openFile(file)
		logger.info("boot", "something")
		logger.flushNow()

		logger.clear()

		expect(fs.statSync(file).size).toBe(0)
		expect(logger.getEntries()).toHaveLength(0)
		logger.close()
	})
})

describe("subscribers", () => {
	it("notifies listeners and stops after unsubscribe", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		const seen: LogEntry[] = []
		const unsubscribe = logger.subscribe((e) => seen.push(e))

		logger.info("test", "one")
		unsubscribe()
		logger.info("test", "two")

		expect(seen.map((e) => e.message)).toEqual(["one"])
	})

	it("keeps logging when a listener throws", () => {
		const logger = new Logger()
		logger.configure({ level: "info" })
		logger.subscribe(() => {
			throw new Error("bad listener")
		})
		expect(() => logger.info("test", "still works")).not.toThrow()
		expect(logger.getEntries()).toHaveLength(1)
	})
})

describe("config normalization", () => {
	it("falls back to safe defaults", () => {
		expect(normalizeLoggingConfig(undefined)).toEqual(DEFAULT_LOGGING_CONFIG)
	})

	it("rejects an unknown level", () => {
		const cfg = normalizeLoggingConfig({ level: "loud" as any })
		expect(cfg.level).toBe(DEFAULT_LOGGING_CONFIG.level)
	})

	it("never leaves an enabled logger with level off", () => {
		const cfg = normalizeLoggingConfig({ enabled: true, level: "off" })
		expect(cfg.level).toBe("info")
	})

	it("keeps the chosen level while disabled so re-enabling restores it", () => {
		const cfg = normalizeLoggingConfig({ enabled: false, level: "debug" })
		expect(cfg.level).toBe("debug")
		expect(cfg.enabled).toBe(false)
	})
})

describe("line format", () => {
	it("is greppable and single-line", () => {
		const entry: LogEntry = {
			seq: 1,
			ts: Date.UTC(2026, 0, 2, 3, 4, 5, 6),
			level: "warn",
			scope: "tool",
			message: "slow",
			data: { ms: 1200 },
		}
		expect(formatLogLine(entry)).toBe(
			'2026-01-02T03:04:05.006Z WARN  [tool] slow {"ms":1200}',
		)
	})
})
