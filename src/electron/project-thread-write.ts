/**
 * Rename / delete a thread that belongs to a project which is not open.
 *
 * `renameThread` and `deleteThread` both run through the *active* harness, so
 * the sidebar can only manage the sessions of the open project — the ⋯ menu of
 * a sibling project's session had nothing it could call. The threads all live in
 * one SQLite database keyed by `resourceId`, so writing there directly is both
 * cheaper and safer than spinning a second harness up (no model resolution, no
 * MCP servers, no auth): the project is not running, so nobody holds a cache
 * that would go stale, and the next time it opens it reads the same rows.
 *
 * Every statement is scoped by `resourceId`, so a wrong path can never touch
 * another folder's rows.
 */

import * as fs from "fs"
import { DatabaseSync } from "node:sqlite"

interface ThreadWriteOptions {
	/** Absolute path of the SQLite database the harness writes to. */
	dbPath: string
	/**
	 * Scope of the owning folder, from `resourceIdVariants(projectPath)`.
	 *
	 * The folder can be stored under more than one id (see that helper), and the
	 * row has to be found whichever one wrote it — otherwise a session created
	 * before a remote was added could be listed but never renamed or deleted.
	 */
	resourceId: string | string[]
	threadId: string
}

/** Normalize the scope so every statement can bind a plain id list. */
function scopeIds(resourceId: string | string[]): string[] {
	const list = Array.isArray(resourceId) ? resourceId : [resourceId]
	return list.filter((id) => typeof id === "string" && id.length > 0)
}

/**
 * Tables that hold per-thread rows besides `myagent_threads`. Deleting only the
 * thread row would leave messages and state behind that a later re-import could
 * resurrect, so the row set is removed the same way `purgeProjectHistory` does.
 * Each entry is best-effort: an older database may not have every table.
 */
const THREAD_SCOPED_TABLES: Array<{ table: string; column: string }> = [
	{ table: "myagent_messages", column: "thread_id" },
	{ table: "myagent_observational_memory", column: "threadId" },
	{ table: "mastra_thread_state", column: "threadId" },
	{ table: "mastra_harness_sessions", column: "threadId" },
	{ table: "mastra_notifications", column: "threadId" },
	{ table: "mastra_background_tasks", column: "thread_id" },
]

function openDatabase(dbPath: string): DatabaseSync | null {
	try {
		if (!dbPath || !fs.existsSync(dbPath)) return null
		const db = new DatabaseSync(dbPath)
		// The app's own connection is open on this file; wait for its lock
		// instead of failing the write outright.
		try {
			db.exec("PRAGMA busy_timeout = 3000;")
		} catch {}
		return db
	} catch {
		return null
	}
}

function closeQuietly(db: DatabaseSync) {
	try {
		db.close()
	} catch {}
}

/** The thread exists and belongs to one of `resourceIds` — the guard for every write. */
function threadBelongsTo(
	db: DatabaseSync,
	resourceIds: string[],
	threadId: string,
): boolean {
	if (resourceIds.length === 0) return false
	try {
		const placeholders = resourceIds.map(() => "?").join(", ")
		const row = db
			.prepare(
				`SELECT id FROM myagent_threads WHERE id = ? AND resourceId IN (${placeholders}) LIMIT 1`,
			)
			.get(threadId, ...resourceIds)
		return Boolean(row)
	} catch {
		return false
	}
}

/** Remove the thread row(s) under any of the folder's scopes. */
function deleteThreadRows(
	db: DatabaseSync,
	resourceIds: string[],
	threadId: string,
): void {
	const placeholders = resourceIds.map(() => "?").join(", ")
	db.prepare(
		`DELETE FROM myagent_threads WHERE id = ? AND resourceId IN (${placeholders})`,
	).run(threadId, ...resourceIds)
}

/**
 * Rename one thread of a closed project.
 *
 * `updatedAt` is deliberately left alone: the sidebar uses it for the relative
 * time badge, and renaming a session should not make it look freshly used.
 */
export function renameThreadInDb(
	options: ThreadWriteOptions & { title: string },
): boolean {
	const { dbPath, resourceId, threadId, title } = options
	const ids = scopeIds(resourceId)
	const nextTitle = typeof title === "string" ? title.trim() : ""
	if (ids.length === 0 || !threadId || !nextTitle) return false

	const db = openDatabase(dbPath)
	if (!db) return false
	try {
		if (!threadBelongsTo(db, ids, threadId)) return false
		db.prepare("UPDATE myagent_threads SET title = ? WHERE id = ?").run(
			nextTitle,
			threadId,
		)
		return true
	} catch (err) {
		console.warn("[project-thread-write] rename failed", threadId, err)
		return false
	} finally {
		closeQuietly(db)
	}
}

/** Delete one thread of a closed project, together with its messages. */
export function deleteThreadInDb(options: ThreadWriteOptions): boolean {
	const { dbPath, resourceId, threadId } = options
	const ids = scopeIds(resourceId)
	if (ids.length === 0 || !threadId) return false

	const db = openDatabase(dbPath)
	if (!db) return false
	try {
		if (!threadBelongsTo(db, ids, threadId)) return false

		db.exec("BEGIN TRANSACTION;")
		try {
			for (const { table, column } of THREAD_SCOPED_TABLES) {
				try {
					db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(threadId)
				} catch {
					// Table missing in this database version.
				}
			}
			deleteThreadRows(db, ids, threadId)
			db.exec("COMMIT;")
		} catch (err) {
			try {
				db.exec("ROLLBACK;")
			} catch {}
			console.warn("[project-thread-write] delete failed", threadId, err)
			return false
		}
		return true
	} catch (err) {
		console.warn("[project-thread-write] delete failed", threadId, err)
		return false
	} finally {
		closeQuietly(db)
	}
}
