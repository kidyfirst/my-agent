import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import { createMyAgent } from "../index.js"
import { SQLiteStore } from "../../store/index.js"
import {
	saveRecentProjectLastThread,
	getRecentProjectLastThread,
} from "../../utils/recent-projects.js"

describe("Thread Restoration & Persistence", () => {
	let tmpRecentPath: string

	beforeEach(() => {
		tmpRecentPath = path.join(
			os.tmpdir(),
			`test-recent-projects-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
		)
		process.env.MYAGENT_RECENT_PROJECTS_PATH = tmpRecentPath
	})

	afterEach(() => {
		delete process.env.MYAGENT_RECENT_PROJECTS_PATH
		try {
			if (fs.existsSync(tmpRecentPath)) fs.unlinkSync(tmpRecentPath)
		} catch {}
	})

	it("saves and retrieves lastThreadId in recent projects", () => {
		const testPath = "/tmp/test-project-" + Date.now()
		expect(getRecentProjectLastThread(testPath)).toBeNull()

		saveRecentProjectLastThread(testPath, "thread-123")
		expect(getRecentProjectLastThread(testPath)).toBe("thread-123")

		saveRecentProjectLastThread(testPath, "thread-456")
		expect(getRecentProjectLastThread(testPath)).toBe("thread-456")
	})

	it("restores the most recent thread on harness.init() when threads exist in storage", async () => {
		const storage = new SQLiteStore(":memory:")
		await storage.init()

		const testPath = "/tmp/test-repo-" + Date.now()

		// First instance creates two threads
		const { harness: h1 } = await createMyAgent({
			cwd: testPath,
			storage,
			disableMcp: true,
			disableHooks: true,
		})
		await h1.init()

		const thread1 = await h1.createThread({ title: "Older Thread" })
		const thread2 = await h1.createThread({ title: "Newer Thread" })
		expect(h1.getCurrentThreadId()).toBe(thread2.id)

		// Create a second instance simulating app startup / project reload with same storage
		const { harness: h2 } = await createMyAgent({
			cwd: testPath,
			storage,
			disableMcp: true,
			disableHooks: true,
		})

		// Before init(), currentThreadId is empty
		expect(h2.getCurrentThreadId()).toBe("")

		// After init(), it automatically restores the latest active thread
		await h2.init()
		expect(h2.getCurrentThreadId()).toBe(thread2.id)

		// getSession() returns the active thread instead of null
		const session = await h2.getSession()
		expect(session.currentThreadId).toBe(thread2.id)
		expect(session.threads.length).toBe(2)
	})

	it("restores saved lastThreadId when specified in recent projects", async () => {
		const storage = new SQLiteStore(":memory:")
		await storage.init()

		const testPath = "/tmp/test-repo-saved-" + Date.now()

		const { harness: h1 } = await createMyAgent({
			cwd: testPath,
			storage,
			disableMcp: true,
			disableHooks: true,
		})
		await h1.init()

		const thread1 = await h1.createThread({ title: "Thread 1" })
		const thread2 = await h1.createThread({ title: "Thread 2" })

		// User last viewed thread1
		saveRecentProjectLastThread(testPath, thread1.id)

		// Create a new harness instance for the same project
		const { harness: h2 } = await createMyAgent({
			cwd: testPath,
			storage,
			disableMcp: true,
			disableHooks: true,
		})
		await h2.init()

		// Should restore thread1 because it was the saved last active thread
		expect(h2.getCurrentThreadId()).toBe(thread1.id)
		const session = await h2.getSession()
		expect(session.currentThreadId).toBe(thread1.id)
	})
})
