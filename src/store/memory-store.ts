import crypto from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { INIT_SQL } from "./schema.js"
import { runMigrations, getUserVersion } from "./migrations.js"
import type {
	StorageThreadType,
	StorageListThreadsInput,
	StorageListThreadsOutput,
	StorageListMessagesInput,
	StorageListMessagesOutput,
	ObservationalMemoryRecord,
} from "./types.js"
import type { MyAgentDBMessage } from "../core/index.js"

export class SQLiteMemoryStore {
	private db: DatabaseSync

	constructor(db: DatabaseSync) {
		this.db = db
	}

	async init(): Promise<void> {
		// 1. Initialize schema & indexes (full current schema)
		this.db.exec(INIT_SQL)

		// 2. Versioned migrations via PRAGMA user_version
		runMigrations(this.db)
	}

	getUserVersion(): number {
		return getUserVersion(this.db)
	}

	// ==================== Thread Operations ====================

	async getThreadById({
		threadId,
		resourceId,
	}: {
		threadId: string
		resourceId?: string
	}): Promise<StorageThreadType | null> {
		let sql = `SELECT id, resourceId, title, metadata, createdAt, updatedAt FROM myagent_threads WHERE id = ?`
		const params: any[] = [threadId]
		if (resourceId !== undefined) {
			sql += ` AND (resourceId = ? OR resourceId IS NULL)`
			params.push(resourceId)
		}
		const row = this.db.prepare(sql).get(...params) as any
		if (!row) return null
		return this.mapThreadRow(row)
	}

	async listThreads(
		args: StorageListThreadsInput,
	): Promise<StorageListThreadsOutput> {
		const page = args.page ?? 0
		const perPageInput = args.perPage
		const perPage = perPageInput === false ? false : (perPageInput ?? 100)
		const orderBy = args.orderBy || { field: "createdAt", direction: "DESC" }

		const whereClauses: string[] = []
		const params: any[] = []

		const targetResourceId = args.filter?.resourceId || (args as any).resourceId
		if (targetResourceId) {
			whereClauses.push("resourceId = ?")
			params.push(targetResourceId)
		}

		if (args.filter?.metadata && Object.keys(args.filter.metadata).length > 0) {
			for (const [key, value] of Object.entries(args.filter.metadata)) {
				// Sanitise key for JSON path (alphanumeric and underscore)
				const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "")
				if (value === null) {
					whereClauses.push(`json_extract(metadata, '$.${safeKey}') IS NULL`)
				} else if (typeof value === "boolean") {
					whereClauses.push(`json_extract(metadata, '$.${safeKey}') = ?`)
					params.push(value ? 1 : 0)
				} else if (typeof value === "number" || typeof value === "string") {
					whereClauses.push(`json_extract(metadata, '$.${safeKey}') = ?`)
					params.push(value)
				}
			}
		}

		const whereSql =
			whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""
		const countSql = `SELECT COUNT(*) as count FROM myagent_threads ${whereSql}`
		const countRow = this.db.prepare(countSql).get(...params) as any
		const total = Number(countRow?.count ?? 0)

		if (total === 0) {
			return {
				threads: [],
				total: 0,
				page,
				perPage,
				hasMore: false,
			}
		}

		// Safe field whitelist for orderBy
		const allowedFields = ["createdAt", "updatedAt", "title", "id"]
		const field = allowedFields.includes(orderBy.field)
			? orderBy.field
			: "createdAt"
		const direction = orderBy.direction === "ASC" ? "ASC" : "DESC"

		let selectSql = `SELECT id, resourceId, title, metadata, createdAt, updatedAt FROM myagent_threads ${whereSql} ORDER BY "${field}" ${direction}, rowid ${direction}`
		const queryParams = [...params]

		if (perPage !== false) {
			selectSql += ` LIMIT ? OFFSET ?`
			queryParams.push(perPage, page * perPage)
		}

		const rows = this.db.prepare(selectSql).all(...queryParams) as any[]
		const threads = rows.map((r) => this.mapThreadRow(r))

