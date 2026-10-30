import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { deleteThreadInDb, renameThreadInDb } from "../project-thread-write"

const ALPHA = "alpha-1a2b3c"
const BETA = "beta-4d5e6f"

let dir: string
let dbPath: string

/** Same columns the harness writes, so the queries are exercised for real. */
function seed() {
	const db = new DatabaseSync(dbPath)
	db.exec(`
		CREATE TABLE myagent_threads (
			id TEXT PRIMARY KEY, resourceId TEXT NOT NULL, title TEXT NOT NULL,
			metadata TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
		);
		CREATE TABLE myagent_messages (
			id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, content TEXT NOT NULL,
			role TEXT NOT NULL, type TEXT NOT NULL, createdAt TEXT NOT NULL,
			resourceId TEXT, durationMs INTEGER
		);
		CREATE TABLE mastra_thread_state (
			threadId TEXT NOT NULL, type TEXT NOT NULL, value TEXT,
			createdAt TEXT, updatedAt TEXT
		);
	`)
	const insertThread = db.prepare(
		"INSERT INTO myagent_threads (id, resourceId, title, metadata, createdAt, updatedAt) VALUES (?,?,?,?,?,?)",
	)
	insertThread.run(
		"t-alpha",
		ALPHA,
		"Alpha session",
		null,
		"2026-10-01",
		"2026-10-02",
	)
	insertThread.run(
		"t-alpha-2",
		ALPHA,
		"Alpha other",
		null,
		"2026-10-01",
		"2026-10-03",
	)
	insertThread.run(
		"t-beta",
		BETA,
		"Beta session",
		null,
		"2026-10-01",
		"2026-10-04",
	)

	const insertMessage = db.prepare(
		"INSERT INTO myagent_messages (id, thread_id, content, role, type, createdAt, resourceId) VALUES (?,?,?,?,?,?,?)",
	)
	insertMessage.run("m1", "t-alpha", "hi", "user", "text", "2026-10-02", ALPHA)
	insertMessage.run(
		"m2",
		"t-alpha",
		"hello",
		"assistant",
		"text",
		"2026-10-02",
		ALPHA,
	)
	insertMessage.run("m3", "t-beta", "yo", "user", "text", "2026-10-04", BETA)
	db.exec(
		"INSERT INTO mastra_thread_state (threadId, type, value) VALUES ('t-alpha','mode','react')",
	)
	db.close()
}

function read<T>(sql: string, ...params: unknown[]): T[] {
	const db = new DatabaseSync(dbPath)
	try {
		return db.prepare(sql).all(...(params as never[])) as T[]
	} finally {
		db.close()
	}
}

const threadTitles = () =>
	read<{ id: string; title: string }>(
		"SELECT id, title FROM myagent_threads ORDER BY id",
	)

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "thread-write-"))
	dbPath = path.join(dir, "myagent.db")
	seed()
})

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
})

describe("renameThreadInDb", () => {
	it("renames the thread of a closed project", () => {
		expect(
			renameThreadInDb({
				dbPath,
				resourceId: ALPHA,
				threadId: "t-alpha",
				title: "  Renamed  ",
			}),
		).toBe(true)
		expect(threadTitles()).toEqual([
			{ id: "t-alpha", title: "Renamed" },
			{ id: "t-alpha-2", title: "Alpha other" },
			{ id: "t-beta", title: "Beta session" },
		])
	})

	it("keeps updatedAt so the row's time badge does not jump", () => {
		renameThreadInDb({
			dbPath,
			resourceId: ALPHA,
			threadId: "t-alpha",
			title: "Renamed",
		})
		expect(
			read<{ updatedAt: string }>(
				"SELECT updatedAt FROM myagent_threads WHERE id = 't-alpha'",
			)[0].updatedAt,
		).toBe("2026-10-02")
	})

	it("refuses a thread that belongs to another folder", () => {
		expect(
			renameThreadInDb({
				dbPath,
				resourceId: ALPHA,
				threadId: "t-beta",
				title: "Hijacked",
			}),
		).toBe(false)
		expect(threadTitles().find((t) => t.id === "t-beta")?.title).toBe(
			"Beta session",
		)
	})

	it("ignores a blank title", () => {
		expect(
			renameThreadInDb({
				dbPath,
				resourceId: ALPHA,
				threadId: "t-alpha",
				title: "   ",
			}),
		).toBe(false)
	})

	it("returns false instead of throwing when the database is gone", () => {
		expect(
			renameThreadInDb({
				dbPath: path.join(dir, "missing.db"),
				resourceId: ALPHA,
				threadId: "t-alpha",
				title: "Renamed",
			}),
		).toBe(false)
	})
})

