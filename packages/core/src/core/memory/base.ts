import { randomUUID } from "node:crypto"
import { CoreBase } from "../base/index.js"
import { MessageHistory } from "./processors/index.js"
import type {
	StorageThreadType,
	MemoryConfigInternal,
	StorageListThreadsInput,
	StorageListThreadsOutput,
	StorageListMessagesInput,
	WorkingMemoryTemplate,
	MessageDeleteInput,
	ObservabilityContext,
} from "./types.js"
import type { MyAgentDBMessage } from "../agent/types.js"

export class MyAgentMemory extends CoreBase {
	id: string
	name: string
	protected _storage?: any
	protected options?: Record<string, unknown>
	threadConfig: Record<string, any>
	hasExplicitLastMessages?: boolean
	vector?: any
	embedder?: any
	embedderOptions?: any

	constructor(config?: {
		id?: string
		name?: string
		storage?: any
		options?: Record<string, unknown>
		[key: string]: unknown
	}) {
		super({
			component: "MEMORY",
			name: config?.name || "Memory",
		})
		this.id = config?.id || config?.name || "default-memory"
		this.name = config?.name || "Memory"
		this._storage = config?.storage
		this.options = config?.options
		this.hasExplicitLastMessages = config?.options?.lastMessages !== undefined
		this.threadConfig = {
			lastMessages: 10,
			semanticRecall: false,
			generateTitle: false,
			workingMemory: { enabled: false },
			...(config?.options || {}),
		}
	}

	get storage(): any {
		return this._storage
	}

	set storage(val: any) {
		this._storage = val
	}

	__registerMyAgent(_agent: any): void {}

	get hasOwnStorage(): boolean {
		return Boolean(this._storage)
	}

	setStorage(storage: any): void {
		this._storage = storage
	}

	generateId(): string {
		return randomUUID()
	}

	async settled(): Promise<void> {
		return Promise.resolve()
	}

	estimateTokens(text: string): number {
		return Math.ceil(text.length / 4)
	}

	protected createMemoryTokenCounter(): any {
		return {
			estimateTokens: (text: string) => Math.ceil(text.length / 4),
		}
	}

	getMergedThreadConfig(config?: any): Record<string, any> {
		return {
			lastMessages: 10,
			semanticRecall: false,
			generateTitle: false,
			workingMemory: { enabled: false },
			...this.threadConfig,
			...(config || {}),
		}
	}

	getConfig(): Record<string, any> {
		return {
			options: { ...this.threadConfig },
		}
	}

	listTools(_config?: any): Record<string, any> {
		return {}
	}

	async supportsAtomicWorkingMemoryMerge(): Promise<boolean> {
		return false
	}

	async mergeWorkingMemory(_opts?: any): Promise<void> {
		throw new Error(
			`Atomic working memory merge is not supported by ${this.constructor.name}`,
		)
	}

	async updateThreadResourceId(_opts?: any): Promise<void> {
		throw new Error(
			"Thread resource transfer is not supported by this memory implementation.",
		)
	}

	async getInputProcessors(
		configuredProcessors: any[] = [],
		_context?: any,
	): Promise<any[]> {
		if (!this.storage) {
			return []
		}
		const processors = [...configuredProcessors]
		const hasHistory = processors.some(
			(p: any) => p?.id === "message-history" || p?.name === "MessageHistory",
		)
		if (!hasHistory) {
			const memoryStore =
				typeof this.storage?.getStore === "function"
					? await this.storage.getStore("memory")
					: this.storage
			if (memoryStore) {
				const lastMessages =
					this.options?.lastMessages !== undefined
						? this.options.lastMessages
						: (this.threadConfig?.lastMessages ?? 50)
				processors.push(
					new MessageHistory({
						storage: memoryStore,
						lastMessages: lastMessages as any,
					}),
				)
			}
		}
		return processors
	}

	async getOutputProcessors(
		configuredProcessors: any[] = [],
		_context?: any,
	): Promise<any[]> {
		if (!this.storage) {
			return []
		}
		const processors = [...configuredProcessors]
		const hasHistory = processors.some(
			(p: any) => p?.id === "message-history" || p?.name === "MessageHistory",
		)
		if (!hasHistory) {
			const memoryStore =
				typeof this.storage?.getStore === "function"
					? await this.storage.getStore("memory")
					: this.storage
			if (memoryStore) {
				const lastMessages =
					this.options?.lastMessages !== undefined
						? this.options.lastMessages
						: (this.threadConfig?.lastMessages ?? 50)
				processors.push(
					new MessageHistory({
						storage: memoryStore,
						lastMessages: lastMessages as any,
					}),
				)
			}
		}
		return processors
	}

	async getErrorProcessors(
		_configuredProcessors: any[] = [],
		_context?: any,
	): Promise<any[]> {
		return []
	}

