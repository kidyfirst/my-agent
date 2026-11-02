import { describe, it, expect } from "vitest"
import { DatabaseSync } from "node:sqlite"
import {
	SQLiteStore,
	SQLiteMemoryStore,
	MIGRATIONS,
	getUserVersion,
	setUserVersion,
	addColumnIfMissing,
	hasColumn,
} from "../index.js"
import { INIT_SQL } from "../schema.js"

describe("SQLite PRAGMA user_version migrations", () => {
	it("initializes a fresh database to the latest user_version", async () => {
		const store = new SQLiteStore({ url: ":memory:" })
		await store.init()

		const version = store.getUserVersion()
		expect(version).toBe(MIGRATIONS.length)
		expect(version).toBeGreaterThanOrEqual(1)

		await store.close()
	})

	it("migrates a legacy v0 database without durationMs and updates user_version", async () => {
		const db = new DatabaseSync(":memory:")

		// Create legacy v0 schema without durationMs
		db.exec(`
			CREATE TABLE myagent_threads (
				id TEXT PRIMARY KEY,
				resourceId TEXT NOT NULL,
				title TEXT NOT NULL,
				metadata TEXT,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			);

			CREATE TABLE myagent_messages (
				id TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL,
				content TEXT NOT NULL,
				role TEXT NOT NULL,
				type TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				resourceId TEXT
			);
		`)

		// Verify durationMs is initially missing and user_version is 0
		expect(getUserVersion(db)).toBe(0)
		expect(hasColumn(db, "myagent_messages", "durationMs")).toBe(false)

		// Insert existing message in v0 structure
		db.exec(`
			INSERT INTO myagent_messages (id, thread_id, content, role, type, createdAt, resourceId)
			VALUES ('msg-v0', 't-1', 'hello v0', 'user', 'text', '2026-10-29', 'res-1');
		`)

		const memoryStore = new SQLiteMemoryStore(db)
		await memoryStore.init()

		// Verify migrated state
		expect(getUserVersion(db)).toBe(MIGRATIONS.length)
		expect(hasColumn(db, "myagent_messages", "durationMs")).toBe(true)

		// Verify existing data is intact
		const row = db
			.prepare(
				"SELECT id, content, durationMs FROM myagent_messages WHERE id = ?",
			)
			.get("msg-v0") as any
		expect(row.id).toBe("msg-v0")
		expect(row.content).toBe("hello v0")
		expect(row.durationMs).toBeNull()

		// Verify newly added column can be updated
		db.exec("UPDATE myagent_messages SET durationMs = 1500 WHERE id = 'msg-v0'")
		const updatedRow = db
			.prepare("SELECT durationMs FROM myagent_messages WHERE id = ?")
			.get("msg-v0") as any
		expect(updatedRow.durationMs).toBe(1500)

		db.close()
	})

	it("safely handles existing user databases where durationMs exists but user_version is 0", async () => {
		const db = new DatabaseSync(":memory:")

		// Existing user database: already has durationMs from old naked ALTER TABLE, but user_version = 0
		db.exec(`
			CREATE TABLE myagent_messages (
				id TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL,
				content TEXT NOT NULL,
				role TEXT NOT NULL,
				type TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				resourceId TEXT,
				durationMs INTEGER
			);
		`)

		expect(getUserVersion(db)).toBe(0)
		expect(hasColumn(db, "myagent_messages", "durationMs")).toBe(true)

		// Initializing should NOT fail with "duplicate column name: durationMs"
		const memoryStore = new SQLiteMemoryStore(db)
		await expect(memoryStore.init()).resolves.not.toThrow()

		expect(getUserVersion(db)).toBe(MIGRATIONS.length)
		db.close()
	})

	it("detects database downgrades and throws an informative error", async () => {
		const db = new DatabaseSync(":memory:")
		db.exec(INIT_SQL)
		// Simulate a database created/migrated by a future version
		setUserVersion(db, MIGRATIONS.length + 5)

		const memoryStore = new SQLiteMemoryStore(db)
		await expect(memoryStore.init()).rejects.toThrow(
			/DB 由更新版本创建|newer version/,
		)

		db.close()
	})

	it("ensures INIT_SQL schema and migration sequence never drift (table_info column comparison)", async () => {
		// 1. Fresh database initialized directly with INIT_SQL
		const freshDb = new DatabaseSync(":memory:")
		const freshStore = new SQLiteMemoryStore(freshDb)
		await freshStore.init()

		// 2. Legacy database migrated step-by-step from v0
		const migratedDb = new DatabaseSync(":memory:")
		// Create legacy v0 structure (all tables without post-v0 columns)
		migratedDb.exec(`
			CREATE TABLE myagent_threads (
				id TEXT PRIMARY KEY,
				resourceId TEXT NOT NULL,
				title TEXT NOT NULL,
				metadata TEXT,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			);

			CREATE TABLE myagent_messages (
				id TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL,
				content TEXT NOT NULL,
				role TEXT NOT NULL,
				type TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				resourceId TEXT
			);

			CREATE TABLE myagent_observational_memory (
				id TEXT PRIMARY KEY,
				lookupKey TEXT NOT NULL,
				scope TEXT NOT NULL,
				resourceId TEXT,
				threadId TEXT,
				activeObservations TEXT NOT NULL,
				activeObservationsPendingUpdate TEXT,
				originType TEXT NOT NULL DEFAULT 'observation',
				config TEXT NOT NULL DEFAULT '{}',
				generationCount INTEGER NOT NULL DEFAULT 0,
				supersededBy TEXT,
				lastObservedAt TEXT,
				lastReflectionAt TEXT,
				pendingMessageTokens INTEGER NOT NULL DEFAULT 0,
				totalTokensObserved INTEGER NOT NULL DEFAULT 0,
				observationTokenCount INTEGER NOT NULL DEFAULT 0,
				isObserving INTEGER NOT NULL DEFAULT 0,
				isReflecting INTEGER NOT NULL DEFAULT 0,
				observedMessageIds TEXT,
				observedTimezone TEXT,
				bufferedObservations TEXT,
				bufferedObservationTokens INTEGER,
				bufferedMessageIds TEXT,
				bufferedReflection TEXT,
				bufferedReflectionTokens INTEGER,
				bufferedReflectionInputTokens INTEGER,
				reflectedObservationLineCount INTEGER,
				bufferedObservationChunks TEXT,
				isBufferingObservation INTEGER NOT NULL DEFAULT 0,
				isBufferingReflection INTEGER NOT NULL DEFAULT 0,
				lastBufferedAtTokens INTEGER NOT NULL DEFAULT 0,
				lastBufferedAtTime TEXT,
				metadata TEXT,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			);
		`)

		const migratedStore = new SQLiteMemoryStore(migratedDb)
		await migratedStore.init()

		// Compare all application tables between freshDb and migratedDb
		const getTables = (database: DatabaseSync) => {
			const rows = database
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
				)
				.all() as Array<{ name: string }>
			return rows.map((r) => r.name)
		}

		const freshTables = getTables(freshDb)
		const migratedTables = getTables(migratedDb)
		expect(migratedTables).toEqual(freshTables)

		// For each table, compare column names and types
		for (const tableName of freshTables) {
			const getColumns = (database: DatabaseSync) => {
				const cols = database
					.prepare(`PRAGMA table_info(${tableName})`)
					.all() as Array<{ name: string; type: string }>
				return cols.map((c) => ({
					name: c.name.toLowerCase(),
					type: c.type.toUpperCase(),
				}))
			}

			const freshCols = getColumns(freshDb)
			const migratedCols = getColumns(migratedDb)

			expect(
				migratedCols,
				`Table '${tableName}' columns should match between migrated DB and fresh INIT_SQL DB`,
			).toEqual(freshCols)
		}

		expect(getUserVersion(migratedDb)).toBe(getUserVersion(freshDb))

		freshDb.close()
		migratedDb.close()
	})
})
