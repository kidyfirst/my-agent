import fs from "node:fs"
import { execSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { detectProject } from "../utils/project.js"
import { getDatabasePath } from "../utils/project.js"
import { deleteThreadTaskChanges } from "../snapshot/task-changes-store.js"

export function purgeProjectHistory(projectPath: string): void {
	if (!projectPath || projectPath === "/" || !projectPath.trim()) return
	try {
		const dbPath = getDatabasePath()
		if (!fs.existsSync(dbPath)) return

		const proj = detectProject(projectPath)
		const resourceIds = new Set<string>()
		if (proj.resourceId) resourceIds.add(proj.resourceId)

		// Check for worktrees associated with this repo
		try {
			if (
				fs.existsSync(projectPath) &&
				fs.statSync(projectPath).isDirectory()
			) {
				const output = execSync("git worktree list --porcelain", {
					cwd: projectPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				}) as string
				for (const block of output.split("\n\n").filter(Boolean)) {
					const firstLine = block.split("\n")[0]
					if (firstLine.startsWith("worktree ")) {
						const wtPath = firstLine.slice(9).trim()
						if (wtPath && wtPath !== projectPath) {
							const wtProj = detectProject(wtPath)
							if (wtProj.resourceId) resourceIds.add(wtProj.resourceId)
						}
					}
				}
			}
		} catch {
			// ignore git failure
		}

		const db = new DatabaseSync(dbPath)
		try {
			db.exec("BEGIN TRANSACTION;")
			for (const resId of resourceIds) {
				try {
					const threads = db
						.prepare("SELECT id FROM myagent_threads WHERE resourceId = ?")
						.all(resId) as Array<{ id: string }>
					for (const t of threads) {
						if (t?.id) {
							deleteThreadTaskChanges(t.id)
							db.prepare(
								"DELETE FROM myagent_messages WHERE thread_id = ?",
							).run(t.id)
						}
					}
				} catch {}

				try {
					db.prepare("DELETE FROM myagent_messages WHERE resourceId = ?").run(
						resId,
					)
				} catch {}
				try {
					db.prepare("DELETE FROM myagent_threads WHERE resourceId = ?").run(
						resId,
					)
				} catch {}
				try {
					db.prepare(
						"DELETE FROM myagent_observational_memory WHERE resourceId = ?",
					).run(resId)
				} catch {}
			}
			db.exec("COMMIT;")
		} catch (err) {
			try {
				db.exec("ROLLBACK;")
			} catch {}
			console.error("[purgeProjectHistory] Error purging SQLite records:", err)
		} finally {
			try {
				db.close()
			} catch {}
		}
	} catch (err) {
		console.error("[purgeProjectHistory] Failed:", err)
	}
}
