import {
	MyAgentMemory,
	filterSystemReminderMessages,
	MessageList,
	formatObservationalMemory,
	runObservationStep,
	type ObservationalRecord,
	type ObservationMessage,
	type ObservationStepResult,
	type MyAgentDBMessage,
	type MemoryConfigInternal,
	type StorageThreadType,
	type WorkingMemoryTemplate,
	type MessageDeleteInput,
	type StorageListMessagesInput,
	type StorageListThreadsInput,
	type StorageListThreadsOutput,
	type StorageCloneThreadInput,
	type ObservabilityContext,
} from "../core/index.js"
import type {
	MemoryConstructorConfig,
	MemoryOptions,
	ObservationalMemoryConfig,
} from "./types.js"
import { TokenCounter } from "./token-counter.js"

export class Memory extends MyAgentMemory {
	private readonly tokenCounter: TokenCounter
	protected options?: MemoryOptions

	constructor(config?: MemoryConstructorConfig) {
		super({
			name: config?.name || "Memory",
			id: config?.id || "default-memory",
			...(config as any),
		})
		this.options = config?.options
		this.tokenCounter = this.createMemoryTokenCounter()
	}

	protected override createMemoryTokenCounter(): TokenCounter {
		return new TokenCounter()
	}

	/**
	 * Resolves the underlying memory storage domain from composite storage.
	 */
	protected async getMemoryStore() {
		if (!this.storage) {
			throw new Error("Storage is not configured on Memory instance")
		}
		const store = await this.storage.getStore("memory")
		if (!store) {
			throw new Error("Storage does not have a 'memory' domain configured")
		}
		return store
	}

	override async settled(): Promise<void> {
		return Promise.resolve()
	}

	override estimateTokens(text: string): number {
		return this.tokenCounter.estimateTokens(text)
	}

	override async getThreadById({
		threadId,
		resourceId,
	}: {
		threadId: string
		resourceId?: string
	}): Promise<StorageThreadType | null> {
		const store = await this.getMemoryStore()
		return store.getThreadById({ threadId, resourceId })
	}

	override async listThreads(
		args: StorageListThreadsInput,
	): Promise<StorageListThreadsOutput> {
		const store = await this.getMemoryStore()
		return store.listThreads(args)
	}

	override async saveThread({
		thread,
	}: {
		thread: StorageThreadType
		memoryConfig?: MemoryConfigInternal
	}): Promise<StorageThreadType> {
		const store = await this.getMemoryStore()
		// Ensure title is present to satisfy NOT NULL constraint
		const threadToSave = {
			...thread,
			title: thread.title ?? "New Thread",
		}
		return store.saveThread({ thread: threadToSave })
	}

	override async updateThread({
		id,
		title,
		metadata,
	}: {
		id: string
		title?: string
		metadata?: Record<string, unknown>
		memoryConfig?: MemoryConfigInternal
	}): Promise<StorageThreadType> {
		const store = await this.getMemoryStore()
		return store.updateThread({ id, title, metadata })
	}

	override async deleteThread(threadId: string): Promise<void> {
		const store = await this.getMemoryStore()
		await store.deleteThread({ threadId })
	}

	override async createThread({
		resourceId,
		threadId,
		title,
		metadata,
		memoryConfig,
	}: {
		resourceId: string
		threadId?: string
		title?: string
		metadata?: Record<string, unknown>
		memoryConfig?: MemoryConfigInternal
		saveThread?: boolean
	}): Promise<StorageThreadType> {
		const now = new Date()
		const thread: StorageThreadType = {
			id: threadId || this.generateId(),
			resourceId,
			title: title || "New Thread",
			metadata: metadata || {},
			createdAt: now,
			updatedAt: now,
		}
		return this.saveThread({ thread, memoryConfig })
	}

	async copyThread(args: {
		sourceThreadId?: string
		threadId?: string
		title?: string
		resourceId?: string
		newThreadId?: string
		metadata?: Record<string, unknown>
	}): Promise<any> {
		const store = await this.getMemoryStore()
		const sourceThreadId = args.sourceThreadId || args.threadId
		if (!sourceThreadId) {
			throw new Error("copyThread requires a sourceThreadId or threadId")
		}
		const copyResult = await store.copyThread({
			sourceThreadId,
			title: args.title || "Cloned Thread",
			resourceId: args.resourceId,
			newThreadId: args.newThreadId,
			metadata: args.metadata,
		})
		const threadObj = copyResult.thread || copyResult
		return {
			...copyResult,
			...threadObj,
			id: threadObj.id,
			title: threadObj.title,
			resourceId: threadObj.resourceId,
		}
	}

	async cloneThread(
		args: StorageCloneThreadInput & {
			threadId?: string
			sourceThreadId?: string
			title?: string
			resourceId?: string
		},
	): Promise<any> {
		return this.copyThread(args)
	}

