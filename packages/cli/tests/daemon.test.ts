import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
	writeDaemonInfo,
	readDaemonInfo,
	removeDaemonInfo,
	getDaemonFilePath,
	type DaemonInfo,
} from "../src/daemon.js"

describe("CLI Daemon Info Store", () => {
	let tempDir: string
	let origDataDir: string | undefined

	const testDaemon: DaemonInfo = {
		pid: process.pid,
		port: 3888,
		host: "127.0.0.1",
		baseUrl: "http://127.0.0.1:3888",
		cwd: process.cwd(),
		startedAt: new Date().toISOString(),
	}

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-agent-cli-test-"))
		origDataDir = process.env.MYAGENT_DATA_DIR
		process.env.MYAGENT_DATA_DIR = tempDir
		removeDaemonInfo()
	})

	afterEach(() => {
		removeDaemonInfo()
		if (origDataDir !== undefined) {
			process.env.MYAGENT_DATA_DIR = origDataDir
		} else {
			delete process.env.MYAGENT_DATA_DIR
		}
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("writes and reads active daemon info", () => {
		writeDaemonInfo(testDaemon)
		expect(fs.existsSync(getDaemonFilePath())).toBe(true)

		const loaded = readDaemonInfo()
		expect(loaded).toBeDefined()
		expect(loaded?.pid).toBe(process.pid)
		expect(loaded?.port).toBe(3888)
		expect(loaded?.baseUrl).toBe("http://127.0.0.1:3888")
	})

	it("removes daemon info correctly", () => {
		writeDaemonInfo(testDaemon)
		expect(fs.existsSync(getDaemonFilePath())).toBe(true)

		removeDaemonInfo()
		expect(fs.existsSync(getDaemonFilePath())).toBe(false)
		expect(readDaemonInfo()).toBeNull()
	})
})
