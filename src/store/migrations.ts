import type { DatabaseSync } from "node:sqlite"

/**
 * Checks whether a given column exists on a SQLite table.
 */
export function hasColumn(
	db: DatabaseSync,
	tableName: string,
	columnName: string,
): boolean {
	const sanitizedTable = tableName.replace(/[^a-zA-Z0-9_]/g, "")
	const columns = db
		.prepare(`PRAGMA table_info(${sanitizedTable})`)
		.all() as Array<{ name: string }>
	return columns.some(
		(col) => col.name.toLowerCase() === columnName.toLowerCase(),
	)
}

/**
 * Idempotently adds a column to a table if it does not already exist.
 * Avoids duplicate column errors when migrating existing databases that already have the column.
 */
export function addColumnIfMissing(
	db: DatabaseSync,
	tableName: string,
	columnName: string,
	columnType: string,
): void {
	if (!hasColumn(db, tableName, columnName)) {
		const sanitizedTable = tableName.replace(/[^a-zA-Z0-9_]/g, "")
		const sanitizedCol = columnName.replace(/[^a-zA-Z0-9_]/g, "")
		db.exec(
			`ALTER TABLE ${sanitizedTable} ADD COLUMN ${sanitizedCol} ${columnType}`,
		)
	}
}

/**
 * Get the current PRAGMA user_version from SQLite DB header.
 */
export function getUserVersion(db: DatabaseSync): number {
	const row = db.prepare("PRAGMA user_version").get() as any
	return (row?.user_version as number) ?? 0
}

/**
 * Set the PRAGMA user_version in the SQLite DB header.
 */
export function setUserVersion(db: DatabaseSync, version: number): void {
	if (!Number.isInteger(version) || version < 0) {
		throw new Error(`Invalid user_version: ${version}`)
	}
	db.exec(`PRAGMA user_version = ${version}`)
}

/**
 * Ordered list of schema migrations.
 * Each migration corresponds to advancing user_version by 1.
 * Future migrations: append-only, never mutate past entries.
 */
export const MIGRATIONS: Array<(db: DatabaseSync) => void> = [
	/* → 1 */ (db) => {
		addColumnIfMissing(db, "myagent_messages", "durationMs", "INTEGER")
	},
	// 未来每列/每表一条，只增不改
]

/**
 * Run all pending migrations sequentially and update PRAGMA user_version.
 * Throws if the database version is higher than supported (downgrade detected).
 */
export function runMigrations(db: DatabaseSync): void {
	let v = getUserVersion(db)
	if (v > MIGRATIONS.length) {
		throw new Error(
			`DB 由更新版本创建 (user_version v${v} > supported v${MIGRATIONS.length})`,
		)
	}
	for (; v < MIGRATIONS.length; v++) {
		MIGRATIONS[v](db)
		setUserVersion(db, v + 1)
	}
}