	override async saveMessages(args: {
		messages: MyAgentDBMessage[]
		memoryConfig?: any
		observabilityContext?: Partial<ObservabilityContext>
	}): Promise<{
		messages: MyAgentDBMessage[]
		usage?: {
			tokens: number
		}
	}> {
		if (!args.messages || args.messages.length === 0) {
			return { messages: [] }
		}

		const store = await this.getMemoryStore()
		// Normalize and format messages using MyAgent MessageList
		const dbMessages = new MessageList({
			generateMessageId: () => this.generateId(),
		})
			.add(args.messages, "memory")
			.get.all.db()

		// Ensure all messages have resourceId if thread has one
		const firstThreadId = dbMessages[0]?.threadId
		if (firstThreadId && dbMessages.some((m) => !m.resourceId)) {
			try {
				const thread = await store.getThreadById({ threadId: firstThreadId })
				if (thread?.resourceId) {
					for (const m of dbMessages) {
						if (!m.resourceId) m.resourceId = thread.resourceId
					}
				}
			} catch {}
		}

		const result = await store.saveMessages({ messages: dbMessages })
		const textContent = dbMessages
			.map((m) => {
				const c = m.content as any
				return typeof c === "string" ? c : c?.content || ""
			})
			.join(" ")

		return {
			messages: result.messages || dbMessages,
			usage: {
				tokens: this.estimateTokens(textContent),
			},
		}
	}

	override async recall(
		args: StorageListMessagesInput & {
			threadConfig?: MemoryConfigInternal
			vectorSearchString?: string
			includeSystemReminders?: boolean
			hideSignals?: boolean | any[]
			observabilityContext?: Partial<ObservabilityContext>
		},
	): Promise<{
		messages: MyAgentDBMessage[]
		usage?: {
			tokens: number
		}
		total: number
		page: number
		perPage: number | false
		hasMore: boolean
	}> {
		const store = await this.getMemoryStore()
		const perPage = args.perPage === false ? false : (args.perPage ?? 100)
		const page = args.page ?? 0
		const shouldReverse = !args.orderBy && perPage !== false
		const targetThreadId = Array.isArray(args.threadId)
			? args.threadId[0]
			: args.threadId

		const paginatedResult = await store.listMessages({
			threadId: targetThreadId,
			resourceId: args.resourceId,
			page,
			perPage,
			orderBy:
				args.orderBy ||
				(shouldReverse ? { field: "createdAt", direction: "DESC" } : undefined),
			filter: args.filter,
		})

		const rawMessages = shouldReverse
			? [...paginatedResult.messages].reverse()
			: paginatedResult.messages

		// Normalize DB messages for UI / Agent
		const normalized = new MessageList({
			threadId: targetThreadId,
			resourceId: args.resourceId,
		})
			.add(rawMessages, "memory")
			.get.all.db()

		// Filter system reminders / transient signals if requested
		const filteredMessages = filterSystemReminderMessages(
			normalized,
			args.includeSystemReminders,
			args.hideSignals,
		)

		// Preserve durationMs from raw DB messages (which MessageList strips)
		const durationById = new Map<string, number>()
		for (const rm of rawMessages) {
			if ((rm as any).durationMs != null) {
				durationById.set(rm.id, (rm as any).durationMs)
			}
		}
		if (durationById.size > 0) {
			for (const fm of filteredMessages) {
				const d = durationById.get(fm.id)
				if (d != null) {
					;(fm as any).durationMs = d
				}
			}
		}

		const textContent = filteredMessages
			.map((m) => {
				const c = m.content as any
				return typeof c === "string" ? c : c?.content || ""
			})
			.join(" ")

		return {
			messages: filteredMessages,
			usage: {
				tokens: this.estimateTokens(textContent),
			},
			total: paginatedResult.total ?? filteredMessages.length,
			page: paginatedResult.page ?? page,
			perPage: paginatedResult.perPage ?? perPage,
			hasMore: paginatedResult.hasMore ?? false,
		}
	}

	override async getSystemMessage({
		threadId,
		resourceId,
	}: {
		threadId: string
		resourceId?: string
		memoryConfig?: MemoryConfigInternal
	}): Promise<string | null> {
		try {
			const record = await this.getObservationalRecord(threadId, resourceId)
			return formatObservationalMemory(record?.activeObservations ?? null)
		} catch {
			return null
		}
	}

	/**
	 * Reads the current observation log for a thread.
	 *
	 * Returns `null` rather than throwing when storage is missing or the table
	 * is empty: observation is an optimisation on top of the conversation, so a
	 * failure here must never break the turn that is already in flight.
	 */
	async getObservationalRecord(
		threadId: string,
		resourceId?: string,
	): Promise<ObservationalRecord | null> {
		try {
			const store = await this.getMemoryStore()
			if (typeof (store as any).getObservationalMemory !== "function") {
				return null
			}
			// Normalised identically to the write path below. The store builds its
			// lookup key as `${threadId}:${resourceId}`: reading with "" while
			// writing with null produces two different keys for the same thread, so
			// the record is written and then never found again.
			return await (store as any).getObservationalMemory(
				threadId,
				resourceId ?? "",
			)
		} catch {
			return null
		}
	}

