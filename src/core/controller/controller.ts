import { randomUUID } from "node:crypto"
import * as os from "node:os"
import * as path from "node:path"
import {
	sessionRecordingManager,
	createReplayTools,
	endSessionReplay,
	runtimeMetadata,
	type RecordedRuntime,
} from "../recorder/index.js"
import { RequestContext } from "../context/index.js"
import { logger } from "../logger/index.js"
import { toModelTool } from "../tools/ai-tool.js"
import type { Agent, MyAgentMessagePart } from "../agent/index.js"
import {
	defaultGraphRegistry,
	defaultGraphRunner,
	buildMessageParts,
	DEFAULT_EXECUTION_MODE,
	type GraphExecutionContext,
} from "../graph/index.js"

export type PermissionPolicy = "allow" | "deny" | "ask"
export type ToolCategory =
	| "read"
	| "write"
	| "command"
	| "browser"
	| "network"
	| "other"
	| (string & {})

export interface TokenUsage {
	promptTokens: number
	completionTokens: number
	totalTokens: number
}

export interface IntervalHandler {
	id: string
	intervalMs: number
	handler: () => void | Promise<void>
}

export interface AvailableModel {
	id: string
	name?: string
	provider?: string
	[key: string]: any
}

import type { GraphTopologyMetadata } from "../graph/index.js"

export interface HarnessMode {
	id: string
	name: string
	defaultModelId?: string
	metadata?: Record<string, unknown>
	topology?: GraphTopologyMetadata
}

export interface HarnessSubagent {
	id: string
	name: string
	description?: string
	instructions?: string
	model?: any
	tools?: any
	[key: string]: any
}

export interface HarnessThread {
	id: string
	title?: string
	resourceId?: string
	createdAt?: Date | string
	updatedAt?: Date | string
	metadata?: Record<string, unknown>
}

export interface HarnessDisplayState {
	currentStep?: number
	totalSteps?: number
	[key: string]: any
}

export type HarnessRequestContext = any

export type HarnessEvent = any

export interface HarnessConfig<TState = any> {
	id?: string
	agent?: Agent
	defaultModeId?: string
	resourceId?: string
	storage?: any
	memory?: any
	stateSchema?: any
	subagents?: HarnessSubagent[]
	modes?: HarnessMode[]
	intervalHandlers?: IntervalHandler[]
	heartbeatHandlers?: IntervalHandler[]
	workspace?: any
	toolCategoryResolver?: (toolName: string) => ToolCategory
	initialState?: Partial<TState>
	modelUseCountProvider?: () => Record<string, number>
	modelUseCountTracker?: (modelId: string) => void
	threadLock?: {
		acquire: (threadId: string) => Promise<boolean | (() => void)>
		release: (threadId: string) => Promise<void>
	}
	[key: string]: unknown
}

export const MODEL_PERSISTENCE_VERSION = "1"
export const MODEL_PERSISTENCE_VERSION_KEY = "model_persistence_version"

export class AgentController<TState = any> {
	id: string
	agent?: Agent
	defaultModeId: string
	resourceId?: string
	storage?: any
	memory?: any
	stateSchema?: any
	subagents: HarnessSubagent[]
	modes: HarnessMode[]
	intervalHandlers: IntervalHandler[]
	workspace?: any
	toolCategoryResolver?: (toolName: string) => ToolCategory
	initialState?: Partial<TState>
	modelUseCountProvider?: () => Record<string, number>
	modelUseCountTracker?: (modelId: string) => void
	threadLock?: {
		acquire: (threadId: string) => Promise<boolean | (() => void)>
		release: (threadId: string) => Promise<void>
	}

	private _intervals: Map<string, NodeJS.Timeout> = new Map()
	private _sessions: Map<string, Session<TState>> = new Map()

	constructor(config: HarnessConfig<TState>) {
		this.id = config.id || "myagent-code"
		this.agent = config.agent
		this.defaultModeId = config.defaultModeId || DEFAULT_EXECUTION_MODE
		this.resourceId = config.resourceId
		this.storage = config.storage
		this.memory = config.memory
		this.stateSchema = config.stateSchema
		this.subagents = config.subagents || []
		this.modes = config.modes || []
		this.intervalHandlers =
			config.intervalHandlers || config.heartbeatHandlers || []
		this.workspace = config.workspace
		this.toolCategoryResolver = config.toolCategoryResolver
		this.initialState = config.initialState
		this.modelUseCountProvider = config.modelUseCountProvider
		this.modelUseCountTracker = config.modelUseCountTracker
		this.threadLock = config.threadLock
	}

	async init(): Promise<void> {
		if (typeof this.storage?.init === "function") {
			await this.storage.init()
		}
		if (typeof this.memory?.init === "function") {
			await this.memory.init()
		}
		this.startIntervals()
	}

	startIntervals(): void {
		this.stopIntervals()
		for (const handler of this.intervalHandlers) {
			if (handler.intervalMs > 0 && typeof handler.handler === "function") {
				const timer = setInterval(() => {
					try {
						handler.handler()
					} catch (e) {
						console.error(`Interval handler ${handler.id} error:`, e)
					}
				}, handler.intervalMs)
				this._intervals.set(handler.id, timer)
			}
		}
	}

