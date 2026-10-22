import { rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { beforeEach, describe, expect, it, vi } from "vitest"

const DATA_DIR = join(tmpdir(), "myagent-task-changes-test")

vi.mock("../utils/project.js", () => ({
	getAppDataDir: () => DATA_DIR,
}))

async function loadStore() {
	vi.resetModules()
	return await import("../electron/task-changes-store.js")
}

beforeEach(() => {
	rmSync(DATA_DIR, { recursive: true, force: true })
})

describe("task changes store", () => {
	it("keeps the changed files and diffs of a task", async () => {
		const store = await loadStore()
		store.saveTaskChanges({
			threadId: "thread-1",
			messageId: "msg-1",
			files: [
				{ path: "src/App.tsx", added: 3, deleted: 1, status: "modified" },
			],
			diffs: { "src/App.tsx": "diff --git a/src/App.tsx b/src/App.tsx" },
		})

		const thread = store.getThreadTaskChanges("thread-1")
		expect(thread["msg-1"].files).toHaveLength(1)
		expect(store.getStoredFileDiff("thread-1", "msg-1", "src/App.tsx")).toBe(
			"diff --git a/src/App.tsx b/src/App.tsx",
		)
	})

	it("survives a module reload (persisted to disk)", async () => {
		const first = await loadStore()
		first.saveTaskChanges({
			threadId: "thread-1",
			messageId: "msg-1",
			files: [
				{ path: "src/App.tsx", added: 3, deleted: 1, status: "modified" },
			],
			diffs: { "src/App.tsx": "diff" },
		})

		const second = await loadStore()
		expect(second.getThreadTaskChanges("thread-1")["msg-1"].files[0].path).toBe(
			"src/App.tsx",
		)
	})

	it("returns null for files it never recorded", async () => {
		const store = await loadStore()
		expect(store.getStoredFileDiff("thread-1", "msg-1", "src/App.tsx")).toBe(
			null,
		)
	})

	it("drops a thread's records when the thread is deleted", async () => {
		const store = await loadStore()
		store.saveTaskChanges({
			threadId: "thread-1",
			messageId: "msg-1",
			files: [{ path: "src/App.tsx", added: 1, deleted: 0, status: "added" }],
			diffs: { "src/App.tsx": "diff" },
		})
		store.deleteThreadTaskChanges("thread-1")
		expect(store.getThreadTaskChanges("thread-1")).toEqual({})
	})
})
