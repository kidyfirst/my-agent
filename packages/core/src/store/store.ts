import { MyAgentBase } from "../core/index.js"
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { SQLiteMemoryStore } from "./memory-store.js"
import type { SQLiteStoreConfig } from "./types.js"

export class SQLiteStore extends MyAgentBase {
	readonly id: string
	private _db: DatabaseSync
	private memoryStore: SQLiteMemoryStore
	private isClosed = false

	constructor(config: SQLiteStoreConfig = {}) {
		super({ component: "STORAGE", name: "SQLiteStore" })
		this.id = config.id || "sqlite-storage"

		if (config.db) {
			this._db = config.db
		} else {
			const rawUrl = config.url || ":memory:"
			let dbPath = rawUrl
			if (dbPath.startsWith("file:")) {
				dbPath = dbPath.slice(5)
			}
			if (dbPath === ":memory:" || dbPath === "" || dbPath === "::memory:") {
				this._db = new DatabaseSync(":memory:")
			} else {
				const dir = path.dirname(dbPath)
				if (dir && !fs.existsSync(dir)) {
					try {
						fs.mkdirSync(dir, { recursive: true })
					} catch {}
				}
				this._db = new DatabaseSync(dbPath)
			}
		}

		// Configure WAL mode for maximum performance and concurrency on file databases
		try {
			this._db.exec("PRAGMA journal_mode = WAL;")
			this._db.exec("PRAGMA synchronous = NORMAL;")
		} catch {}

		this.memoryStore = new SQLiteMemoryStore(this._db)
	}

	get db(): DatabaseSync {
		return this._db
	}

	async init(): Promise<void> {
		await this.memoryStore.init()
	}

	getUserVersion(): number {
		return this.memoryStore.getUserVersion()
	}

	async getStore(domain: string): Promise<any> {
		if (domain === "memory") {
			return this.memoryStore
		}
		return undefined
	}

	async close(): Promise<void> {
		if (!this.isClosed) {
			try {
				this._db.close()
			} catch {}
			this.isClosed = true
		}
	}
}