	stopIntervals(): void {
		for (const timer of this._intervals.values()) {
			clearInterval(timer)
		}
		this._intervals.clear()
	}

	destroy(): void {
		this.stopIntervals()
	}

	async createSession(options?: {
		resourceId?: string
	}): Promise<Session<TState>> {
		const resourceId =
			options?.resourceId || this.resourceId || "default-resource"
		const session = new Session<TState>({
			controller: this,
			resourceId,
			initialState: this.initialState,
			defaultModeId: this.defaultModeId,
		})
		await session.init()
		this._sessions.set(session.id, session)
		return session
	}

	getSessionByResource(resourceId: string): Session<TState> | undefined {
		for (const s of this._sessions.values()) {
			if (s.resourceId === resourceId) return s
		}
		return undefined
	}

	listModes(): HarnessMode[] {
		return [...this.modes]
	}

	async listAvailableModels(): Promise<AvailableModel[]> {
		return []
	}

	async readThreadMetadataValue(opts: {
		threadId: string
		key: string
	}): Promise<unknown> {
		if (!this.storage) return undefined
		if (typeof this.storage.init === "function") {
			await this.storage.init()
		}
		const store =
			typeof this.storage.getStore === "function"
				? await this.storage.getStore("memory")
				: this.storage
		if (typeof store?.getThreadById === "function") {
			const thread = await store.getThreadById({ threadId: opts.threadId })
			return thread?.metadata?.[opts.key]
		}
		return undefined
	}

	async getMemoryStore(): Promise<any> {
		if (!this.storage) return null
		if (typeof this.storage.init === "function") {
			await this.storage.init()
		}
		return typeof this.storage.getStore === "function"
			? await this.storage.getStore("memory")
			: this.storage
	}

	async writeThreadMetadataValues(opts: {
		threadId: string
		values: Record<string, unknown>
	}): Promise<void> {
		if (!this.storage) return
		if (typeof this.storage.init === "function") {
			await this.storage.init()
		}
		const store =
			typeof this.storage.getStore === "function"
				? await this.storage.getStore("memory")
				: this.storage
		if (
			typeof store?.getThreadById === "function" &&
			typeof store?.saveThread === "function"
		) {
			let thread = await store.getThreadById({ threadId: opts.threadId })
			if (!thread) {
				thread = {
					id: opts.threadId,
					resourceId: this.resourceId || "default-resource",
					createdAt: new Date(),
					updatedAt: new Date(),
					metadata: {},
				}
			}
			thread.metadata = { ...(thread.metadata || {}), ...opts.values }
			await store.saveThread({ thread })
		}
	}

	async writeThreadMetadataValue(opts: {
		threadId: string
		key: string
		value: unknown
	}): Promise<void> {
		return this.writeThreadMetadataValues({
			threadId: opts.threadId,
			values: { [opts.key]: opts.value },
		})
	}

	async loadOMProgress(_target?: unknown): Promise<unknown> {
		return {}
	}

	getWorkspaceById(workspaceId: string): any {
		if (typeof this.workspace === "function") {
			return this.workspace({
				requestContext: new RequestContext(),
				myagent: this,
			})
		}
		return undefined
	}
}

export interface SessionConfig<TState = any> {
	controller: AgentController<TState>
	resourceId: string
	initialState?: Partial<TState>
	defaultModeId?: string
}

export class Session<TState = any> {
	id: string
	controller: AgentController<TState>
	resourceId: string

