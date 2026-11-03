import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
	loadRecentProjects,
	saveRecentProject,
	saveRecentProjectLastThread,
} from "../recent-projects.js"

/**
 * The sidebar orders projects by `addedAt`, so it must be stamped exactly once
 * and never refreshed by later opens — otherwise the list reshuffles.
 */
describe("recent projects addedAt", () => {
	let tmpPath: string

	beforeEach(() => {
		tmpPath = path.join(
			os.tmpdir(),
			`recent-projects-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
		)
		process.env.MYAGENT_RECENT_PROJECTS_PATH = tmpPath
	})

	afterEach(() => {
		delete process.env.MYAGENT_RECENT_PROJECTS_PATH
		try {
			if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
		} catch {}
	})

	const find = (rootPath: string) =>
		loadRecentProjects().find((p) => p.rootPath === path.resolve(rootPath))

	it("stamps addedAt when a project is first added", () => {
		saveRecentProject("/tmp/proj-new", "New")
		const project = find("/tmp/proj-new")
		expect(project?.addedAt).toBeTruthy()
		expect(Number.isNaN(Date.parse(project!.addedAt!))).toBe(false)
	})

	it("keeps the original addedAt when the project is opened again", () => {
		saveRecentProject("/tmp/proj-reopen", "Reopen")
		const first = find("/tmp/proj-reopen")!.addedAt

		saveRecentProject("/tmp/proj-reopen", "Reopen")
		saveRecentProjectLastThread("/tmp/proj-reopen", "thread-1")

		expect(find("/tmp/proj-reopen")!.addedAt).toBe(first)
	})

	it("backfills addedAt for entries written before it existed", () => {
		const legacyLastOpened = "2024-01-01T00:00:00.000Z"
		fs.writeFileSync(
			tmpPath,
			JSON.stringify([
				{
					name: "Legacy",
					rootPath: "/tmp/proj-legacy",
					lastOpened: legacyLastOpened,
				},
			]),
		)

		saveRecentProject("/tmp/proj-legacy", "Legacy")

		// The oldest timestamp we have is the previous lastOpened.
		expect(find("/tmp/proj-legacy")!.addedAt).toBe(legacyLastOpened)
	})
})