		return {
			threads,
			total,
			page,
			perPage,
			hasMore:
				perPage === false ? false : page * perPage + threads.length < total,
		}
	}

	async saveThread({
		thread,
	}: {
		thread: StorageThreadType
	}): Promise<StorageThreadType> {
		const createdAt =
			thread.createdAt instanceof Date
				? thread.createdAt.toISOString()
				: new Date().toISOString()
		const updatedAt =
			thread.updatedAt instanceof Date
				? thread.updatedAt.toISOString()
				: new Date().toISOString()
		const metadataStr = thread.metadata ? JSON.stringify(thread.metadata) : null

		const sql = `
			INSERT INTO myagent_threads (id, resourceId, title, metadata, createdAt, updatedAt)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				resourceId = excluded.resourceId,
				title = excluded.title,
				metadata = excluded.metadata,
				updatedAt = excluded.updatedAt
		`
		this.db
			.prepare(sql)
			.run(
				thread.id,
				thread.resourceId,
				thread.title ?? "New Thread",
				metadataStr,
				createdAt,
				updatedAt,
			)

		return thread
	}

	async updateThread({
		id,
		title,
		metadata,
	}: {
		id: string
		title?: string
		metadata?: Record<string, unknown>
	}): Promise<StorageThreadType> {
		const existing = await this.getThreadById({ threadId: id })
		if (!existing) {
			throw new Error(`Thread ${id} not found`)
		}

		const updatedTitle = title ?? existing.title
		const updatedMetadata = {
			...(existing.metadata || {}),
			...(metadata || {}),
		}
		const now = new Date()

		const sql = `
			UPDATE myagent_threads
			SET title = ?, metadata = ?, updatedAt = ?
			WHERE id = ?
		`
		this.db
			.prepare(sql)
			.run(updatedTitle, JSON.stringify(updatedMetadata), now.toISOString(), id)

		return {
			...existing,
			title: updatedTitle,
			metadata: updatedMetadata,
			updatedAt: now,
		}
	}

	async deleteThread({ threadId }: { threadId: string }): Promise<void> {
		this.db.exec("BEGIN TRANSACTION")
		try {
			this.db
				.prepare("DELETE FROM myagent_messages WHERE thread_id = ?")
				.run(threadId)
			this.db.prepare("DELETE FROM myagent_threads WHERE id = ?").run(threadId)
			this.db.exec("COMMIT")
		} catch (e) {
			this.db.exec("ROLLBACK")
			throw e
		}
	}

	async copyThread(args: {
		sourceThreadId?: string
		threadId?: string
		title?: string
		resourceId?: string
		newThreadId?: string
		metadata?: Record<string, unknown>
		options?: any
	}): Promise<{
		thread: StorageThreadType
		messageIdMap?: Record<string, string>
	}> {
		const sourceThreadId = args.sourceThreadId || args.threadId
		if (!sourceThreadId) {
			throw new Error("copyThread requires a sourceThreadId or threadId")
		}

		const sourceThread = await this.getThreadById({ threadId: sourceThreadId })
		if (!sourceThread) {
			throw new Error(`Source thread with id ${sourceThreadId} not found`)
		}

		const newThreadId = args.newThreadId || crypto.randomUUID()
		const now = new Date()

		// Read source messages
		let msgSql = `SELECT id, content, role, type, createdAt, resourceId FROM myagent_messages WHERE thread_id = ?`
		const msgParams: any[] = [sourceThreadId]

		if (args.options?.messageFilter?.startDate) {
			msgSql += ` AND createdAt >= ?`
			const sd = args.options.messageFilter.startDate
			msgParams.push(sd instanceof Date ? sd.toISOString() : sd)
		}
		if (args.options?.messageFilter?.endDate) {
			msgSql += ` AND createdAt <= ?`
			const ed = args.options.messageFilter.endDate
			msgParams.push(ed instanceof Date ? ed.toISOString() : ed)
		}
		if (args.options?.messageFilter?.messageIds?.length > 0) {
			const placeholders = args.options.messageFilter.messageIds
				.map(() => "?")
				.join(",")
			msgSql += ` AND id IN (${placeholders})`
			msgParams.push(...args.options.messageFilter.messageIds)
		}
		msgSql += ` ORDER BY createdAt ASC`

		if (args.options?.messageLimit && args.options.messageLimit > 0) {
			msgSql = `SELECT * FROM (${msgSql.replace("ORDER BY createdAt ASC", "ORDER BY createdAt DESC")} LIMIT ?) ORDER BY createdAt ASC`
			msgParams.push(args.options.messageLimit)
		}

		const sourceMessages = this.db.prepare(msgSql).all(...msgParams) as any[]
		const lastMessageId =
			sourceMessages.length > 0
				? sourceMessages[sourceMessages.length - 1].id
				: undefined

		const newThread: StorageThreadType = {
			id: newThreadId,
			resourceId: args.resourceId || sourceThread.resourceId,
			title:
				args.title ||
				(sourceThread.title
					? `Clone of ${sourceThread.title}`
					: "Cloned Thread"),
			metadata: {
				...(args.metadata || {}),
				clone: {
					sourceThreadId,
					clonedAt: now,
					...(lastMessageId ? { lastMessageId } : {}),
				},
			},
			createdAt: now,
			updatedAt: now,
		}

		const messageIdMap: Record<string, string> = {}

		this.db.exec("BEGIN TRANSACTION")
		try {
			// Insert new thread
			this.db
				.prepare(
					`INSERT INTO myagent_threads (id, resourceId, title, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run(
					newThread.id,
					newThread.resourceId,
					newThread.title,
					newThread.metadata ? JSON.stringify(newThread.metadata) : null,
					now.toISOString(),
					now.toISOString(),
				)

			// Copy messages
			const insertMsgStmt = this.db.prepare(`
				INSERT INTO myagent_messages (id, thread_id, content, role, type, createdAt, resourceId)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`)

			for (const sm of sourceMessages) {
				const newMsgId = crypto.randomUUID()
				messageIdMap[sm.id] = newMsgId
				insertMsgStmt.run(
					newMsgId,
					newThreadId,
					sm.content,
					sm.role,
					sm.type,
					sm.createdAt,
					args.resourceId || sm.resourceId || newThread.resourceId,
				)
			}

			this.db.exec("COMMIT")
		} catch (e) {
			this.db.exec("ROLLBACK")
			throw e
		}

		return { thread: newThread, messageIdMap }
	}

	// ==================== Message Operations ====================

	async saveMessages(args: {
		messages: MyAgentDBMessage[]
	}): Promise<{ messages: MyAgentDBMessage[] }> {
		if (!args.messages || args.messages.length === 0) {
			return { messages: [] }
		}

		const threadId = args.messages[0]?.threadId
		const now = new Date().toISOString()

		const insertStmt = this.db.prepare(`
			INSERT INTO myagent_messages (id, thread_id, content, role, type, createdAt, resourceId, durationMs)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				thread_id = excluded.thread_id,
				content = excluded.content,
				role = excluded.role,
				type = excluded.type,
				resourceId = excluded.resourceId,
				durationMs = COALESCE(excluded.durationMs, myagent_messages.durationMs)
		`)

		this.db.exec("BEGIN TRANSACTION")
		try {
			for (const msg of args.messages) {
				const id = msg.id || crypto.randomUUID()
				const tId = msg.threadId || threadId || ""
				const contentStr =
					typeof msg.content === "object"
						? JSON.stringify(msg.content)
						: String(msg.content ?? "")
				const role = msg.role || "user"
				const type = msg.type || "v2"
				const createdAt =
					msg.createdAt instanceof Date
						? msg.createdAt.toISOString()
						: msg.createdAt || now
				const resourceId = msg.resourceId || null
				const durationMs =
					(msg as any).durationMs != null
						? Number((msg as any).durationMs)
						: null

				insertStmt.run(
					id,
					tId,
					contentStr,
					role,
					type,
					createdAt,
					resourceId,
					durationMs,
				)
			}

			if (threadId) {
				this.db
					.prepare(`UPDATE myagent_threads SET updatedAt = ? WHERE id = ?`)
					.run(now, threadId)
			}

			this.db.exec("COMMIT")
		} catch (e) {
			this.db.exec("ROLLBACK")
			throw e
		}

		return { messages: args.messages }
	}

	async listMessages(
		args: StorageListMessagesInput & { limit?: number },
	): Promise<StorageListMessagesOutput> {
		const threadIds = Array.isArray(args.threadId)
			? args.threadId
			: [args.threadId]
		if (threadIds.length === 0 || threadIds.some((id) => !id || !id.trim())) {
			throw new Error(
				"threadId must be a non-empty string or array of non-empty strings",
			)
		}

		const page = args.page ?? 0
		const limit = args.limit
		const perPageInput = args.perPage ?? limit
		const perPage = perPageInput === false ? false : (perPageInput ?? false)

		// When limit is provided without explicit orderBy, fetch the newest limit messages oldest-first
		const isLimitDefaultOrder =
			limit !== undefined && args.orderBy === undefined
		const orderBy = isLimitDefaultOrder
			? { field: "createdAt", direction: "DESC" as const }
			: args.orderBy || { field: "createdAt", direction: "ASC" as const }

		const placeholders = threadIds.map(() => "?").join(",")
		const conditions: string[] = [`thread_id IN (${placeholders})`]
		const params: any[] = [...threadIds]

		if (args.resourceId) {
			conditions.push(`(resourceId = ? OR resourceId IS NULL)`)
			params.push(args.resourceId)
		}

		if (args.filter?.dateRange?.start) {
			const op = args.filter.dateRange.startExclusive ? ">" : ">="
			conditions.push(`createdAt ${op} ?`)
			const sd = args.filter.dateRange.start
			params.push(sd instanceof Date ? sd.toISOString() : sd)
		}

		if (args.filter?.dateRange?.end) {
			const op = args.filter.dateRange.endExclusive ? "<" : "<="
			conditions.push(`createdAt ${op} ?`)
			const ed = args.filter.dateRange.end
			params.push(ed instanceof Date ? ed.toISOString() : ed)
		}

		const whereSql = `WHERE ${conditions.join(" AND ")}`
		const countSql = `SELECT COUNT(*) as count FROM myagent_messages ${whereSql}`
		const countRow = this.db.prepare(countSql).get(...params) as any
		const total = Number(countRow?.count ?? 0)

		if (total === 0) {
			return {
				messages: [],
				total: 0,
				page,
				perPage,
				hasMore: false,
			}
		}

		const allowedFields = ["createdAt", "id"]
		const field = allowedFields.includes(orderBy.field)
			? orderBy.field
			: "createdAt"
		const direction = orderBy.direction === "DESC" ? "DESC" : "ASC"

		let selectSql = `
			SELECT id, thread_id, content, role, type, createdAt, resourceId, durationMs
			FROM myagent_messages
			${whereSql}
			ORDER BY "${field}" ${direction}
		`
		const queryParams = [...params]

		if (perPage !== false) {
			selectSql += ` LIMIT ? OFFSET ?`
			queryParams.push(perPage, page * perPage)
		}

		const rows = this.db.prepare(selectSql).all(...queryParams) as any[]
		let messages: MyAgentDBMessage[] = rows.map((r) => this.mapMessageRow(r))

		if (isLimitDefaultOrder) {
			messages = messages.reverse()
		}

		return {
			messages,
			total,
			page,
			perPage,
			hasMore:
				perPage === false ? false : page * perPage + messages.length < total,
		}
	}

	async deleteMessages(messageIds: string[]): Promise<void> {
		if (!messageIds || messageIds.length === 0) return

		const placeholders = messageIds.map(() => "?").join(",")
		const selectThreadSql = `SELECT DISTINCT thread_id FROM myagent_messages WHERE id IN (${placeholders})`
		const rows = this.db.prepare(selectThreadSql).all(...messageIds) as any[]
		const threadIds = rows.map((r) => r.thread_id).filter(Boolean)

		this.db.exec("BEGIN TRANSACTION")
		try {
			this.db
				.prepare(`DELETE FROM myagent_messages WHERE id IN (${placeholders})`)
				.run(...messageIds)

			if (threadIds.length > 0) {
				const now = new Date().toISOString()
				const tPlaceholders = threadIds.map(() => "?").join(",")
				this.db
					.prepare(
						`UPDATE myagent_threads SET updatedAt = ? WHERE id IN (${tPlaceholders})`,
					)
					.run(now, ...threadIds)
			}

			this.db.exec("COMMIT")
		} catch (e) {
			this.db.exec("ROLLBACK")
			throw e
		}
	}

	// ==================== Observational Memory ====================

	private getOMKey(threadId?: string, resourceId?: string): string {
		return `${threadId || ""}:${resourceId || ""}`
	}

	async getObservationalMemory(
		threadId: string,
		resourceId: string,
	): Promise<ObservationalMemoryRecord | null> {
		const lookupKey = this.getOMKey(threadId, resourceId)
		const sql = `
			SELECT * FROM myagent_observational_memory 
			WHERE lookupKey = ? OR (threadId = ? AND resourceId = ?)
			ORDER BY updatedAt DESC
			LIMIT 1
		`
		const row = this.db.prepare(sql).get(lookupKey, threadId, resourceId) as any
		if (!row) return null
		return this.mapOMRow(row)
	}

	async insertObservationalMemoryRecord(
		record: Partial<ObservationalMemoryRecord> & {
			lookupKey: string
			scope: string
			activeObservations: string
		},
	): Promise<void> {
		const now = new Date().toISOString()
		const id = record.id || crypto.randomUUID()

		const sql = `
			INSERT INTO myagent_observational_memory (
				id, lookupKey, scope, resourceId, threadId, activeObservations,
				activeObservationsPendingUpdate, originType, config, generationCount,
				supersededBy, lastObservedAt, lastReflectionAt, pendingMessageTokens,
				totalTokensObserved, observationTokenCount, isObserving, isReflecting,
				observedMessageIds, observedTimezone, bufferedObservations,
				bufferedObservationTokens, bufferedMessageIds, bufferedReflection,
				bufferedReflectionTokens, bufferedReflectionInputTokens,
				reflectedObservationLineCount, bufferedObservationChunks,
				isBufferingObservation, isBufferingReflection, lastBufferedAtTokens,
				lastBufferedAtTime, metadata, createdAt, updatedAt
			) VALUES (
				?, ?, ?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?,
				?, ?, ?,
				?, ?, ?, ?
			)
			ON CONFLICT(id) DO UPDATE SET
				lookupKey = excluded.lookupKey,
				activeObservations = excluded.activeObservations,
				updatedAt = excluded.updatedAt
		`

		this.db
			.prepare(sql)
			.run(
				id,
				record.lookupKey,
				record.scope,
				record.resourceId ?? null,
				record.threadId ?? null,
				record.activeObservations,
				record.activeObservationsPendingUpdate ?? null,
				record.originType || "observation",
				record.config || "{}",
				record.generationCount ?? 0,
				record.supersededBy ?? null,
				record.lastObservedAt ? String(record.lastObservedAt) : null,
				record.lastReflectionAt ? String(record.lastReflectionAt) : null,
				record.pendingMessageTokens ?? 0,
				record.totalTokensObserved ?? 0,
				record.observationTokenCount ?? 0,
				record.isObserving ? 1 : 0,
				record.isReflecting ? 1 : 0,
				record.observedMessageIds
					? JSON.stringify(record.observedMessageIds)
					: null,
				record.observedTimezone ?? null,
				record.bufferedObservations ?? null,
				record.bufferedObservationTokens ?? 0,
				record.bufferedMessageIds
					? JSON.stringify(record.bufferedMessageIds)
					: null,
				record.bufferedReflection ?? null,
				record.bufferedReflectionTokens ?? 0,
				record.bufferedReflectionInputTokens ?? 0,
				record.reflectedObservationLineCount ?? 0,
				record.bufferedObservationChunks
					? JSON.stringify(record.bufferedObservationChunks)
					: null,
				record.isBufferingObservation ? 1 : 0,
				record.isBufferingReflection ? 1 : 0,
				record.lastBufferedAtTokens ?? 0,
				record.lastBufferedAtTime ? String(record.lastBufferedAtTime) : null,
				record.metadata ? JSON.stringify(record.metadata) : null,
				record.createdAt ? String(record.createdAt) : now,
				now,
			)
	}

	async updateActiveObservations(
		threadId: string,
		resourceId: string,
		observations: string,
	): Promise<void> {
		const lookupKey = this.getOMKey(threadId, resourceId)
		const now = new Date().toISOString()
		const sql = `
			UPDATE myagent_observational_memory
			SET activeObservations = ?, updatedAt = ?
			WHERE lookupKey = ? OR (threadId = ? AND resourceId = ?)
		`
		this.db.prepare(sql).run(observations, now, lookupKey, threadId, resourceId)
	}

	async clearObservationalMemory(
		threadId: string,
		resourceId: string,
	): Promise<void> {
		const lookupKey = this.getOMKey(threadId, resourceId)
		const now = new Date().toISOString()
		const sql = `
			UPDATE myagent_observational_memory
			SET activeObservations = '', updatedAt = ?
			WHERE lookupKey = ? OR (threadId = ? AND resourceId = ?)
		`
		this.db.prepare(sql).run(now, lookupKey, threadId, resourceId)
	}

	// ==================== Helper Mappers ====================

	private mapThreadRow(row: any): StorageThreadType {
		let metadata: any = null
		if (row.metadata) {
			try {
				metadata =
					typeof row.metadata === "string"
						? JSON.parse(row.metadata)
						: row.metadata
			} catch {}
		}
		return {
			id: row.id,
			resourceId: row.resourceId,
			title: row.title,
			metadata,
			createdAt: new Date(row.createdAt),
			updatedAt: new Date(row.updatedAt),
		}
	}

	private mapMessageRow(row: any): MyAgentDBMessage {
		let content: any = row.content
		if (typeof row.content === "string") {
			try {
				content = JSON.parse(row.content)
			} catch {}
		}
		const attachments =
			content && typeof content === "object" ? content.attachments : undefined
		return {
			id: row.id,
			threadId: row.thread_id,
			role: row.role,
			type: row.type,
			content,
			...(attachments ? { attachments } : {}),
			createdAt: new Date(row.createdAt),
			resourceId: row.resourceId || undefined,
			durationMs: row.durationMs != null ? Number(row.durationMs) : undefined,
		} as MyAgentDBMessage
	}

	async updateMessageDuration(args: {
		messageId?: string
		threadId?: string
		durationMs: number
	}): Promise<void> {
		if (args.durationMs == null) return
		const duration = Number(args.durationMs)
		if (args.messageId) {
			this.db
				.prepare("UPDATE myagent_messages SET durationMs = ? WHERE id = ?")
				.run(duration, args.messageId)
		} else if (args.threadId) {
			this.db
				.prepare(
					`UPDATE myagent_messages
					SET durationMs = ?
					WHERE id = (
						SELECT id FROM myagent_messages
						WHERE thread_id = ? AND role = 'assistant'
						ORDER BY createdAt DESC LIMIT 1
					)`,
				)
				.run(duration, args.threadId)
		}
	}

	private mapOMRow(row: any): ObservationalMemoryRecord {
		let metadata: any = null
		if (row.metadata) {
			try {
				metadata = JSON.parse(row.metadata)
			} catch {}
		}
		return {
			...row,
			isObserving: Boolean(row.isObserving),
			isReflecting: Boolean(row.isReflecting),
			isBufferingObservation: Boolean(row.isBufferingObservation),
			isBufferingReflection: Boolean(row.isBufferingReflection),
			metadata,
			createdAt: new Date(row.createdAt),
			updatedAt: new Date(row.updatedAt),
		}
	}
}
