import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
	readProjectThreads,
	readProjectThreadsByPath,
} from "../project-threads"
import { detectProject, resourceIdVariants } from "../../utils/project"

let dir: string
let repo: string
let dbPath: string
let previousDbPath: string | undefined

const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, stdio: "ignore" })

/** The id a repo without a remote used, i.e. what older sessions sit under. */
function pathKeyedId(): string {
	const urlKeyed = detectProject(repo).resourceId
	const other = resourceIdVariants(repo).find((id) => id !== urlKeyed)
	if (!other) throw new Error("expected a second resource id variant")
	return other
}

function insertThread(id: string, resourceId: string, updatedAt: string) {
	const db = new DatabaseSync(dbPath)
	try {
		db.prepare(
			"INSERT INTO myagent_threads (id, resourceId, title, metadata, createdAt, updatedAt) VALUES (?,?,?,?,?,?)",
		).run(id, resourceId, id, null, updatedAt, updatedAt)
	} finally {
		db.close()
	}
}

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "project-threads-"))
	repo = path.join(dir, "my-agent")
	mkdirSync(repo)
	git(repo, "init", "-q")
	git(
		repo,
		"-c",
		"user.email=t@example.com",
		"-c",
		"user.name=t",
		"commit",
		"-q",
		"--allow-empty",
		"-m",
		"init",
	)
	git(
		repo,
		"remote",
		"add",
		"origin",
		"https://github.com/example/my-agent.git",
	)

	dbPath = path.join(dir, "myagent.db")
	previousDbPath = process.env.MYAGENT_DB_PATH
	process.env.MYAGENT_DB_PATH = dbPath

	const db = new DatabaseSync(dbPath)
	db.exec(`
		CREATE TABLE myagent_threads (
			id TEXT PRIMARY KEY, resourceId TEXT NOT NULL, title TEXT NOT NULL,
			metadata TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
		);
	`)
	db.close()
})

afterEach(() => {
	if (previousDbPath === undefined) delete process.env.MYAGENT_DB_PATH
	else process.env.MYAGENT_DB_PATH = previousDbPath
	rmSync(dir, { recursive: true, force: true })
})

describe("readProjectThreads", () => {
	it("reads sessions written under either resource id for the same folder", () => {
		// A remote added after the fact moved new sessions to the URL-keyed id.
		// The earlier ones stayed under the path-keyed id and used to vanish.
		const urlKeyed = detectProject(repo).resourceId
		insertThread("old-one", pathKeyedId(), "2026-10-01T00:00:00.000Z")
		insertThread("new-one", urlKeyed, "2026-10-02T00:00:00.000Z")

		const rows = readProjectThreads(repo) ?? []
		expect(rows.map((r) => r.id)).toEqual(["new-one", "old-one"])
	})

	it("never mixes in another folder's sessions", () => {
		const other = path.join(dir, "other")
		mkdirSync(other)
		git(other, "init", "-q")
		insertThread(
			"mine",
			detectProject(repo).resourceId,
			"2026-10-01T00:00:00.000Z",
		)
		insertThread(
			"theirs",
			detectProject(other).resourceId,
			"2026-10-02T00:00:00.000Z",
		)

		const rows = readProjectThreads(repo) ?? []
		expect(rows.map((r) => r.id)).toEqual(["mine"])
	})

	it("answers an empty list for a folder that really has no sessions", () => {
		expect(readProjectThreads(repo)).toEqual([])
	})

	it("reports an unreadable database as null instead of empty", () => {
		// "Cannot read" and "nothing stored" must not look the same: the sidebar
		// would blank a group that still has rows.
		process.env.MYAGENT_DB_PATH = path.join(dir, "missing.db")
		expect(readProjectThreads(repo)).toBeNull()
	})
})

describe("readProjectThreadsByPath", () => {
	it("answers every readable folder, empty or not", () => {
		// An empty list is a real answer ("no sessions here"); only a folder that
		// could not be read is left out of the map.
		insertThread(
			"mine",
			detectProject(repo).resourceId,
			"2026-10-01T00:00:00.000Z",
		)
		const other = path.join(dir, "other")
		mkdirSync(other)

		const byPath = readProjectThreadsByPath([repo, other])
		expect(Object.keys(byPath).sort()).toEqual([repo, other].sort())
		expect(byPath[repo].map((r) => r.id)).toEqual(["mine"])
		expect(byPath[other]).toEqual([])
	})
})