	/**
	 * Runs one Observer/Reflector pass and persists the result.
	 *
	 * Never throws: a failed summarisation leaves the previous log in place and
	 * reports `null`, so the caller can fall back to the plain token window.
	 */
	async observe(args: {
		threadId: string
		resourceId?: string
		messages: ObservationMessage[]
		pendingTokens: number
		requestContext?: any
		foldedMessageIds?: string[] | Set<string>
	}): Promise<ObservationStepResult | null> {
		const config = this.resolveObservationalConfig()
		if (!config) return null
		try {
			const store = await this.getMemoryStore()
			const record = await this.getObservationalRecord(
				args.threadId,
				args.resourceId,
			)

			// Claim the generation before spending a model call, not after: a loser
			// that ran the model first would pay for an observation it then
			// discards, and two concurrent turns would both pay.
			//
			// The key must use the same normalisation as the read and write paths.
			// Passing the raw `undefined` here builds "thread:undefined", which
			// matches no row, so the claim always fails and observation silently
			// stops working after the first success.
			const resourceKey = args.resourceId ?? ""
			const currentGeneration = (record as any)?.generationCount ?? 0
			if (
				record &&
				typeof (store as any).claimObservationalGeneration === "function"
			) {
				const claimed = await (store as any).claimObservationalGeneration(
					args.threadId,
					resourceKey,
					currentGeneration,
					currentGeneration + 1,
				)
				if (!claimed) return null
			}

			const step = await runObservationStep({
				config,
				record,
				messages: args.messages,
				pendingTokens: args.pendingTokens,
				counter: this.tokenCounter,
				requestContext: args.requestContext,
				foldedMessageIds: args.foldedMessageIds,
			})
			if (step.kind === "none") return step

			if (
				typeof (store as any).insertObservationalMemoryRecord !== "function"
			) {
				return step
			}
			const resourceId = args.resourceId ?? ""
			await (store as any).insertObservationalMemoryRecord({
				id: (record as any)?.id,
				lookupKey: `${args.threadId || ""}:${resourceId}`,
				scope: config.scope || "thread",
				threadId: args.threadId,
				resourceId: resourceId || null,
				activeObservations: step.activeObservations,
				observationTokenCount: this.tokenCounter.estimateTokens(
					step.activeObservations,
				),
				observedMessageIds: step.observedMessageIds,
				bufferedObservations: step.bufferedObservations ?? null,
				bufferedObservationTokens: step.bufferedObservationTokens ?? 0,
				generationCount: currentGeneration + 1,
				pendingMessageTokens: args.pendingTokens,
				totalTokensObserved:
					((record as any)?.totalTokensObserved ?? 0) + args.pendingTokens,
				lastObservedAt: new Date(),
				...(step.kind === "reflected" ? { lastReflectionAt: new Date() } : {}),
			})
			return step
		} catch {
			return null
		}
	}

	/**
	 * Normalises `options.observationalMemory`, which accepts a boolean, a full
	 * config, or the older Mastra-shaped options object.
	 */
	resolveObservationalConfig(): ObservationalMemoryConfig | null {
		const raw: any = (this.options as any)?.observationalMemory
		if (!raw) return null
		if (raw === true) return { enabled: true }
		if (raw.enabled === false) return null
		return raw as ObservationalMemoryConfig
	}

	// Working memory base methods required by MyAgentMemory
	override async getWorkingMemory(_opts: {
		threadId: string
		resourceId?: string
		memoryConfig?: MemoryConfigInternal
	}): Promise<string | null> {
		return null
	}

	override async getWorkingMemoryTemplate(_opts: {
		memoryConfig?: MemoryConfigInternal
	}): Promise<WorkingMemoryTemplate | null> {
		return null
	}

	override async updateWorkingMemory(_opts: {
		threadId: string
		resourceId?: string
		workingMemory: string
		memoryConfig?: MemoryConfigInternal
		observabilityContext?: Partial<ObservabilityContext>
	}): Promise<void> {
		return Promise.resolve()
	}

	override async __experimental_updateWorkingMemoryVNext(_opts: {
		threadId: string
		resourceId?: string
		workingMemory: string
		searchString?: string
		memoryConfig?: MemoryConfigInternal
	}): Promise<{ success: boolean; reason: string }> {
		return { success: true, reason: "" }
	}

	override async deleteMessages(
		messageIds: MessageDeleteInput,
		_observabilityContext?: Partial<ObservabilityContext>,
	): Promise<void> {
		const store = await this.getMemoryStore()
		if (Array.isArray(messageIds)) {
			const ids = messageIds
				.map((m: any) => (typeof m === "string" ? m : m?.id))
				.filter(Boolean) as string[]
			await store.deleteMessages(ids)
		} else if (
			typeof messageIds === "object" &&
			messageIds &&
			"messageIds" in messageIds &&
			Array.isArray((messageIds as any).messageIds)
		) {
			const ids = (messageIds as any).messageIds
				.map((m: any) => (typeof m === "string" ? m : m?.id))
				.filter(Boolean) as string[]
			await store.deleteMessages(ids)
		}
	}
}