	private _state: Record<string, any>
	private _modeId: string
	private _modelId: string = ""
	private _currentThreadId: string = ""
	private _subscribers: Set<(event: HarnessEvent) => void> = new Set()
	private _categoryPolicies: Record<string, PermissionPolicy> = {}
	private _toolPolicies: Record<string, PermissionPolicy> = {}
	private _grantedCategories: Set<string> = new Set()
	private _grantedTools: Set<string> = new Set()
	private _tokenUsage: TokenUsage = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	}
	private _displayState: HarnessDisplayState = {}
	private _isRunning: boolean = false
	private _activeAbortController: AbortController | null = null
	private _pendingApprovals: Map<
		string,
		(decision: "approve" | "decline") => void
	> = new Map()
	private _pendingSuspensions: Map<string, (data: any) => void> = new Map()

	om = {
		observer: {
			switchModel: async (_opts: any) => {},
		},
		reflector: {
			switchModel: async (_opts: any) => {},
		},
	}

	constructor(config: SessionConfig<TState>) {
		this.id = randomUUID()
		this.controller = config.controller
		this.resourceId = config.resourceId
		this._state = { ...(config.initialState || {}) }
		this._modeId = config.defaultModeId || DEFAULT_EXECUTION_MODE
	}

	async init(): Promise<void> {
		if (!this._currentThreadId) {
			try {
				const threads = await this.thread.list()
				if (threads && threads.length > 0) {
					this._currentThreadId = threads[0].id
				}
			} catch (e) {
				console.warn("Failed to initialize active thread:", e)
			}
		}
	}

	async getMemoryStore(): Promise<any> {
		if (!this.controller.storage) return null
		if (typeof this.controller.storage.init === "function") {
			await this.controller.storage.init()
		}
		return typeof this.controller.storage.getStore === "function"
			? await this.controller.storage.getStore("memory")
			: this.controller.storage
	}

	get identity() {
		return {
			getId: () => this.id,
		}
	}

	get state() {
		return {
			get: () => ({ ...this._state }),
			set: async (patch: Partial<TState>) => {
				this._state = { ...this._state, ...patch }
				return this._state
			},
		}
	}

	get mode() {
		return {
			get: () => this._modeId,
			switch: async (opts: { modeId: string }) => {
				this._modeId = opts.modeId
				this.emit({ type: "mode_changed", modeId: opts.modeId })
				return this._modeId
			},
		}
	}

	get graph() {
		return {
			getTopology: (modeId?: string) =>
				defaultGraphRegistry.getTopology(modeId || this._modeId),
			listTopologies: () => defaultGraphRegistry.listTopologies(),
		}
	}

	get model() {
		return {
			get: () => this._modelId,
			switch: async (modelId: string | { modelId: string }) => {
				const id = typeof modelId === "string" ? modelId : modelId.modelId
				this._modelId = id
				this._state.currentModelId = id
				this.controller.modelUseCountTracker?.(id)
				this.emit({ type: "model_changed", modelId: id })
				return id
			},
		}
	}

	get thread() {
		return {
			getId: () => this._currentThreadId,
			create: async (opts?: {
				title?: string
				metadata?: Record<string, unknown>
			}) => {
				const threadId = randomUUID()
				const title = opts?.title || "New Session"
				const threadMetadata = {
					modelId: (opts?.metadata?.modelId as string) || this._modelId,
					modeId: (opts?.metadata?.modeId as string) || this._modeId,
					thinkingLevel:
						(opts?.metadata?.thinkingLevel as string) ||
						this._state.thinkingLevel ||
						"off",
					permissionMode:
						(opts?.metadata?.permissionMode as string) ||
						this._state.permissionMode ||
						(this._state.yolo ? "auto-approve" : "default"),
					...(opts?.metadata || {}),
				}
				if (opts?.metadata?.modelId) {
					this._modelId = opts.metadata.modelId as string
					this._state.currentModelId = opts.metadata.modelId as string
				}
				if (opts?.metadata?.modeId) {
					this._modeId = opts.metadata.modeId as string
				}
				if (opts?.metadata?.thinkingLevel) {
					this._state.thinkingLevel = opts.metadata.thinkingLevel as string
				}
				if (opts?.metadata?.permissionMode) {
					this._state.permissionMode = opts.metadata.permissionMode as string
					this._state.yolo = opts.metadata.permissionMode === "auto-approve"
				}
				const threadObj = {
					id: threadId,
					title,
					resourceId: this.resourceId,
					createdAt: new Date(),
					updatedAt: new Date(),
					metadata: threadMetadata,
				}
				const store = await this.getMemoryStore()
				if (store?.saveThread) {
					await store.saveThread({ thread: threadObj })
				}
				this._currentThreadId = threadId
				this.emit({ type: "thread_created", thread: threadObj })
				this.emit({ type: "thread_changed", threadId })
				return threadObj
			},
			switch: async (opts: { threadId: string }) => {
				this._currentThreadId = opts.threadId
				const store = await this.getMemoryStore()
				if (store?.getThreadById) {
					const thread = await store.getThreadById({ threadId: opts.threadId })
					if (thread?.metadata) {
						const meta = thread.metadata as Record<string, any>
						if (meta.modelId) {
							this._modelId = meta.modelId
							this._state.currentModelId = meta.modelId
							this.emit({ type: "model_changed", modelId: meta.modelId })
						}
						if (meta.modeId) {
							this._modeId = meta.modeId
							this.emit({ type: "mode_changed", modeId: meta.modeId })
						}
						if (meta.thinkingLevel) {
							this._state.thinkingLevel = meta.thinkingLevel
						}
						if (meta.permissionMode) {
							this._state.permissionMode = meta.permissionMode
							const isAuto = meta.permissionMode === "auto-approve"
							this._state.yolo = isAuto
							const policies = isAuto
								? {
										read: "allow",
										edit: "allow",
										execute: "allow",
										mcp: "allow",
									}
								: meta.permissionMode === "read-only"
									? {
											read: "allow",
											edit: "deny",
											execute: "deny",
											mcp: "deny",
										}
									: {
											read: "allow",
											edit: "ask",
											execute: "ask",
											mcp: "ask",
										}
							for (const [category, policy] of Object.entries(policies)) {
								this._categoryPolicies[category as ToolCategory] =
									policy as PermissionPolicy
							}
						}
					}
				}
				this.emit({ type: "thread_changed", threadId: opts.threadId })
				return opts.threadId
			},
			rename: async (opts: { threadId?: string; title: string }) => {
				const threadId = opts.threadId || this._currentThreadId
				const store = await this.getMemoryStore()
				if (store?.getThreadById && store?.saveThread) {
					const thread = await store.getThreadById({ threadId })
					if (thread) {
						thread.title = opts.title
						await store.saveThread({ thread })
						this.emit({
							type: "thread_title_updated",
							threadId,
							title: opts.title,
						})
					}
				}
			},
			delete: async (opts: { threadId: string }) => {
				const store = await this.getMemoryStore()
				if (store?.deleteThread) {
					// The store API takes an options object — passing the raw id made
					// `thread_id` undefined and the DELETE threw, so nothing was ever
					// removed (the UI then re-listed the thread after refreshing).
					await store.deleteThread({ threadId: opts.threadId })
				}
				if (this._currentThreadId === opts.threadId) {
					this._currentThreadId = ""
				}
				this.emit({ type: "thread_deleted", threadId: opts.threadId })
			},
			list: async () => {
				const store = await this.getMemoryStore()
				if (store?.listThreads) {
					const res = await store.listThreads({
						resourceId: this.resourceId,
						filter: { resourceId: this.resourceId },
						orderBy: { field: "updatedAt", direction: "DESC" },
					})
					return Array.isArray(res) ? res : (res?.threads ?? [])
				}
				return []
			},
			listMessages: async (opts?: { threadId?: string; limit?: number }) => {
				const threadId = opts?.threadId || this._currentThreadId
				if (!threadId) return []
				const store = await this.getMemoryStore()
				if (store?.listMessages) {
					const res = await store.listMessages({
						threadId,
						limit: opts?.limit,
						perPage: opts?.limit ?? false,
						orderBy: { field: "createdAt", direction: "ASC" },
					})
					return res?.messages ?? []
				}
				return []
			},
		}
	}

	get permissions() {
		return {
			setForCategory: ({
				category,
				policy,
			}: {
				category: ToolCategory
				policy: PermissionPolicy
			}) => {
				this._categoryPolicies[category] = policy
			},
			setForTool: ({
				toolName,
				policy,
			}: {
				toolName: string
				policy: PermissionPolicy
			}) => {
				this._toolPolicies[toolName] = policy
			},
			getRules: () => ({
				categories: { ...this._categoryPolicies },
				tools: { ...this._toolPolicies },
			}),
		}
	}

	/** UI-level permission mode; falls back to yolo when the picker never wrote one. */
	getPermissionMode(): string {
		return (
			(this._state.permissionMode as string) ||
			(this._state.yolo ? "auto-approve" : "default")
		)
	}

	/**
	 * Everything a recording needs to reproduce a run: which model, which
	 * execution mode, and the effective permission gate (including the session
	 * grants that already answered "always allow" prompts).
	 */
	snapshotRuntime(): RecordedRuntime {
		const stateModel = this._state.currentModelId
		return {
			modelId:
				this._modelId ||
				(typeof stateModel === "string" ? stateModel : "") ||
				undefined,
			modeId: this._modeId,
			thinkingLevel: this._state.thinkingLevel as string | undefined,
			permissionMode: this.getPermissionMode(),
			permissionRules: {
				categories: { ...this._categoryPolicies },
				tools: { ...this._toolPolicies },
			},
			grants: {
				categories: Array.from(this._grantedCategories),
				tools: Array.from(this._grantedTools),
			},
		}
	}

	/**
	 * Point the live session at a recorded runtime.
	 *
	 * `clearPolicies` is used when a replay starts: a custom tool policy left
	 * over from the current session would otherwise silently change the
	 * approval behaviour the recording captured.
	 */
	applyRuntime(
		runtime: RecordedRuntime,
		options: {
			clearPolicies?: boolean
			applyGrants?: boolean
		} = {},
	): void {
		if (runtime.modeId && runtime.modeId !== this._modeId) {
			this._modeId = runtime.modeId
			this.emit({ type: "mode_changed", modeId: runtime.modeId })
		}

		if (runtime.modelId && runtime.modelId !== this._modelId) {
			this._modelId = runtime.modelId
			this._state.currentModelId = runtime.modelId
			this.emit({ type: "model_changed", modelId: runtime.modelId })
		}

		if (runtime.thinkingLevel) {
			this._state.thinkingLevel = runtime.thinkingLevel
		}

		if (runtime.permissionMode) {
			this._state.permissionMode = runtime.permissionMode
			this._state.yolo = runtime.permissionMode === "auto-approve"
		}

		if (options.clearPolicies) {
			this._categoryPolicies = {}
			this._toolPolicies = {}
		}
		for (const [category, policy] of Object.entries(
			runtime.permissionRules?.categories ?? {},
		)) {
			if (!policy) continue
			this._categoryPolicies[category] = policy as PermissionPolicy
		}
		for (const [toolName, policy] of Object.entries(
			runtime.permissionRules?.tools ?? {},
		)) {
			if (!policy) continue
			this._toolPolicies[toolName] = policy as PermissionPolicy
		}

		if (options.applyGrants) {
			this._grantedCategories = new Set(runtime.grants?.categories ?? [])
			this._grantedTools = new Set(runtime.grants?.tools ?? [])
		}

		this.emit({
			type: "permission_mode_changed",
			permissionMode: this.getPermissionMode(),
			rules: this.permissions.getRules(),
		})
	}

	grantCategory(category: ToolCategory): void {
		this._grantedCategories.add(category)
	}

	grantTool(toolName: string): void {
		this._grantedTools.add(toolName)
	}

	getGrants(): { categories: string[]; tools: string[] } {
		return {
			categories: Array.from(this._grantedCategories),
			tools: Array.from(this._grantedTools),
		}
	}

	get run() {
		return {
			isRunning: () => this._isRunning,
		}
	}

	get stream() {
		return {
			isOpen: () => this._isRunning,
			isActive: () => this._isRunning,
		}
	}

	subscribe(listener: (event: HarnessEvent) => void): () => void {
		this._subscribers.add(listener)
		return () => {
			this._subscribers.delete(listener)
		}
	}

	emit(event: HarnessEvent): void {
		for (const sub of this._subscribers) {
			try {
				sub(event)
			} catch (e) {
				console.error("[Session] event subscriber error:", e)
			}
		}
	}

	async abort(): Promise<void> {
		if (this._activeAbortController) {
			this._activeAbortController.abort()
			this._activeAbortController = null
		}
		this._isRunning = false
	}

	async steer(_options: any): Promise<void> {}

	async followUp(_options: any): Promise<void> {}

	respondToToolApproval(opts: {
		decision?: "approve" | "decline" | "always_allow_category" | string
		toolCallId: string
		requestContext?: any
		declineContext?: any
	}): void {
		const resolver = this._pendingApprovals.get(opts.toolCallId)
		if (resolver) {
			const dec = opts.decision === "decline" ? "decline" : "approve"
			resolver(dec)
			this._pendingApprovals.delete(opts.toolCallId)
		}
	}

	respondToToolSuspension(opts: { resumeData: any }): void {
		for (const [key, resolver] of this._pendingSuspensions.entries()) {
			resolver(opts.resumeData)
			this._pendingSuspensions.delete(key)
		}
	}

	getTokenUsage(): TokenUsage {
		return { ...this._tokenUsage }
	}

	get displayState() {
		return {
			get: () => ({ ...this._displayState }),
		}
	}

	async sendMessage(options: {
		content: any
		files?: any[]
		requestContext?: RequestContext
		[key: string]: unknown
	}): Promise<void> {
		if (!this._currentThreadId) {
			await this.thread.create({ title: "New Session" })
		}
		const threadId = this._currentThreadId
		const resourceId = this.resourceId

		let releaseLock: (() => void) | null = null
		if (this.controller.threadLock?.acquire) {
			try {
				const lockRes = await this.controller.threadLock.acquire(threadId)
				if (typeof lockRes === "function") {
					releaseLock = lockRes
				}
			} catch {}
		}

		this._isRunning = true
		const abortController = new AbortController()
		this._activeAbortController = abortController

		const startTime = Date.now()
		const runId = randomUUID()
		let recorder: any = null
		let replayModelUsed: any = null

		const runState = this.state.get() as Record<string, any>
		logger.info("run", "sendMessage", {
			runId,
			threadId,
			resourceId,
			modeId: this._modeId,
			modelId: runState?.currentModelId,
			permissionMode: runState?.permissionMode,
			contentLength:
				typeof options.content === "string"
					? options.content.length
					: undefined,
			files: Array.isArray(options.files) ? options.files.length : 0,
		})

		try {
			// 1. Build and persist user message
			const userMessageId = randomUUID()
			const userText =
				typeof options.content === "string"
					? options.content
					: (options.content as any)?.text ||
						(options.content ? JSON.stringify(options.content) : "")

			const userParts: any[] = []
			if (userText) {
				userParts.push({ type: "text", text: userText })
			}

			const incomingFiles = Array.isArray(options.files)
				? options.files
				: Array.isArray(options.images)
					? options.images
					: []

			for (const f of incomingFiles) {
				if (!f) continue
				const mime = String(f.mimeType || f.mediaType || "image/png")
				const name = String(f.name || f.filename || "image.png")
				const isImg =
					f.type === "image" ||
					mime.startsWith("image/") ||
					/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)
				if (isImg) {
					userParts.push({
						type: "image",
						mimeType: mime,
						mediaType: mime,
						data: f.data || "",
						name,
						filename: name,
						url:
							f.url ||
							(f.data
								? f.data.startsWith("data:")
									? f.data
									: `data:${mime};base64,${f.data}`
								: undefined),
					})
				} else {
					userParts.push({
						type: "file",
						mimeType: mime || "text/plain",
						mediaType: mime || "text/plain",
						data: f.data || "",
						name,
						filename: name,
					})
				}
			}

			if (userParts.length === 0) {
				userParts.push({ type: "text", text: "" })
			}

			const userDbMessage = {
				id: userMessageId,
				role: "user",
				content: {
					format: 2,
					parts: userParts,
					content: userText,
					attachments: incomingFiles.length > 0 ? incomingFiles : undefined,
				},
				threadId,
				resourceId,
				createdAt: new Date(),
				attachments: incomingFiles.length > 0 ? incomingFiles : undefined,
			}

			const store = await this.getMemoryStore()
			if (store?.saveMessages) {
				await store.saveMessages({ messages: [userDbMessage] })
			}

			// Emit user message events
			this.emit({
				type: "message_start",
				id: userMessageId,
				message: userDbMessage,
			})
			this.emit({
				type: "message_end",
				id: userMessageId,
				message: userDbMessage,
			})

			// 2. Prepare request context
			const requestContext = options.requestContext || new RequestContext()
			if (!requestContext.get("controller")) {
				requestContext.set("controller", this.controller)
			}
			if (!requestContext.get("harness")) {
				requestContext.set("harness", this.controller)
			}
			requestContext.set("session", this)
			requestContext.set("threadId", threadId)
			requestContext.set("resourceId", resourceId)

			// 3. Emit agent start
			this.emit({
				type: "agent_start",
				id: runId,
				runId,
				threadId,
			})

			// 4. Resolve instructions, model, tools from controller's agent
			const agent = this.controller.agent
			if (!agent) {
				throw new Error("No agent configured on AgentController")
			}

			const instructions = await agent.getInstructions({ requestContext })
			// A replay is driven entirely by the recording, but resolving the real
			// model still runs first and can throw — the recorded model may belong
			// to a provider this machine is no longer signed in to. Never let that
			// kill a replay whose model is never going to be called.
			const preloadedReplayModel = threadId
				? sessionRecordingManager.getReplayModel(threadId)
				: null
			let model: any
			try {
				model = await agent.getModel({ requestContext })
			} catch (err) {
				if (!preloadedReplayModel) throw err
				console.warn(
					"[replay] recorded model is unavailable, falling back to the offline replay model:",
					err,
				)
				model = preloadedReplayModel
			}
			const rawTools = await agent.listTools({ requestContext })
			logger.debug("run", "model resolved", {
				runId,
				threadId,
				modelId:
					(model as any)?.modelId ??
					(model as any)?.provider ??
					(this.state.get() as any)?.currentModelId,
				tools: Object.keys(rawTools || {}).length,
				instructionsLength: instructions?.length ?? 0,
			})

			// Build executable tools with approval gate and lifecycle events
			const executableTools: Record<string, any> = {}
			const executedTools: Array<{
				id: string
				name: string
				args: any
				result?: any
				isError?: boolean
			}> = []

			for (const [toolName, tool] of Object.entries(rawTools || {})) {
				if (!tool) continue
				const origTool = tool as any
				const toolExecute = async (args: any, execContext: any) => {
					const toolCallId = execContext?.toolCallId || randomUUID()
					const existingTool = executedTools.find((t) => t.id === toolCallId)
					if (!existingTool) {
						executedTools.push({
							id: toolCallId,
							name: toolName,
							args,
						})
					}
					const category =
						this.controller.toolCategoryResolver?.(toolName) || "other"
					const policy =
						this._toolPolicies[toolName] ||
						this._categoryPolicies[category] ||
						"ask"
					const isYolo = Boolean(this._state.yolo)
					const isGranted =
						this._grantedCategories.has(category) ||
						this._grantedTools.has(toolName)

					if (!isYolo && !isGranted && policy === "deny") {
						throw new Error(
							`Tool execution for '${toolName}' denied by permission policy.`,
						)
					}

					if (!isYolo && !isGranted && policy === "ask") {
						// Register the resolver before emitting: a subscriber may
						// answer synchronously, and the answer would otherwise be
						// dropped and the run would hang.
						const decisionPromise = new Promise<"approve" | "decline">(
							(resolve) => {
								this._pendingApprovals.set(toolCallId, resolve)
							},
						)
						this.emit({
							type: "tool_approval_required",
							toolCallId,
							toolName,
							args,
							category,
						})

						const decision = await decisionPromise

						if (decision === "decline") {
							return "Tool execution was declined by user."
						}
					}

					this.emit({
						type: "tool_start",
						toolName,
						toolCallId,
						args,
					})

					try {
						const toolContext = { requestContext, toolCallId }
						let result: any
						if (typeof origTool.execute === "function") {
							// The execution context travels as the second argument only.
							// Folding it into `args` leaked an extra `context` key into the
							// model-supplied arguments, which MCP servers reject against
							// their own input schema: LangSearch answered
							// `Unrecognized key: "context"`.
							result = await origTool.execute(args, toolContext)
						} else {
							result = { success: true }
						}

						const current = executedTools.find((t) => t.id === toolCallId)
						if (current) {
							current.result = result
							current.isError = false
						}

						this.emit({
							type: "tool_end",
							toolName,
							toolCallId,
							result,
							isError: false,
						})
						return result
					} catch (toolErr: any) {
						const current = executedTools.find((t) => t.id === toolCallId)
						if (current) {
							current.result = toolErr?.message || String(toolErr)
							current.isError = true
						}

						this.emit({
							type: "tool_end",
							toolName,
							toolCallId,
							result: toolErr?.message || String(toolErr),
							isError: true,
						})
						throw toolErr
					}
				}

				// AI SDK v6 requires `inputSchema`; the legacy `parameters` key is
				// silently dropped and produces an invalid `type: null` schema.
				executableTools[toolName] = toModelTool(origTool, toolExecute)
			}

			// 5. Recall message history from store
			const historyRes = await store.listMessages({
				threadId,
				orderBy: { field: "createdAt", direction: "ASC" },
			})
			const historyMessages: any[] = historyRes?.messages || []

			// Convert history messages to AI SDK CoreMessage format.
			// Two kinds of rows must not be replayed as chat turns:
			//   - `signal` rows (UI events, never user speech)
			//   - turns that only carry tool invocations, which yield empty text
			// A run of empty `content: ""` messages deforms the conversation and
			// makes models stop trusting their (real) tool list.
			const modelIdStr = String(
				(model as any)?.modelId || (model as any)?.id || "",
			).toLowerCase()
			const canVision =
				!modelIdStr ||
				((!modelIdStr.includes("deepseek") ||
					modelIdStr.includes("flash") ||
					modelIdStr.includes("vl")) &&
					!modelIdStr.includes("o3-mini") &&
					!modelIdStr.includes("o1-mini") &&
					!(modelIdStr.includes("qwen") && !modelIdStr.includes("vl")) &&
					!(modelIdStr.includes("llama") && !modelIdStr.includes("vision")))

			const coreMessages: any[] = []
			for (const m of historyMessages) {
				if (m.role !== "user" && m.role !== "assistant") continue
				const role = m.role
				if (role === "user") {
					const parts: any[] = []
					let histUserText = ""
					const attachedNames: string[] = []

					const rawParts = Array.isArray(m.content?.parts)
						? m.content.parts
						: Array.isArray(m.content)
							? m.content
							: []

					if (rawParts.length > 0) {
						for (const p of rawParts) {
							if (!p) continue
							if (p.type === "text" && typeof p.text === "string") {
								histUserText =
									(histUserText ? histUserText + "\n" : "") + p.text
							} else if (p.type === "image") {
								if (canVision) {
									const imgData =
										p.data ||
										p.image ||
										(typeof p.url === "string" && p.url.startsWith("data:")
											? p.url.split(",")[1]
											: p.url)
									if (imgData) {
										const mediaType = p.mimeType || p.mediaType || "image/png"
										parts.push({
											type: "image",
											image: String(imgData),
											mediaType,
										})
									}
								} else {
									const name = p.name || p.filename || "screenshot.png"
									attachedNames.push(name)
								}
							}
						}
					} else {
						if (typeof m.content === "string") {
							histUserText = m.content
						} else if (m.content?.content) {
							histUserText =
								typeof m.content.content === "string" ? m.content.content : ""
						}
					}

					if (parts.length === 0 && Array.isArray(m.attachments)) {
						for (const att of m.attachments) {
							const mime = String(att.mimeType || att.mediaType || "")
							const isImg =
								att.type === "image" ||
								mime.startsWith("image/") ||
								/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(String(att.name || ""))
							if (isImg) {
								if (canVision && (att.data || att.preview)) {
									const rawData = att.data || att.preview
									const cleanData =
										typeof rawData === "string" && rawData.startsWith("data:")
											? rawData.split(",")[1]
											: rawData
									parts.push({
										type: "image",
										image: String(cleanData),
										mediaType: mime || "image/png",
									})
								} else if (!canVision) {
									const name = att.name || att.filename || "screenshot.png"
									attachedNames.push(name)
								}
							}
						}
					}

					if (!canVision && attachedNames.length > 0) {
						const uniqueNames = Array.from(new Set(attachedNames)).join(", ")
						const note = `[Attached image: ${uniqueNames}]`
						if (!histUserText.includes("[Attached image:")) {
							histUserText = histUserText ? `${histUserText}\n\n${note}` : note
						}
					}

					histUserText = histUserText.trim()
					if (parts.length > 0) {
						if (histUserText) {
							parts.unshift({ type: "text", text: histUserText })
						}
						coreMessages.push({ role: "user", content: parts })
					} else if (histUserText) {
						coreMessages.push({ role: "user", content: histUserText })
					}
				} else {
					let text = ""
					let reasoning = ""

					if (typeof m.content === "string") {
						text = m.content
					} else if (
						m.content?.content &&
						typeof m.content.content === "string"
					) {
						text = m.content.content
					}
					if (m.content?.reasoning && typeof m.content.reasoning === "string") {
						reasoning = m.content.reasoning
					}

					if (Array.isArray(m.content?.parts) && m.content.parts.length > 0) {
						for (const p of m.content.parts) {
							if (!p) continue
							if (p.type === "reasoning" || p.type === "thinking") {
								const t = p.text || p.thinking || p.reasoning || ""
								if (t && !reasoning.includes(t)) {
									reasoning = reasoning ? `${reasoning}\n${t}` : t
								}
							} else if (p.type === "text" && typeof p.text === "string") {
								if (!text.includes(p.text)) {
									text = text ? `${text}\n${p.text}` : p.text
								}
							}
						}
					}

					text = text.trim()
					reasoning = reasoning.trim()

					if (reasoning) {
						const assistantContent: any[] = [
							{ type: "reasoning", text: reasoning },
						]
						if (text) {
							assistantContent.push({ type: "text", text })
						}
						coreMessages.push({ role: "assistant", content: assistantContent })
					} else if (text) {
						coreMessages.push({ role: "assistant", content: text })
					}
				}
			}

			// 6. Create assistant message placeholder
			const assistantMessageId = randomUUID()

			this.emit({
				type: "message_start",
				id: assistantMessageId,
				message: {
					id: assistantMessageId,
					role: "assistant",
					content: [],
				},
			})

			// Check for offline replay model or recording
			const replayModel = preloadedReplayModel
			replayModelUsed = replayModel
			const activeModel = replayModel || model
			const activeExecutableTools = replayModel
				? createReplayTools(executableTools, [])
				: executableTools

			const sessionsDir =
				process.env.MYAGENT_SESSIONS_DIR ||
				path.join(os.homedir(), ".myagent", "sessions")
			// Snapshot the composer selections *before* the run: a replay has to
			// reproduce the model/mode/permission this run actually used, not
			// whatever the session is set to at replay time.
			const runtimeSnapshot = this.snapshotRuntime()
			const sessionModelId = runtimeSnapshot.modelId || modelIdStr
			recorder = sessionRecordingManager.getOrCreateRecorder({
				threadId,
				runId,
				sessionsDir,
				cwd: (this.state as any)?.projectPath || process.cwd(),
				model: sessionModelId,
				runtime: runtimeSnapshot,
			})

			if (recorder) {
				recorder.recordRunStart({
					systemPrompt: instructions,
					userPrompt: userText,
					tools: Object.entries(activeExecutableTools).map(([name, t]) => ({
						name,
						description: (t as any)?.description,
					})),
					stepLimit: 50,
					runtime: runtimeSnapshot,
				})
				recorder.recordStepStart(1, 1)
			}

			// 7. Execute mode graph via GraphRunner
			const graphCtx: GraphExecutionContext = {
				modeId: this._modeId || DEFAULT_EXECUTION_MODE,
				model: activeModel as any,
				modelIdStr,
				instructions,
				executableTools: activeExecutableTools,
				abortSignal: abortController.signal,
				emit: (ev) => this.emit(ev),
				store,
				resourceId,
				threadId,
				recorder,
			}

			const runResult = await defaultGraphRunner.run(
				graphCtx,
				coreMessages,
				assistantMessageId,
			)

			if (recorder) {
				const isStepLimit = (runResult as any).finishReason === "tool-calls"
				recorder.recordRunEnd({
					status: isStepLimit ? "step-limit" : "completed",
					finishReason: (runResult as any).finishReason ?? "stop",
				})
			}

			this._tokenUsage = {
				promptTokens:
					this._tokenUsage.promptTokens + runResult.tokenUsage.promptTokens,
				completionTokens:
					this._tokenUsage.completionTokens +
					runResult.tokenUsage.completionTokens,
				totalTokens:
					this._tokenUsage.totalTokens + runResult.tokenUsage.totalTokens,
			}

			const durationMs = Date.now() - startTime
			const {
				parts: finalParts,
				cleanText: finalCleanText,
				activeThinking,
			} = buildMessageParts(
				runResult.assistantText,
				runResult.reasoningText,
				runResult.executedTools,
			)

			// 8. Persist assistant message with durationMs
			const assistantDbMessage = {
				id: assistantMessageId,
				role: "assistant",
				content: {
					format: 2,
					parts:
						finalParts.length > 0
							? finalParts
							: finalCleanText
								? [{ type: "text", text: finalCleanText }]
								: [],
					content: finalCleanText,
					reasoning: activeThinking || undefined,
				},
				threadId,
				resourceId,
				createdAt: new Date(),
				durationMs,
			}

			if (store?.saveMessages) {
				await store.saveMessages({ messages: [assistantDbMessage] })
			}

			// 9. Emit final message_end and agent_end
			logger.info("run", "run completed", {
				runId,
				threadId,
				durationMs,
				finishReason: (runResult as any)?.finishReason,
				textLength: finalCleanText?.length ?? 0,
				reasoningLength: activeThinking?.length ?? 0,
				parts: finalParts.length,
				tokenUsage: runResult.tokenUsage,
			})
			this.emit({
				type: "message_end",
				id: assistantMessageId,
				message: assistantDbMessage,
			})

			this.emit({
				type: "agent_end",
				id: runId,
				runId,
				threadId,
				durationMs,
			})
		} catch (err: any) {
			if (abortController.signal.aborted) {
				console.warn("[Session] Run aborted by user.")
				logger.info("run", "run aborted", { runId, threadId })
				if (recorder) {
					recorder.recordRunEnd({ status: "aborted" })
				}
			} else {
				console.error("[Session] Error during sendMessage:", err)
				logger.error("run", "run failed", {
					runId,
					threadId,
					durationMs: Date.now() - startTime,
					error: err,
				})
				if (recorder) {
					recorder.recordRunEnd({
						status: "error",
						error: err?.message || String(err),
					})
				}
			}
			const durationMs = Date.now() - startTime
			this.emit({
				type: "agent_end",
				id: runId,
				runId,
				threadId,
				durationMs,
				error: err?.message || String(err),
			})
			throw err
		} finally {
			this._isRunning = false
			this._activeAbortController = null
			if (threadId) {
				sessionRecordingManager.finishRecorder(threadId)
			}
			// A replay run is one-shot: once it finishes (or fails) the thread goes
			// back to normal, otherwise the stale replay flag keeps the UI in
			// "replaying" state and the next message hits "script exhausted".
			if (replayModelUsed && threadId) {
				// The replay switched the session to the recorded model/mode/
				// permission. Hand the user's own selection back so the composer
				// does not stay pinned to the recorded one.
				const { restored } = endSessionReplay(this, threadId)
				if (restored) {
					try {
						for (const [key, value] of runtimeMetadata(restored)) {
							await this.controller.writeThreadMetadataValue?.({
								threadId,
								key,
								value,
							})
						}
					} catch (e) {
						console.warn("[replay] failed to restore session metadata:", e)
					}
				}
				try {
					await this.controller.writeThreadMetadataValue?.({
						threadId,
						key: "isReplay",
						value: false,
					})
				} catch {}
				this.emit({ type: "session_replay_stopped", threadId })
			}
			if (releaseLock) {
				try {
					releaseLock()
				} catch {}
			}
			if (this.controller.threadLock?.release) {
				try {
					await this.controller.threadLock.release(threadId)
				} catch {}
			}
		}
	}
}