describe("deleteThreadInDb", () => {
	it("removes the thread with its messages and state", () => {
		expect(
			deleteThreadInDb({ dbPath, resourceId: ALPHA, threadId: "t-alpha" }),
		).toBe(true)

		expect(threadTitles().map((t) => t.id)).toEqual(["t-alpha-2", "t-beta"])
		expect(
			read<{ id: string }>(
				"SELECT id FROM myagent_messages WHERE thread_id = 't-alpha'",
			),
		).toEqual([])
		expect(
			read<{ threadId: string }>(
				"SELECT threadId FROM mastra_thread_state WHERE threadId = 't-alpha'",
			),
		).toEqual([])
	})

	it("leaves the other project's threads untouched", () => {
		deleteThreadInDb({ dbPath, resourceId: ALPHA, threadId: "t-alpha" })
		expect(
			read<{ id: string }>(
				"SELECT id FROM myagent_messages WHERE thread_id = 't-beta'",
			),
		).toHaveLength(1)
		expect(threadTitles().some((t) => t.id === "t-beta")).toBe(true)
	})

	it("refuses a thread that belongs to another folder", () => {
		expect(
			deleteThreadInDb({ dbPath, resourceId: ALPHA, threadId: "t-beta" }),
		).toBe(false)
		expect(threadTitles().some((t) => t.id === "t-beta")).toBe(true)
	})

	it("tolerates databases without the newer tables", () => {
		// A database created before thread state existed must still delete.
		const bare = path.join(dir, "bare.db")
		const db = new DatabaseSync(bare)
		db.exec(`
			CREATE TABLE myagent_threads (
				id TEXT PRIMARY KEY, resourceId TEXT NOT NULL, title TEXT NOT NULL,
				metadata TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
			);
			INSERT INTO myagent_threads VALUES ('t1','res','Old',NULL,'2026-01-01','2026-01-01');
		`)
		db.close()

		expect(
			deleteThreadInDb({ dbPath: bare, resourceId: "res", threadId: "t1" }),
		).toBe(true)
	})
})

describe("folder stored under more than one resource id", () => {
	const LEGACY = "alpha-legacy"

	/** A session written before a remote existed moved the project's id. */
	function seedLegacyThread() {
		const db = new DatabaseSync(dbPath)
		try {
			db.prepare(
				"INSERT INTO myagent_threads (id, resourceId, title, metadata, createdAt, updatedAt) VALUES (?,?,?,?,?,?)",
			).run("t-legacy", LEGACY, "Old session", null, "2026-09-01", "2026-09-02")
		} finally {
			db.close()
		}
	}

	it("renames a row written under the older id", () => {
		seedLegacyThread()
		expect(
			renameThreadInDb({
				dbPath,
				resourceId: [ALPHA, LEGACY],
				threadId: "t-legacy",
				title: "Renamed legacy",
			}),
		).toBe(true)
		expect(threadTitles().find((t) => t.id === "t-legacy")?.title).toBe(
			"Renamed legacy",
		)
	})

	it("deletes a row written under the older id", () => {
		seedLegacyThread()
		expect(
			deleteThreadInDb({
				dbPath,
				resourceId: [ALPHA, LEGACY],
				threadId: "t-legacy",
			}),
		).toBe(true)
		expect(threadTitles().some((t) => t.id === "t-legacy")).toBe(false)
	})

	it("still refuses an id outside every scope", () => {
		seedLegacyThread()
		expect(
			deleteThreadInDb({
				dbPath,
				resourceId: [ALPHA],
				threadId: "t-legacy",
			}),
		).toBe(false)
		expect(threadTitles().some((t) => t.id === "t-legacy")).toBe(true)
	})
})
