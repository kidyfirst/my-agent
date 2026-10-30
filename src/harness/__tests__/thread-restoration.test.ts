import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import { createMyAgent } from "../index.js"
import { SQLiteStore } from "../../store/index.js"
import { detectProject } from "../../utils/project.js"
import { purgeProjectHistory } from "../../electron/ipc/project-handlers.js"
import {
	saveRecentProject,
	saveRecentProjectLastThread,
	getRecentProjectLastThread,
	loadRecentProjects,
	getLastActiveProject,
	removeRecentProject,
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

	it("sorts most recently activated project to the front with its active thread", () => {
		const projectA = "/tmp/test-project-a-" + Date.now()
		const projectB = "/tmp/test-project-b-" + Date.now()

		saveRecentProject(projectA, "Project A", "thread-a1")
		expect(getLastActiveProject()?.rootPath).toBe(path.resolve(projectA))
		expect(getLastActiveProject()?.lastThreadId).toBe("thread-a1")

		saveRecentProject(projectB, "Project B", "thread-b1")
		expect(getLastActiveProject()?.rootPath).toBe(path.resolve(projectB))
		expect(getLastActiveProject()?.lastThreadId).toBe("thread-b1")

		// Switching thread in Project A should bring Project A back to the top
		saveRecentProjectLastThread(projectA, "thread-a2")
		expect(getLastActiveProject()?.rootPath).toBe(path.resolve(projectA))
		expect(getLastActiveProject()?.lastThreadId).toBe("thread-a2")

		const projects = loadRecentProjects()
		expect(projects[0].rootPath).toBe(path.resolve(projectA))
		expect(projects[0].lastThreadId).toBe("thread-a2")
		expect(projects[1].rootPath).toBe(path.resolve(projectB))
		expect(projects[1].lastThreadId).toBe("thread-b1")
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

	it("does not leak threads from one project to another", async () => {
		const storage = new SQLiteStore(":memory:")
		await storage.init()

		const testPathA = "/tmp/test-repo-a-" + Date.now()
		const testPathB = "/tmp/test-repo-b-" + Date.now()

		const { harness: hA } = await createMyAgent({
			cwd: testPathA,
			storage,
			disableMcp: true,
			disableHooks: true,
		})
		await hA.init()
		await hA.createThread({ title: "Thread in Project A" })
		expect((await hA.listThreads()).length).toBe(1)

		const { harness: hB } = await createMyAgent({
			cwd: testPathB,
			storage,
			disableMcp: true,
			disableHooks: true,
		})
		await hB.init()
		expect(await hB.listThreads()).toEqual([])
		expect(hB.getCurrentThreadId()).toBe("")
	})

	it("maintains thread-level model, mode, approve, and thinkingLevel across thread switches", async () => {
		const storage = new SQLiteStore(":memory:")
		await storage.init()

		const testPath = "/tmp/test-repo-thread-configs-" + Date.now()

		const { harness } = await createMyAgent({
			cwd: testPath,
			storage,
			disableMcp: true,
			disableHooks: true,
		})
		await harness.init()

		// Thread 1: create with custom model, mode, thinking, approve
		const thread1 = await harness.createThread({
			title: "Thread 1",
			metadata: {
				modelId: "openai/gpt-4o",
				modeId: "plan",
				thinkingLevel: "high",
				permissionMode: "auto-approve",
			},
		})
		expect(thread1.id).toBe(harness.getCurrentThreadId())

		// Thread 2: create with different settings
		const thread2 = await harness.createThread({
			title: "Thread 2",
			metadata: {
				modelId: "deepseek/deepseek-chat",
				modeId: "fast",
				thinkingLevel: "off",
				permissionMode: "read-only",
			},
		})
		expect(thread2.id).toBe(harness.getCurrentThreadId())
		expect(harness.getCurrentModelId()).toBe("deepseek/deepseek-chat")
		expect(harness.getCurrentModeId()).toBe("fast")

		// Switch back to Thread 1: should automatically restore Thread 1's settings
		await harness.switchThread({ threadId: thread1.id })
		expect(harness.getCurrentThreadId()).toBe(thread1.id)
		expect(harness.getCurrentModelId()).toBe("openai/gpt-4o")
		expect(harness.getCurrentModeId()).toBe("plan")
		expect(harness.getState().thinkingLevel).toBe("high")
		expect(harness.getState().yolo).toBe(true)

		// Switch to Thread 2: should restore Thread 2's settings
		await harness.switchThread({ threadId: thread2.id })
		expect(harness.getCurrentThreadId()).toBe(thread2.id)
		expect(harness.getCurrentModelId()).toBe("deepseek/deepseek-chat")
		expect(harness.getCurrentModeId()).toBe("fast")
		expect(harness.getState().thinkingLevel).toBe("off")
		expect(harness.getState().yolo).toBe(false)
	})

	it("removes project with path normalization and prevents resurrection", () => {
		const projectA = "/tmp/test-project-a-" + Date.now()
		const projectB = "/tmp/test-project-b-" + Date.now()

		saveRecentProject(projectA, "Project A", "thread-a1")
		saveRecentProject(projectB, "Project B", "thread-b1")

		let projects = loadRecentProjects()
		expect(projects).toHaveLength(2)

		// Remove Project B with trailing slash and case differences
		removeRecentProject(projectB.toUpperCase() + "///")

		projects = loadRecentProjects()
		expect(projects).toHaveLength(1)
		expect(projects[0].rootPath).toBe(path.resolve(projectA))

		// Simulated quit handler checking loadRecentProjects() before re-saving active session
		const activeSessionPath = projectB
		const recent = loadRecentProjects()
		const shouldSave =
			activeSessionPath &&
			recent.some(
				(r) =>
					path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase() ===
					path.resolve(activeSessionPath).replace(/\/+$/, "").toLowerCase(),
			)

		expect(shouldSave).toBe(false)
		if (shouldSave) {
			saveRecentProject(activeSessionPath, "Project B", "thread-b1")
		}

		// Verify project B is NOT resurrected after app quit check
		expect(loadRecentProjects()).toHaveLength(1)
		expect(loadRecentProjects()[0].rootPath).toBe(path.resolve(projectA))
	})

	it("purges project history when purgeProjectHistory is called", async () => {
		const tmpDb = path.join(
			os.tmpdir(),
			`test-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
		)
		process.env.MYAGENT_DB_PATH = tmpDb

		const testPath = "/tmp/test-purge-repo-" + Date.now()
		const store = new SQLiteStore({ url: `file:${tmpDb}` })
		await store.init()
		const mem = await store.getStore("memory")

		const proj = detectProject(testPath)
		await mem.saveThread({
			thread: {
				id: "purge-thread-1",
				resourceId: proj.resourceId,
				title: "Test Thread",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		})
		await mem.saveMessages({
			messages: [
				{
					id: "msg-1",
					thread_id: "purge-thread-1",
					role: "user",
					type: "text",
					content: [{ type: "text", text: "hello" }],
					createdAt: new Date(),
					resourceId: proj.resourceId,
				},
			],
		})

		let threads = await mem.listThreads({ resourceId: proj.resourceId })
		expect(threads.threads).toHaveLength(1)

		await store.close()

		purgeProjectHistory(testPath)

		// Reopen store and verify threads and messages are purged
		const reopenStore = new SQLiteStore({ url: `file:${tmpDb}` })
		await reopenStore.init()
		const reopenMem = await reopenStore.getStore("memory")

		threads = await reopenMem.listThreads({ resourceId: proj.resourceId })
		expect(threads.threads).toHaveLength(0)

		const msgs = await reopenMem.listMessages({ threadId: "purge-thread-1" })
		expect(msgs.messages).toHaveLength(0)

		await reopenStore.close()
		try {
			if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb)
		} catch {}
	})
})
