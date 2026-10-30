/**
 * Thread lists for projects that are not open right now.
 *
 * Only the active project holds a harness, and `getSession` therefore only ever
 * lists *its* threads. The sidebar shows every project at once though, so an
 * expanded group that is not open still has to render its own sessions —
 * otherwise expanding a second project looks like it collapsed the first one.
 *
 * Spinning up a harness per project just to read titles would drag model
 * resolution and MCP servers along with it, so the threads table is read
 * directly instead. It is the same database the harness writes to.
 */

import * as fs from "fs"
import { DatabaseSync } from "node:sqlite"
import {
	detectProject,
	getDatabasePath,
	resourceIdVariants,
} from "../utils/project.js"

/** The subset of a thread the sidebar needs; no messages are loaded. */
export interface ProjectThreadSummary {
	id: string
	resourceId: string
	title: string
	createdAt: string
	updatedAt: string
	metadata?: Record<string, unknown> | null
}

function parseMetadata(raw: unknown): Record<string, unknown> | null {
	if (typeof raw !== "string" || !raw) return null
	try {
		const parsed = JSON.parse(raw)
		return parsed && typeof parsed === "object" ? parsed : null
	} catch {
		return null
	}
}

/**
 * Sessions of the project (or worktree) at `projectPath`, newest update first.
 *
 * `null` means "could not read" (no database, unreadable file, unexpected
 * failure) as opposed to an empty list, which means "this folder really has no
 * sessions". The sidebar needs the difference: treating a failed read as empty
 * blanked a group that still had rows on screen.
 */
export function readProjectThreads(
	projectPath: string,
): ProjectThreadSummary[] | null {
	if (!projectPath || projectPath === "/") return null
	try {
		const dbPath = getDatabasePath()
		if (!dbPath || !fs.existsSync(dbPath)) return null

		const { resourceId } = detectProject(projectPath)
		if (!resourceId) return null

		// A folder can be keyed by its path *or* by its git URL, and adding a
		// remote later moves new sessions to the other id. Read every variant so
		// sessions written before that never drop out of the sidebar.
		const ids = (() => {
			try {
				return resourceIdVariants(projectPath)
			} catch {
				return [resourceId]
			}
		})()

		const db = new DatabaseSync(dbPath)
		try {
			const placeholders = ids.map(() => "?").join(", ")
			const rows = db
				.prepare(
					`SELECT id, resourceId, title, metadata, createdAt, updatedAt
					 FROM myagent_threads
					 WHERE resourceId IN (${placeholders})
					 ORDER BY updatedAt DESC, rowid DESC`,
				)
				.all(...ids) as Array<Record<string, unknown>>
			return rows.map((r) => ({
				id: String(r.id),
				resourceId: String(r.resourceId),
				title: String(r.title ?? ""),
				createdAt: String(r.createdAt ?? ""),
				updatedAt: String(r.updatedAt ?? r.createdAt ?? ""),
				metadata: parseMetadata(r.metadata),
			}))
		} finally {
			try {
				db.close()
			} catch {}
		}
	} catch (err) {
		console.warn("[project-threads] failed to read threads", projectPath, err)
		return null
	}
}

/**
 * Batch form used by the sidebar: one map keyed by the requested folders.
 *
 * A folder that could not be read is left out of the map entirely rather than
 * answered with `[]` — the sidebar keeps whatever it already showed for it.
 */
export function readProjectThreadsByPath(
	paths: string[],
): Record<string, ProjectThreadSummary[]> {
	const result: Record<string, ProjectThreadSummary[]> = {}
	for (const p of paths) {
		if (typeof p !== "string" || !p) continue
		const threads = readProjectThreads(p)
		if (threads) result[p] = threads
	}
	return result
}