	async getThreadById(args: {
		threadId: string
		resourceId?: string
	}): Promise<StorageThreadType | null> {
		if (this.storage) {
			const store = await this.storage.getStore("memory")
			if (store?.getThreadById) {
				return store.getThreadById(args)
			}
		}
		return null
	}

	async listThreads(
		args: StorageListThreadsInput,
	): Promise<StorageListThreadsOutput> {
		if (this.storage) {
			const store = await this.storage.getStore("memory")
			if (store?.listThreads) {
				return store.listThreads(args)
			}
		}
		return { threads: [] }
	}

	async saveThread(args: {
		thread: StorageThreadType
		memoryConfig?: MemoryConfigInternal
	}): Promise<StorageThreadType> {
		if (this.storage) {
			const store = await this.storage.getStore("memory")
			if (store?.saveThread) {
				return store.saveThread(args)
			}
		}
		return args.thread
	}

	async updateThread(_args: {
		id: string
		title?: string
		metadata?: Record<string, unknown>
		memoryConfig?: MemoryConfigInternal
	}): Promise<StorageThreadType> {
		throw new Error("updateThread not implemented")
	}

	async deleteThread(_threadId: string): Promise<void> {}

	async createThread(_args: {
		resourceId: string
		threadId?: string
		title?: string
		metadata?: Record<string, unknown>
		memoryConfig?: MemoryConfigInternal
		saveThread?: boolean
	}): Promise<StorageThreadType> {
		throw new Error("createThread not implemented")
	}

	async copyThread(_args: {
		sourceThreadId?: string
		threadId?: string
		title?: string
		resourceId?: string
		newThreadId?: string
		metadata?: Record<string, unknown>
	}): Promise<any> {
		throw new Error("copyThread not implemented")
	}

	async cloneThread(_args: any): Promise<any> {
		throw new Error("cloneThread not implemented")
	}

	async saveMessages(args: {
		messages: MyAgentDBMessage[]
		memoryConfig?: any
		observabilityContext?: Partial<ObservabilityContext>
	}): Promise<{
		messages: MyAgentDBMessage[]
		usage?: { tokens: number }
	}> {
		if (this.storage) {
			const store = await this.storage.getStore("memory")
			if (store?.saveMessages) {
				const result = await store.saveMessages({ messages: args.messages })
				return {
					messages: result.messages || args.messages,
					usage: { tokens: this.estimateTokens(JSON.stringify(args.messages)) },
				}
			}
		}
		return { messages: args.messages }
	}

	async recall(
		args: StorageListMessagesInput & {
			threadConfig?: MemoryConfigInternal
			vectorSearchString?: string
			includeSystemReminders?: boolean
			hideSignals?: boolean | any[]
			observabilityContext?: Partial<ObservabilityContext>
		},
	): Promise<{
		messages: MyAgentDBMessage[]
		usage?: { tokens: number }
		total: number
		page: number
		perPage: number | false
		hasMore: boolean
	}> {
		if (this.storage) {
			const store = await this.storage.getStore("memory")
			if (store?.listMessages) {
				const result = await store.listMessages(args)
				return {
					messages: result.messages,
					total: result.total,
					page: result.page,
					perPage: result.perPage,
					hasMore: result.hasMore,
					usage: { tokens: 0 },
				}
			}
		}
		return {
			messages: [],
			total: 0,
			page: 0,
			perPage: false,
			hasMore: false,
		}
	}

	async getSystemMessage(_args: {
		threadId: string
		resourceId?: string
		memoryConfig?: MemoryConfigInternal
	}): Promise<string | null> {
		return null
	}

	async getWorkingMemory(_opts: {
		threadId: string
		resourceId?: string
		memoryConfig?: MemoryConfigInternal
	}): Promise<string | null> {
		return null
	}

	async getWorkingMemoryTemplate(_opts: {
		memoryConfig?: MemoryConfigInternal
	}): Promise<WorkingMemoryTemplate | null> {
		return null
	}

	async updateWorkingMemory(_opts: {
		threadId: string
		resourceId?: string
		workingMemory: string
		memoryConfig?: MemoryConfigInternal
		observabilityContext?: Partial<ObservabilityContext>
	}): Promise<void> {}

	async __experimental_updateWorkingMemoryVNext(_opts: {
		threadId: string
		resourceId?: string
		workingMemory: string
		searchString?: string
		memoryConfig?: MemoryConfigInternal
	}): Promise<{ success: boolean; reason: string }> {
		return { success: true, reason: "" }
	}

	async deleteMessages(
		messageIds: MessageDeleteInput,
		_observabilityContext?: Partial<ObservabilityContext>,
	): Promise<void> {
		if (this.storage) {
			const store = await this.storage.getStore("memory")
			if (store?.deleteMessages) {
				const ids = Array.isArray(messageIds) ? messageIds : [messageIds]
				await store.deleteMessages(ids)
			}
		}
	}
}

export { MyAgentMemory as BaseMemory }
