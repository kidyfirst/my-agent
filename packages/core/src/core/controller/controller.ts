import { randomUUID } from "node:crypto"
import { traceStorage, withSpan } from "../trace/context.js"
import type { ExecutedToolItem } from "../graph/types.js"
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
import { AssetManager } from "../../assets/manager.js"
import { setRuntimeCategoryPolicy } from "../../permissions.js"
import { sortToolsByName } from "../llm/prompt-cache.js"
import {
	formatObservationalMemory,
	DEFAULT_MAX_OBSERVATIONAL_TOKENS,
	resolveBlockAfter,
} from "../memory/observational.js"
import { sharedTokenCounter } from "../../memory/token-counter.js"
import { truncateStringForTokenEstimate } from "../../utils/token-estimator.js"
import type { FoldedRange } from "../../tools/retrieve-folded.js"
import {
	resolveModelContextWindow,
	computeMaxHistoryTokens,
	estimateToolsSchemaTokens,
	estimateMessagesTokens,
	estimateMessageTokens,
	estimateTextTokens,
} from "../llm/context-window.js"

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

export interface ControllerMessageLike {
	id?: string
	role?: string
	type?: string
	content?: unknown
	createdAt?: string
	metadata?: Record<string, unknown>
	[key: string]: unknown
}

export interface HarnessMode {
	id: string
	name: string
	defaultModelId?: string
	color?: string
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

export type { HarnessEvent } from "./events.js"
import type { HarnessEvent } from "./events.js"

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

	async getMemoryStorage(): Promise<any> {
		return this.getMemoryStore()
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
	/**
	 * Reports observational-memory state for the UI token tracker.
	 *
	 * The tracker hides itself when both thresholds are 0, so returning `{}`
	 * (the previous stub) left it permanently invisible: the fields it reads
	 * were simply absent. Thresholds come from the config rather than storage,
	 * because a thread that has never been observed still needs to show how far
	 * it is from the trigger.
	 */
	async loadOMProgress(target?: unknown): Promise<unknown> {
		const memory = this.memory as any
		const resolveFactory =
			typeof memory === "function"
				? memory({ requestContext: new RequestContext() })
				: memory
		const m = await resolveFactory
		if (!m) return {}

		let threadId = ""
		let resourceId = this.resourceId || ""
		if (typeof target === "string") {
			resourceId = target || resourceId
		} else if (target && typeof (target as any).thread?.getId === "function") {
			threadId = (target as any).thread.getId() || ""
			resourceId = (target as any).resourceId || resourceId
		}

		// Without a thread there is nothing observed yet; the tracker still needs
		// the thresholds so it can show the build-up toward the first trigger.
		if (!threadId && resourceId) {
			try {
				const store = await this.getMemoryStore()
				const res = await store?.listThreads?.({
					resourceId,
					orderBy: { field: "updatedAt", direction: "DESC" },
					perPage: 1,
				})
				const threads = Array.isArray(res) ? res : (res?.threads ?? [])
				threadId = threads[0]?.id ?? ""
			} catch {
				// A missing thread only costs the record fields, not the thresholds.
			}
		}

		const config = m.resolveObservationalConfig?.() ?? null
		const obsConfig = config?.observation ?? {}
		const refConfig = config?.reflection ?? {}
		const messageTokens: number = obsConfig.messageTokens ?? 30_000
		const observationTokens: number = refConfig.observationTokens ?? 40_000
		if (!config || (messageTokens === 0 && observationTokens === 0)) {
			return {}
		}

		const record = threadId
			? await m.getObservationalRecord?.(threadId, resourceId)
			: null
		const pendingTokens = Number(record?.pendingMessageTokens ?? 0)
		const activeObservationTokens = Number(
			record?.observationTokenCount ??
				(record?.activeObservations
					? (m.tokenCounter?.estimateTokens?.(record.activeObservations) ?? 0)
					: 0),
		)
		const reflectionThreshold = resolveBlockAfter(
			refConfig.blockAfter,
			observationTokens,
			1.1,
		)

		const pct = (value: number, threshold: number) =>
			threshold > 0 ? Math.min(100, (value / threshold) * 100) : 0

		return {
			status: record?.isReflecting
				? ("reflecting" as const)
				: record?.isObserving
					? ("observing" as const)
					: ("idle" as const),
			pendingTokens,
			threshold: messageTokens,
			thresholdPercent: pct(pendingTokens, messageTokens),
			observationTokens: activeObservationTokens,
			reflectionThreshold,
			reflectionThresholdPercent: pct(
				activeObservationTokens,
				reflectionThreshold,
			),
			buffered: {
				observations: {
					status: record?.bufferedObservations
						? ("complete" as const)
						: ("idle" as const),
					chunks: record?.bufferedObservations
						? record.bufferedObservations.split("\n").length
						: 0,
					messageTokens: pendingTokens,
					// What the next crossing would remove from the window.
					projectedMessageRemoval: Number(
						record?.bufferedObservationTokens ?? 0,
					),
					observationTokens: Number(record?.bufferedObservationTokens ?? 0),
				},
				reflection: {
					status: "idle" as const,
					inputObservationTokens: 0,
					observationTokens: 0,
				},
			},
			generationCount: Number(record?.generationCount ?? 0),
			stepNumber: Number(record?.generationCount ?? 0),
			preReflectionTokens: activeObservationTokens,
		}
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

	async getFoldedRangesAsync(threadId: string): Promise<FoldedRange[]> {
		for (const session of this._sessions.values()) {
			const ranges = await (session as any).getFoldedRangesAsync?.(threadId)
			if (ranges && ranges.length > 0) return ranges
		}
		if (this.storage) {
			try {
				const store = await this.storage.getStore("memory")
				if (store?.getThreadById) {
					const thread = await store.getThreadById({ threadId })
					const storedRanges = (thread?.metadata as any)?.foldedRanges
					if (Array.isArray(storedRanges) && storedRanges.length > 0) {
						return storedRanges
					}
				}
			} catch {}
		}
		return []
	}

	getFoldedRanges(threadId: string): FoldedRange[] {
		for (const session of this._sessions.values()) {
			const ranges = (session as any).getFoldedRanges?.(threadId)
			if (ranges && ranges.length > 0) return ranges
		}
		return []
	}

	getFoldedRange(threadId: string, rangeId: string): FoldedRange | undefined {
		for (const session of this._sessions.values()) {
			const r = session.getFoldedRange?.(threadId, rangeId)
			if (r) return r
		}
		return undefined
	}

	async getFoldedRangeAsync(
		threadId: string,
		rangeId: string,
	): Promise<FoldedRange | undefined> {
		const ranges = await this.getFoldedRangesAsync(threadId)
		return ranges.find((r) => r.rangeId === rangeId)
	}

	clearThreadCache(threadId: string): void {
		for (const session of this._sessions.values()) {
			session.clearThreadCache?.(threadId)
		}
	}

	deleteSession(sessionId: string): boolean {
		const session = this._sessions.get(sessionId)
		if (session) {
			if (typeof (session as any).dispose === "function") {
				;(session as any).dispose()
			}
			return this._sessions.delete(sessionId)
		}
		return false
	}
}

export interface SessionConfig<TState = any> {
	controller: AgentController<TState>
	resourceId: string
	initialState?: Partial<TState>
	defaultModeId?: string
	contextWindow?: number
}

export class Session<TState = any> {
	id: string
	controller: AgentController<TState>
	resourceId: string

	private _state: Record<string, any>
	private _modeId: string
	private _modelId: string = ""
	private _contextWindow?: number
	private _tokenCalibrationByThread: Map<string, number> = new Map()
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
		(decision: "approve" | "decline" | any) => void
	> = new Map()
	private _pendingSuspensions: Map<string, (data: any) => void> = new Map()
	private _threadRuns: Map<
		string,
		{
			threadId: string
			runId: string
			abortController: AbortController
			pendingApprovals: Map<
				string,
				{
					toolCallId: string
					toolName: string
					args: any
					category?: string
					categoryLabel?: string
					resolve: (decision: "approve" | "decline" | any) => void
				}
			>
			currentAssistantMessage?: any
			startTime: number
		}
	> = new Map()
	private _threadQueues: Map<string, Promise<void>> = new Map()
	private _foldedRanges: Map<string, FoldedRange[]> = new Map()

	private static readonly MAX_CACHED_THREADS = 100

	private _setFoldedRanges(threadId: string, ranges: FoldedRange[]): void {
		if (this._foldedRanges.has(threadId)) {
			this._foldedRanges.delete(threadId)
		} else if (this._foldedRanges.size >= Session.MAX_CACHED_THREADS) {
			const oldestKey = this._foldedRanges.keys().next().value
			if (oldestKey) this._foldedRanges.delete(oldestKey)
		}
		this._foldedRanges.set(threadId, ranges)
	}

	private _setTokenCalibration(threadId: string, ratio: number): void {
		if (this._tokenCalibrationByThread.has(threadId)) {
			this._tokenCalibrationByThread.delete(threadId)
		} else if (
			this._tokenCalibrationByThread.size >= Session.MAX_CACHED_THREADS
		) {
			const oldestKey = this._tokenCalibrationByThread.keys().next().value
			if (oldestKey) this._tokenCalibrationByThread.delete(oldestKey)
		}
		this._tokenCalibrationByThread.set(threadId, ratio)
	}

	clearThreadCache(threadId: string): void {
		this._foldedRanges.delete(threadId)
		this._tokenCalibrationByThread.delete(threadId)
		this._threadRuns.delete(threadId)
		this._threadQueues.delete(threadId)
	}

	dispose(): void {
		this._foldedRanges.clear()
		this._tokenCalibrationByThread.clear()
		this._threadRuns.clear()
		this._threadQueues.clear()
		this._subscribers.clear()
	}

	getFoldedRanges(threadId: string): FoldedRange[] {
		const ranges = this._foldedRanges.get(threadId)
		if (ranges) {
			this._foldedRanges.delete(threadId)
			this._foldedRanges.set(threadId, ranges)
			return ranges
		}
		return []
	}

	async getFoldedRangesAsync(
		threadId: string,
		store?: any,
	): Promise<FoldedRange[]> {
		return await this.hydrateFoldedRanges(threadId, store)
	}

	async hydrateFoldedRanges(
		threadId: string,
		store?: any,
	): Promise<FoldedRange[]> {
		try {
			const activeStore = store || (await this.getMemoryStore())
			if (activeStore?.getThreadById) {
				const thread = await activeStore.getThreadById({ threadId })
				if (thread) {
					const stored = (thread.metadata as any)?.foldedRanges
					if (Array.isArray(stored)) {
						// Preserve cached message objects for matching rangeIds if present in memory
						const existing = this._foldedRanges.get(threadId) || []
						const messageCache = new Map<string, any[]>()
						for (const r of existing) {
							if (r.messages && r.messages.length > 0) {
								messageCache.set(r.rangeId, r.messages)
							}
						}
						const synced: FoldedRange[] = stored.map((r) => ({
							...r,
							messages: messageCache.get(r.rangeId) || r.messages,
						}))
						this._setFoldedRanges(threadId, synced)
						return synced
					} else {
						// Thread exists on disk but has no folded ranges
						this._setFoldedRanges(threadId, [])
						return []
					}
				}
			}
		} catch (err) {
			console.warn("[Session] Failed to hydrate folded ranges from store:", err)
		}
		return this._foldedRanges.get(threadId) || []
	}

	getFoldedRange(threadId: string, rangeId: string): FoldedRange | undefined {
		const ranges = this.getFoldedRanges(threadId)
		return ranges.find((r) => r.rangeId === rangeId)
	}

	async recordFoldedRange(
		threadId: string,
		range: FoldedRange,
		store?: any,
	): Promise<void> {
		const ranges = this.getFoldedRanges(threadId)
		const filtered = ranges.filter((r) => r.rangeId !== range.rangeId)
		filtered.push(range)
		this._setFoldedRanges(threadId, filtered)

		// Persist compact range metadata to thread.metadata.foldedRanges in SQLite
		try {
			const activeStore = store || (await this.getMemoryStore())
			if (activeStore?.updateThread && activeStore?.getThreadById) {
				const thread = await activeStore.getThreadById({ threadId })
				if (thread) {
					const metadata = (thread.metadata || {}) as any
					const existingPersisted: FoldedRange[] = Array.isArray(
						metadata.foldedRanges,
					)
						? metadata.foldedRanges
						: []
					const compactRange: FoldedRange = {
						rangeId: range.rangeId,
						threadId: range.threadId,
						messageCount: range.messageCount,
						startIndex: range.startIndex,
						firstMessageId: range.firstMessageId,
						lastMessageId: range.lastMessageId,
						firstMessageCreatedAt: range.firstMessageCreatedAt,
						lastMessageCreatedAt: range.lastMessageCreatedAt,
						messageIds: range.messageIds,
						userGoal: range.userGoal,
						createdAt: range.createdAt,
					}
					const updatedList = existingPersisted.filter(
						(r) => r.rangeId !== range.rangeId,
					)
					updatedList.push(compactRange)
					await activeStore.updateThread({
						id: threadId,
						metadata: {
							...metadata,
							foldedRanges: updatedList,
						},
					})
				}
			}
		} catch (err) {
			console.warn("[Session] Failed to persist folded range to store:", err)
		}
	}

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
		this._contextWindow = config.contextWindow
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

	get memory() {
		return this.controller.memory
	}

	get storage() {
		return this.controller.storage
	}

	async getMemoryStore(): Promise<any> {
		return this.controller.getMemoryStore()
	}

	async getMemoryStorage(): Promise<any> {
		return this.controller.getMemoryStorage()
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
			switch: async (
				modelId:
					| string
					| { modelId?: string; id?: string; name?: string }
					| unknown,
			) => {
				let id: string | undefined
				if (typeof modelId === "string") {
					id = modelId.trim()
				} else if (modelId && typeof modelId === "object") {
					const obj = modelId as Record<string, unknown>
					if (typeof obj.modelId === "string") id = obj.modelId.trim()
					else if (typeof obj.id === "string") id = obj.id.trim()
					else if (typeof obj.name === "string") id = obj.name.trim()
				}
				if (
					!id ||
					id === "[object Object]" ||
					id === "undefined" ||
					id === "null"
				) {
					return this._modelId
				}
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
				this.clearThreadCache(opts.threadId)
				this.controller.clearThreadCache(opts.threadId)
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

	get isRunning(): boolean {
		return this.isThreadRunning(this._currentThreadId)
	}

	isThreadRunning(threadId?: string): boolean {
		const targetId = threadId || this._currentThreadId
		return targetId ? this._threadRuns.has(targetId) : false
	}

	getRunningThreadIds(): string[] {
		return Array.from(this._threadRuns.keys())
	}

	getPendingApprovals(threadId?: string): Array<{
		threadId: string
		toolCallId: string
		toolName: string
		args: any
		category?: string
		categoryLabel?: string
	}> {
		const result: Array<{
			threadId: string
			toolCallId: string
			toolName: string
			args: any
			category?: string
			categoryLabel?: string
		}> = []

		if (threadId) {
			const tr = this._threadRuns.get(threadId)
			if (tr) {
				for (const item of tr.pendingApprovals.values()) {
					result.push({
						threadId,
						toolCallId: item.toolCallId,
						toolName: item.toolName,
						args: item.args,
						category: item.category,
						categoryLabel: item.categoryLabel,
					})
				}
			}
		} else {
			for (const [tId, tr] of this._threadRuns.entries()) {
				for (const item of tr.pendingApprovals.values()) {
					result.push({
						threadId: tId,
						toolCallId: item.toolCallId,
						toolName: item.toolName,
						args: item.args,
						category: item.category,
						categoryLabel: item.categoryLabel,
					})
				}
			}
		}
		return result
	}

	getCurrentAssistantMessage(threadId: string): ControllerMessageLike | null {
		return this._threadRuns.get(threadId)?.currentAssistantMessage || null
	}

	get run() {
		return {
			isRunning: (threadId?: string) => this.isThreadRunning(threadId),
		}
	}

	get stream() {
		return {
			isOpen: (threadId?: string) => this.isThreadRunning(threadId),
			isActive: (threadId?: string) => this.isThreadRunning(threadId),
		}
	}

	subscribe(listener: (event: HarnessEvent) => void): () => void {
		this._subscribers.add(listener)
		return () => {
			this._subscribers.delete(listener)
		}
	}

	emit(event: HarnessEvent): void {
		// Stamp the ambient trace onto every event so a subscriber can group
		// events by run without the ~40 emit() call sites passing it explicitly.
		const trace = traceStorage.getStore()
		const stamped =
			!event?.traceId && trace?.traceId
				? {
						...event,
						traceId: trace.traceId,
						...(trace.spanId ? { spanId: trace.spanId } : {}),
					}
				: event
		for (const sub of this._subscribers) {
			try {
				sub(stamped)
			} catch (e) {
				console.error("[Session] event subscriber error:", e)
			}
		}
	}

	async abort(opts?: { threadId?: string }): Promise<void> {
		const targetId = opts?.threadId || this._currentThreadId
		if (targetId && this._threadRuns.has(targetId)) {
			const tr = this._threadRuns.get(targetId)!
			for (const item of tr.pendingApprovals.values()) {
				try {
					item.resolve("decline")
				} catch {}
			}
			tr.pendingApprovals.clear()
			tr.abortController.abort()
			this._threadRuns.delete(targetId)
		} else if (!opts?.threadId) {
			for (const tr of this._threadRuns.values()) {
				for (const item of tr.pendingApprovals.values()) {
					try {
						item.resolve("decline")
					} catch {}
				}
				tr.pendingApprovals.clear()
				tr.abortController.abort()
			}
			this._threadRuns.clear()
		}
		if (this._activeAbortController) {
			this._activeAbortController.abort()
			this._activeAbortController = null
		}
		this._isRunning = this._threadRuns.size > 0
	}

	get abortSignal(): AbortSignal | undefined {
		return this._activeAbortController?.signal
	}

	async steer(options: any): Promise<void> {
		const steerText =
			typeof options === "string"
				? options
				: typeof options?.content === "string"
					? options.content
					: options?.content?.text ||
						(options?.content ? JSON.stringify(options.content) : "")
		const targetThreadId =
			options?.threadId ||
			this._currentThreadId ||
			(this._threadRuns.size > 0 ? this._threadRuns.keys().next().value : "") ||
			""
		if (!steerText.trim()) return

		logger.info("steering", "steer prompt received", {
			threadId: targetThreadId,
			text: steerText,
		})

		const threadRun = targetThreadId
			? this._threadRuns.get(targetThreadId)
			: undefined

		if (threadRun && threadRun.pendingApprovals.size > 0) {
			const store = await this.getMemoryStore()
			const userMessageId = randomUUID()
			const userDbMessage = {
				id: userMessageId,
				role: "user" as const,
				content: {
					format: 2,
					parts: [{ type: "text", text: steerText }],
					content: steerText,
				},
				threadId: targetThreadId,
				resourceId: this.resourceId,
				createdAt: new Date(),
			}

			if (store?.saveMessages) {
				try {
					await store.saveMessages({ messages: [userDbMessage] })
				} catch (err) {
					console.error("[steer] Failed to persist steer message:", err)
				}
			}

			this.emit({
				type: "message_start",
				threadId: targetThreadId,
				id: userMessageId,
				message: userDbMessage,
			})
			this.emit({
				type: "message_end",
				threadId: targetThreadId,
				id: userMessageId,
				message: userDbMessage,
			})

			for (const [toolCallId, item] of threadRun.pendingApprovals.entries()) {
				try {
					item.resolve({ decision: "decline", feedback: steerText } as any)
				} catch {}
				this._pendingApprovals.delete(toolCallId)
				this.emit({
					type: "tool_approval_resolved" as any,
					threadId: targetThreadId,
					toolCallId,
					decision: "decline",
				})
			}
			threadRun.pendingApprovals.clear()
			return
		}

		if (
			this._pendingApprovals.size > 0 &&
			(!threadRun || threadRun.pendingApprovals.size === 0)
		) {
			for (const [toolCallId, resolve] of this._pendingApprovals.entries()) {
				try {
					resolve({ decision: "decline", feedback: steerText } as any)
				} catch {}
				this._pendingApprovals.delete(toolCallId)
				this.emit({
					type: "tool_approval_resolved" as any,
					threadId: targetThreadId,
					toolCallId,
					decision: "decline",
				})
			}
			return
		}

		if (threadRun) {
			threadRun.abortController.abort()
			const startWait = Date.now()
			while (
				this._threadRuns.has(targetThreadId) &&
				Date.now() - startWait < 3000
			) {
				await new Promise((r) => setTimeout(r, 50))
			}
			return this.sendMessage({ content: steerText, threadId: targetThreadId })
		}

		return this.sendMessage({ content: steerText, threadId: targetThreadId })
	}

	async followUp(options: any): Promise<void> {
		logger.info("steering", "followUp prompt received", { options })
		return this.steer(options)
	}

	respondToToolApproval(opts: {
		decision?: "approve" | "decline" | "always_allow_category" | string
		scope?: "once" | "conversation" | "project" | "global" | string
		toolCallId: string
		threadId?: string
		toolName?: string
		category?: string
		args?: any
		requestContext?: any
		declineContext?: any
	}): void {
		let resolver: ((decision: "approve" | "decline" | any) => void) | undefined
		let resolvedThreadId = opts.threadId
		let matchedItem: any = null

		if (opts.threadId && this._threadRuns.has(opts.threadId)) {
			const tr = this._threadRuns.get(opts.threadId)!
			const item = tr.pendingApprovals.get(opts.toolCallId)
			if (item) {
				resolver = item.resolve
				matchedItem = item
				tr.pendingApprovals.delete(opts.toolCallId)
			}
		} else {
			for (const [tId, tr] of this._threadRuns.entries()) {
				const item = tr.pendingApprovals.get(opts.toolCallId)
				if (item) {
					resolver = item.resolve
					matchedItem = item
					resolvedThreadId = tId
					tr.pendingApprovals.delete(opts.toolCallId)
					break
				}
			}
		}

		if (!resolver) {
			resolver = this._pendingApprovals.get(opts.toolCallId)
			this._pendingApprovals.delete(opts.toolCallId)
		}

		if (resolver) {
			const dec = opts.decision === "decline" ? "decline" : "approve"
			const toolName = opts.toolName || matchedItem?.toolName || ""
			const category = opts.category || matchedItem?.category || ""
			const args = opts.args !== undefined ? opts.args : matchedItem?.args
			const scope =
				opts.scope ||
				(opts.decision === "always_allow_category" ? "project" : "once")

			// Handle permission grants based on scope
			if (dec === "approve") {
				if (scope === "conversation") {
					if (toolName) this.grantTool(toolName)
					if (category) this.grantCategory(category as any)
				} else if (scope === "project") {
					if (toolName) {
						this._toolPolicies[toolName] = "allow"
						this.grantTool(toolName)
					}
					if (category) {
						this._categoryPolicies[category] = "allow"
						this.grantCategory(category as any)
					}
				} else if (scope === "global") {
					if (toolName) {
						this._toolPolicies[toolName] = "allow"
						this.grantTool(toolName)
					}
					if (category) {
						setRuntimeCategoryPolicy(category as any, "allow")
						this._categoryPolicies[category] = "allow"
						this.grantCategory(category as any)
					}
				} else if (opts.decision === "always_allow_category" && category) {
					this.grantCategory(category as any)
				}
			}

			const feedback =
				typeof opts.declineContext === "string"
					? opts.declineContext
					: opts.declineContext?.reason || (opts as any).reason
			if (dec === "decline" && feedback) {
				resolver({ decision: "decline", feedback } as any)
			} else {
				resolver(dec)
			}

			// Record approval decision to database store
			const targetThreadId = resolvedThreadId || this._currentThreadId
			if (targetThreadId) {
				this.getMemoryStore()
					.then((store) => {
						if (
							store &&
							typeof (store as any).recordToolApproval === "function"
						) {
							;(store as any)
								.recordToolApproval({
									threadId: targetThreadId,
									toolCallId: opts.toolCallId,
									toolName: toolName || "unknown_tool",
									args,
									category: category || null,
									decision: dec,
									scope,
								})
								.catch(() => {})
						}
					})
					.catch(() => {})
			}

			this.emit({
				type: "tool_approval_resolved" as any,
				threadId: targetThreadId,
				toolCallId: opts.toolCallId,
				decision: dec,
				scope,
			} as any)
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
		threadId?: string
		[key: string]: unknown
	}): Promise<void> {
		if (!this._currentThreadId) {
			await this.thread.create({ title: "New Session" })
		}
		const threadId = (options.threadId as string) || this._currentThreadId

		// Per-thread serialization queue: ensures sequential execution on the same thread
		const previousRun = this._threadQueues.get(threadId) || Promise.resolve()
		let runResolve: () => void = () => {}
		const queuePromise = new Promise<void>((r) => {
			runResolve = r
		})
		this._threadQueues.set(
			threadId,
			previousRun.catch(() => {}).then(() => queuePromise),
		)

		await previousRun.catch(() => {})
		try {
			await this._executeSendMessage(options, threadId)
		} finally {
			runResolve()
			if (this._threadQueues.get(threadId) === queuePromise) {
				this._threadQueues.delete(threadId)
			}
		}
	}

	private async _executeSendMessage(
		options: {
			content: any
			files?: any[]
			requestContext?: RequestContext
			threadId?: string
			[key: string]: unknown
		},
		threadId: string,
	): Promise<void> {
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
		// Enter the trace context here rather than wrapping the whole body: this
		// method owns exactly one run, so `enterWith` scopes every log entry and
		// harness event that follows without reindenting 700 lines. Threads run
		// concurrently, and AsyncLocalStorage keeps them apart.
		traceStorage.enterWith({ traceId: runId, threadId })
		let recorder: any = null
		let replayModelUsed: any = null
		let memory: any = null
		const requestContext = options.requestContext || new RequestContext()

		const threadRunState = {
			threadId,
			runId,
			abortController,
			pendingApprovals: new Map<
				string,
				{
					toolCallId: string
					toolName: string
					args: any
					category?: string
					categoryLabel?: string
					resolve: (decision: "approve" | "decline" | any) => void
				}
			>(),
			currentAssistantMessage: null as any,
			startTime,
		}
		this._threadRuns.set(threadId, threadRunState)

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

			const projectRoot =
				(this.state.get() as any)?.projectPath || process.cwd()
			const cleanedAttachments: any[] = []

			for (const f of incomingFiles) {
				if (!f) continue
				const mime = String(f.mimeType || f.mediaType || "image/png")
				const name = String(f.name || f.filename || "image.png")
				const isImg =
					f.type === "image" ||
					mime.startsWith("image/") ||
					/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)

				let assetId = (f.assetId as string) || undefined
				let assetUrl = (f.url as string) || undefined
				let assetPath = (f.path as string) || undefined
				let assetSize = typeof f.size === "number" ? f.size : undefined

				// Persist raw base64 data to .myagent/assets so SQLite never stores heavy base64
				if (f.data) {
					try {
						const meta = await AssetManager.saveAsset(f.data, {
							filename: name,
							mimeType: mime,
							projectRoot,
							assetId,
						})
						assetId = meta.assetId
						assetUrl = meta.url
						assetPath = meta.path
						assetSize = meta.size
					} catch (saveErr) {
						logger.warn("run", "Failed to save asset to disk", {
							error: saveErr,
							filename: name,
						})
					}
				}

				const assetInfo = {
					assetId,
					type: isImg ? "image" : "file",
					name,
					filename: name,
					mimeType: mime,
					mediaType: mime,
					size: assetSize,
					url:
						assetUrl ||
						(assetId
							? `myagent-asset://${assetId}.${AssetManager.getExtension(name, mime)}`
							: undefined),
					path: assetPath,
				}

				cleanedAttachments.push(assetInfo)
				userParts.push(assetInfo)
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
					attachments:
						cleanedAttachments.length > 0 ? cleanedAttachments : undefined,
				},
				threadId,
				resourceId,
				createdAt: new Date(),
				attachments:
					cleanedAttachments.length > 0 ? cleanedAttachments : undefined,
			}

			const store = await this.getMemoryStore()
			if (store?.saveMessages) {
				await store.saveMessages({ messages: [userDbMessage] })
			}

			// Record root user goal on thread metadata if not already recorded
			if (userText && store?.getThreadById && store?.updateThread) {
				try {
					const threadRec = await store.getThreadById({ threadId })
					if (threadRec && !(threadRec.metadata as any)?.rootUserGoal) {
						await store.updateThread({
							id: threadId,
							metadata: {
								...(threadRec.metadata || {}),
								rootUserGoal: userText.trim().slice(0, 500),
							},
						})
					}
				} catch {}
			}

			// Emit user message events
			this.emit({
				type: "message_start",
				threadId,
				id: userMessageId,
				message: userDbMessage,
			})
			this.emit({
				type: "message_end",
				threadId,
				id: userMessageId,
				message: userDbMessage,
			})

			// 2. Prepare request context
			if (!requestContext.get("controller")) {
				requestContext.set("controller", this.controller)
			}
			if (!requestContext.get("harness")) {
				requestContext.set("harness", this.controller)
			}
			requestContext.set("session", this)
			requestContext.set("threadId", threadId)
			requestContext.set("resourceId", resourceId)

			// Resolve memory instance: `memory` may be an instance or a factory receiving requestContext.
			const memoryFactory = this.controller.memory
			memory =
				typeof memoryFactory === "function"
					? await memoryFactory({ requestContext })
					: memoryFactory

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
			const executedTools: ExecutedToolItem[] = []

			const sortedRawTools = sortToolsByName(rawTools || {})
			for (const [toolName, tool] of Object.entries(sortedRawTools)) {
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
						const decisionPromise = new Promise<
							| "approve"
							| "decline"
							| { decision: "approve" | "decline"; feedback?: string }
						>((resolve) => {
							threadRunState.pendingApprovals.set(toolCallId, {
								toolCallId,
								toolName,
								args,
								category,
								categoryLabel: category
									? category.charAt(0).toUpperCase() + category.slice(1)
									: undefined,
								resolve,
							})
							this._pendingApprovals.set(toolCallId, resolve)
						})
						logger.info("approval", `tool requires approval: ${toolName}`, {
							threadId,
							toolCallId,
							toolName,
							category,
							args,
						})
						this.emit({
							type: "tool_approval_required",
							threadId,
							toolCallId,
							toolName,
							args,
							category,
							categoryLabel: category
								? category.charAt(0).toUpperCase() + category.slice(1)
								: undefined,
						})

						const decision = await decisionPromise
						logger.info("approval", `tool approval resolved: ${toolName}`, {
							threadId,
							toolCallId,
							toolName,
							decision:
								typeof decision === "object" ? decision.decision : decision,
							feedback:
								typeof decision === "object" ? decision.feedback : undefined,
						})

						if (
							decision === "decline" ||
							(typeof decision === "object" && decision?.decision === "decline")
						) {
							const feedback =
								typeof decision === "object" && decision?.feedback
									? decision.feedback
									: undefined
							if (feedback) {
								return `Tool execution was declined by user with steering guidance: "${feedback}". Please adjust your plan and follow this guidance immediately.`
							}
							return "Tool execution was declined by user."
						}
					}

					this.emit({
						type: "tool_start",
						threadId,
						toolName,
						toolCallId,
						args,
					})
					const toolStartTime = Date.now()
					// Stamp the span bounds on the shared item so the recorder can report a
					// duration even though it only sees the result as a stream chunk later.
					const execItem = executedTools.find((t) => t.id === toolCallId)
					if (execItem) execItem.startedAt = toolStartTime
					logger.info("tool", `tool start: ${toolName}`, {
						threadId,
						toolName,
						toolCallId,
						args,
					})

					try {
						const toolContext = { requestContext, toolCallId }
						let result: any
						// Run the tool inside its own span: anything it logs is stamped with
						// this tool call's id, which is what lets the trace panel attach log
						// lines to the node the user clicked.
						result = await withSpan(toolCallId, async () => {
							if (typeof origTool.execute === "function") {
								// The execution context travels as the second argument only.
								// Folding it into `args` leaked an extra `context` key into the
								// model-supplied arguments, which MCP servers reject against
								// their own input schema: LangSearch answered
								// `Unrecognized key: "context"`.
								return await origTool.execute(args, toolContext)
							}
							return { success: true }
						})

						const toolDurationMs = Date.now() - toolStartTime
						if (execItem) execItem.endedAt = toolStartTime + toolDurationMs
						logger.info("tool", `tool end: ${toolName} (${toolDurationMs}ms)`, {
							threadId,
							toolName,
							toolCallId,
							durationMs: toolDurationMs,
						})

						const current = executedTools.find((t) => t.id === toolCallId)
						if (current) {
							current.result = result
							current.isError = false
						}

						this.emit({
							type: "tool_end",
							threadId,
							toolName,
							toolCallId,
							result,
							isError: false,
						})
						return result
					} catch (toolErr: any) {
						const toolDurationMs = Date.now() - toolStartTime
						if (execItem) execItem.endedAt = toolStartTime + toolDurationMs
						logger.error(
							"tool",
							`tool error: ${toolName} (${toolDurationMs}ms)`,
							{
								threadId,
								toolName,
								toolCallId,
								durationMs: toolDurationMs,
								error: toolErr?.message || String(toolErr),
							},
						)
						const current = executedTools.find((t) => t.id === toolCallId)
						if (current) {
							current.result = toolErr?.message || String(toolErr)
							current.isError = true
						}

						this.emit({
							type: "tool_end",
							threadId,
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

			// 5. Recall message history from store: load up to 100 recent messages
			// Hydrate folded ranges and token calibration metadata from store
			await this.hydrateFoldedRanges(threadId, store)
			try {
				if (store?.getThreadById) {
					const threadRec = await store.getThreadById({ threadId })
					const metaRatio = (threadRec?.metadata as any)?.tokenCalibrationRatio
					if (typeof metaRatio === "number" && metaRatio > 0) {
						this._setTokenCalibration(threadId, metaRatio)
					}
				}
			} catch {}

			// Hydrate folded ranges from persistent storage
			const existingRanges = await this.getFoldedRangesAsync(threadId, store)
			const allAlreadyFoldedIds = new Set(
				existingRanges.flatMap((r) => r.messageIds || []),
			)

			const historyRes = await store.listMessages({
				threadId,
				limit: 200,
			})
			let historyMessages: any[] = [...(historyRes?.messages || [])]

			// Anti-Black-Hole Gap Detection: If folded ranges exist and the loaded batch reached limit,
			// check if the oldest loaded message overlaps with already-folded message IDs.
			// If not, there are un-folded messages older than the batch that would otherwise be silently lost.
			if (existingRanges.length > 0 && historyMessages.length >= 200) {
				const oldestLoadedId = historyMessages[0]?.id
				if (oldestLoadedId && !allAlreadyFoldedIds.has(oldestLoadedId)) {
					try {
						const fullRes = await store.listMessages({
							threadId,
							perPage: false,
						})
						if (
							fullRes?.messages &&
							fullRes.messages.length > historyMessages.length
						) {
							historyMessages = [...fullRes.messages]
						}
					} catch {}
				}
			}

			// Call memory input processors if registered
			if (memory && typeof (memory as any).getInputProcessors === "function") {
				try {
					const inputProcessors = await (memory as any).getInputProcessors([], {
						requestContext,
						threadId,
						resourceId,
					})
					for (const processor of inputProcessors) {
						if (typeof processor?.processInput === "function") {
							await processor.processInput({
								messageList: {
									threadId,
									resourceId,
									messages: historyMessages,
									prependMessages: (msgs: any[]) => {
										const existingIds = new Set(
											historyMessages.map((m) => m.id).filter(Boolean),
										)
										for (let i = msgs.length - 1; i >= 0; i--) {
											const m = msgs[i]
											if (!m.id || !existingIds.has(m.id)) {
												historyMessages.unshift(m)
												if (m.id) existingIds.add(m.id)
											}
										}
									},
								},
								requestContext,
							})
						}
					}
				} catch (procErr) {
					console.warn("[Session] Error in memory input processors:", procErr)
				}
			}

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

			const totalAssistantTurns = historyMessages.filter(
				(m) => m.role === "assistant",
			).length
			let assistantTurnCounter = 0
			const globalSeenToolCallIds = new Set<string>()

			const coreMessages: any[] = []
			for (const m of historyMessages) {
				if (m.role !== "user" && m.role !== "assistant") continue
				// Exclude messages that have already been compacted/folded into persistent ranges
				if (m.id && allAlreadyFoldedIds.has(m.id)) continue
				const role = m.role
				if (role === "user") {
					const parts: any[] = []
					let histUserText = ""
					const attachedNames: string[] = []
					const assetDescriptions: string[] = []

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
							} else if (p.assetId) {
								const aName = p.filename || p.name || "attachment"
								const aMime =
									p.mimeType || p.mediaType || "application/octet-stream"
								const aSize = p.size ? ` (${Math.round(p.size / 1024)} KB)` : ""
								assetDescriptions.push(
									`[Attached Asset: assetId="${p.assetId}", filename="${aName}", mimeType="${aMime}"${aSize}] (To view or inspect this file/image, call tool \`assets_fetch\` with assetId="${p.assetId}")`,
								)
							} else if (p.type === "image") {
								// Legacy inline image fallback
								if (canVision) {
									const rawImg = p.data || p.image || p.url
									const imgData =
										typeof rawImg === "string" && rawImg.startsWith("data:")
											? rawImg.slice(rawImg.indexOf(",") + 1)
											: rawImg
									if (imgData && !imgData.startsWith("myagent-asset://")) {
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

					if (Array.isArray(m.attachments)) {
						for (const att of m.attachments) {
							if (!att) continue
							if (att.assetId) {
								const aName = att.filename || att.name || "attachment"
								const aMime =
									att.mimeType || att.mediaType || "application/octet-stream"
								const aSize = att.size
									? ` (${Math.round(att.size / 1024)} KB)`
									: ""
								assetDescriptions.push(
									`[Attached Asset: assetId="${att.assetId}", filename="${aName}", mimeType="${aMime}"${aSize}] (To view or inspect this file/image, call tool \`assets_fetch\` with assetId="${att.assetId}")`,
								)
							} else {
								const mime = String(att.mimeType || att.mediaType || "")
								const isImg =
									att.type === "image" ||
									mime.startsWith("image/") ||
									/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(
										String(att.name || ""),
									)
								if (isImg) {
									if (canVision && (att.data || att.preview)) {
										const rawData = att.data || att.preview
										const cleanData =
											typeof rawData === "string" && rawData.startsWith("data:")
												? rawData.slice(rawData.indexOf(",") + 1)
												: rawData
										if (
											cleanData &&
											!cleanData.startsWith("myagent-asset://")
										) {
											parts.push({
												type: "image",
												image: String(cleanData),
												mediaType: mime || "image/png",
											})
										}
									} else if (!canVision) {
										const name = att.name || att.filename || "screenshot.png"
										attachedNames.push(name)
									}
								}
							}
						}
					}

					if (assetDescriptions.length > 0) {
						const uniqueAssets = Array.from(new Set(assetDescriptions)).join(
							"\n",
						)
						histUserText = histUserText
							? `${histUserText}\n\n${uniqueAssets}`
							: uniqueAssets
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
						coreMessages.push({
							role: "user",
							content: parts,
							id: m.id,
							createdAt: m.createdAt,
						})
					} else if (histUserText) {
						coreMessages.push({
							role: "user",
							content: histUserText,
							id: m.id,
							createdAt: m.createdAt,
						})
					}
				} else {
					assistantTurnCounter++
					const isRecentAssistantTurn =
						assistantTurnCounter > totalAssistantTurns - 2

					let text = ""
					let reasoning = ""
					const toolCalls: any[] = []
					const toolResults: any[] = []

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

					const rawAssistantParts = Array.isArray(m.content?.parts)
						? m.content.parts
						: Array.isArray(m.content)
							? m.content
							: []

					if (rawAssistantParts.length > 0) {
						for (const p of rawAssistantParts) {
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
							} else if (p.type === "tool-call") {
								let toolInput =
									p.input !== undefined
										? p.input
										: p.args !== undefined
											? p.args
											: {}
								if (typeof toolInput === "string") {
									try {
										toolInput = JSON.parse(toolInput)
									} catch {
										toolInput = { raw: toolInput }
									}
								}
								if (
									toolInput === undefined ||
									toolInput === null ||
									typeof toolInput !== "object"
								) {
									toolInput = {}
								}
								const rawId =
									p.toolCallId ||
									p.id ||
									`${m.id || "msg"}_call_${toolCalls.length}`
								const toolName = p.toolName || p.name || "tool"

								const existingIndex = toolCalls.findIndex(
									(tc) => tc.toolCallId === rawId,
								)
								if (existingIndex >= 0) {
									if (
										Object.keys(toolInput).length > 0 &&
										Object.keys(toolCalls[existingIndex].input || {}).length ===
											0
									) {
										toolCalls[existingIndex].input = toolInput
										toolCalls[existingIndex].args = toolInput
									}
								} else {
									toolCalls.push({
										type: "tool-call",
										toolCallId: rawId,
										toolName,
										input: toolInput,
										args: toolInput,
									})
								}
							} else if (p.type === "tool-result") {
								let res = p.result !== undefined ? p.result : p.output
								const toolCallId = p.toolCallId || p.id
								const toolName = p.toolName || p.name || "tool"

								// Temporal Output Decay:
								// 1. For retrieve_folded_messages: evict immediately in all replayed turns from past assistant steps
								//    to prevent retrieved history from re-overflowing the context window in subsequent turns.
								// 2. For other tools: collapse verbose tool outputs (> 300 chars) for older turns (> 2 assistant turns ago).
								const isRfm = toolName === "retrieve_folded_messages"
								if (isRfm || !isRecentAssistantTurn) {
									if (isRfm) {
										// Evict verbose retrieved history from past turns to prevent context window oscillation
										const rangeMatch =
											typeof res === "string"
												? res.match(/\[(fold_\w+)\]/)
												: null
										const matchingCall = toolCalls.find(
											(tc) => tc.toolCallId === toolCallId,
										)
										const rangeId =
											matchingCall?.args?.rangeId ||
											matchingCall?.input?.rangeId ||
											(p.input as any)?.rangeId ||
											(p.args as any)?.rangeId ||
											rangeMatch?.[1] ||
											"folded"
										res = `[Retrieved History (${rangeId}): Inspected by model in previous turn. Content evicted to prevent context oscillation.]`
									} else if (typeof res === "string" && res.length > 300) {
										res = `[Tool Result: ${toolName} completed (${res.length} chars). Content folded for context economy. Call ${toolName} again if fresh details are needed.]`
									} else if (
										typeof res === "object" &&
										res &&
										JSON.stringify(res).length > 300
									) {
										res = {
											summary: `[Tool Result: ${toolName} completed. Content folded for context economy. Call ${toolName} again if fresh details are needed.]`,
										}
									}
								}

								if (typeof res === "string" && res.length > 6000) {
									res =
										res.slice(0, 6000) +
										`\n\n[Output truncated: ${res.length} chars total]`
								} else if (
									typeof res === "object" &&
									res &&
									typeof res.content === "string" &&
									res.content.length > 6000
								) {
									res = {
										...res,
										content:
											res.content.slice(0, 6000) +
											`\n\n[Output truncated: ${res.content.length} chars total]`,
									}
								}

								const existingResIdx = toolResults.findIndex(
									(tr) => tr.toolCallId === toolCallId,
								)
								const resItem = {
									type: "tool-result",
									toolCallId,
									toolName,
									output:
										typeof res === "string"
											? { type: "text", value: res }
											: { type: "json", value: res ?? {} },
								}
								if (existingResIdx >= 0) {
									toolResults[existingResIdx] = resItem
								} else {
									toolResults.push(resItem)
								}
							}
						}
					}

					text = text.trim()
					reasoning = reasoning.trim()

					// Ensure globally unique toolCallIds across the entire conversation
					// and ensure 1:1 mapping between tool-call and tool-result
					const callIdMap = new Map<string, string>()
					for (const tc of toolCalls) {
						let uniqueId = tc.toolCallId
						if (globalSeenToolCallIds.has(uniqueId)) {
							let suffix = 1
							while (
								globalSeenToolCallIds.has(
									`${uniqueId}_t${assistantTurnCounter}_${suffix}`,
								)
							) {
								suffix++
							}
							uniqueId = `${uniqueId}_t${assistantTurnCounter}_${suffix}`
						}
						globalSeenToolCallIds.add(uniqueId)
						callIdMap.set(tc.toolCallId, uniqueId)
						tc.toolCallId = uniqueId
					}

					for (const tr of toolResults) {
						if (callIdMap.has(tr.toolCallId)) {
							tr.toolCallId = callIdMap.get(tr.toolCallId)!
						}
					}

					// Guarantee that every toolCall has a corresponding toolResult
					// Missing tool-results cause OpenAI / Anthropic APIs to reject the turn
					for (const tc of toolCalls) {
						const hasResult = toolResults.some(
							(tr) => tr.toolCallId === tc.toolCallId,
						)
						if (!hasResult) {
							toolResults.push({
								type: "tool-result",
								toolCallId: tc.toolCallId,
								toolName: tc.toolName,
								output: {
									type: "text",
									value:
										"[Tool execution was interrupted or completed without output]",
								},
							})
						}
					}

					// Deduplicate tool results by toolCallId and only keep results that correspond to a tool-call in this turn
					const seenResultIds = new Set<string>()
					const validToolResults: any[] = []
					for (const tr of toolResults) {
						if (
							toolCalls.some((tc) => tc.toolCallId === tr.toolCallId) &&
							!seenResultIds.has(tr.toolCallId)
						) {
							seenResultIds.add(tr.toolCallId)
							validToolResults.push(tr)
						}
					}

					const assistantContent: any[] = []
					if (reasoning) {
						assistantContent.push({ type: "reasoning", text: reasoning })
					}
					if (text) {
						assistantContent.push({ type: "text", text })
					}
					for (const tc of toolCalls) {
						assistantContent.push(tc)
					}

					if (assistantContent.length > 0) {
						coreMessages.push({
							role: "assistant",
							content: assistantContent,
							id: m.id,
							createdAt: m.createdAt,
						})
					} else if (text) {
						coreMessages.push({
							role: "assistant",
							content: text,
							id: m.id,
							createdAt: m.createdAt,
						})
					}

					if (validToolResults.length > 0) {
						coreMessages.push({
							role: "tool",
							content: validToolResults,
							id: m.id,
							createdAt: m.createdAt,
						})
					}
				}
			}

			// Prepend consolidated folded range note if earlier messages were folded
			if (existingRanges.length > 0) {
				const totalFoldedCount = existingRanges.reduce(
					(sum, r) => sum + (r.messageCount || r.messageIds?.length || 0),
					0,
				)
				let initialUserGoal = ""
				try {
					const threadRec = await store.getThreadById?.({ threadId })
					if ((threadRec?.metadata as any)?.rootUserGoal) {
						initialUserGoal = (threadRec.metadata as any).rootUserGoal
					}
				} catch {}
				if (!initialUserGoal) {
					for (const r of existingRanges) {
						if (r.userGoal) {
							initialUserGoal = r.userGoal
							break
						}
					}
				}
				const lastRange = existingRanges[existingRanges.length - 1]
				const rangeId = lastRange?.rangeId || "fold_001"
				const goalSnippet = initialUserGoal
					? initialUserGoal.slice(0, 300) +
						(initialUserGoal.length > 300 ? "..." : "")
					: ""
				const summaryNote = goalSnippet
					? `[System Note: Earlier conversation history was truncated and folded into range "${rangeId}" (${totalFoldedCount} messages folded) to stay within token context limits. Original User Task: "${goalSnippet}". If you need to inspect previous tool outputs, errors, or code from this folded history, call the "retrieve_folded_messages" tool with rangeId "${rangeId}".]`
					: `[System Note: Earlier conversation history was truncated and folded into range "${rangeId}" (${totalFoldedCount} messages folded) to stay within token context limits. If you need to inspect previous tool outputs, errors, or code from this folded history, call the "retrieve_folded_messages" tool with rangeId "${rangeId}".]`

				coreMessages.unshift({
					role: "user",
					content: summaryNote,
				})
			}

			// Resolve model context window dynamically and compute safe working history budget
			const effectiveModel = preloadedReplayModel || model
			const contextWindow = resolveModelContextWindow(
				effectiveModel,
				modelIdStr,
				this._contextWindow ?? (this.controller.agent as any)?.contextWindow,
			)
			const MAX_HISTORY_TOKENS = computeMaxHistoryTokens(contextWindow)

			// Calibrate character-to-token ratio using real provider feedback if available
			const calibrationRatio =
				this._tokenCalibrationByThread.get(threadId) ?? 1.0

			// Pre-fetch existing observations from memory if available, so they are properly budgeted
			let observationBlock: string | null = null
			if (memory && typeof (memory as any).getSystemMessage === "function") {
				try {
					observationBlock =
						(await (memory as any).getSystemMessage({
							threadId,
							resourceId,
						})) ?? null
				} catch {}
			}

			const baseSystemPromptTokens = instructions
				? Math.ceil(estimateTextTokens(instructions))
				: 0
			// Tool schema overhead is a static structural constant across the session.
			// It is tracked separately from dynamic conversational tokens so that language/topic shifts
			// do not inappropriately scale tool schemas, and tool schemas do not pollute dynamic calibration.
			const toolSchemaTokens = estimateToolsSchemaTokens(executableTools)

			let observationTokens = observationBlock
				? Math.ceil(estimateTextTokens(observationBlock))
				: 0

			// Estimate message tokens structurally, properly accounting for vision tokens without base64 inflation
			const { tokensByMessage: messageTokens, totalTokens: initialRawTokens } =
				estimateMessagesTokens(coreMessages)
			let rawEstimatedTokens = initialRawTokens

			const totalEstimatedTokens =
				toolSchemaTokens +
				baseSystemPromptTokens +
				Math.round((rawEstimatedTokens + observationTokens) * calibrationRatio)

			// Observational memory: fold earlier turns into a rolling summary
			// carried in the system prompt so the truncation window can drop raw
			// messages without discarding durable decisions, paths, and constraints.
			if (memory) {
				const omConfig =
					typeof (memory as any).resolveObservationalConfig === "function"
						? (memory as any).resolveObservationalConfig()
						: (memory as any)?.observationalMemory ||
							(memory as any)?.options?.observationalMemory ||
							null

				const obs = omConfig?.observation
				const messageTokensThreshold = obs?.messageTokens ?? 30_000
				const rawBufferTokens = obs?.bufferTokens
				let bufferTrigger: number
				if (typeof rawBufferTokens === "number" && rawBufferTokens > 0) {
					if (rawBufferTokens >= 100) {
						// Absolute token budget (e.g. 5,000 tokens)
						bufferTrigger = rawBufferTokens
					} else {
						// Ratio of threshold (e.g. 0.2 = 20%)
						bufferTrigger = Math.floor(messageTokensThreshold * rawBufferTokens)
					}
				} else {
					bufferTrigger = Math.floor(messageTokensThreshold * (1 / 5))
				}
				const syncBlockTrigger = resolveBlockAfter(
					obs?.blockAfter,
					messageTokensThreshold,
					2,
				)

				const isSyncTriggered =
					totalEstimatedTokens >= syncBlockTrigger ||
					totalEstimatedTokens > MAX_HISTORY_TOKENS
				const isBufferTriggered = totalEstimatedTokens >= bufferTrigger

				if (isSyncTriggered && typeof (memory as any).observe === "function") {
					try {
						const unobservedHistory = historyMessages.filter(
							(m) => !m.id || !allAlreadyFoldedIds.has(m.id),
						)
						const step = await (memory as any).observe({
							threadId,
							resourceId,
							messages: unobservedHistory,
							pendingTokens: totalEstimatedTokens,
							requestContext,
							foldedMessageIds: Array.from(allAlreadyFoldedIds),
						})
						if (step && step.kind !== "none") {
							const omMaxTokens = Math.min(
								DEFAULT_MAX_OBSERVATIONAL_TOKENS,
								Math.floor(MAX_HISTORY_TOKENS * 0.15),
							)
							observationBlock = formatObservationalMemory(
								step.activeObservations,
								omMaxTokens,
							)
							observationTokens = observationBlock
								? Math.ceil(estimateTextTokens(observationBlock))
								: 0
						}
					} catch {
						// Observation is best-effort: on failure the plain token window
						// below still keeps the request inside the model's limit.
					}
				} else if (
					isBufferTriggered &&
					typeof (memory as any).observe === "function"
				) {
					// Asynchronous observation in background: buffer observations
					// without blocking the immediate response turn.
					void Promise.resolve().then(async () => {
						try {
							const unobservedHistory = historyMessages.filter(
								(m) => !m.id || !allAlreadyFoldedIds.has(m.id),
							)
							await (memory as any).observe({
								threadId,
								resourceId,
								messages: unobservedHistory,
								pendingTokens: totalEstimatedTokens,
								requestContext,
								foldedMessageIds: Array.from(allAlreadyFoldedIds),
							})
						} catch {
							// Best-effort background observation
						}
					})
				}

				// If synchronous observation didn't generate a fresh block, read existing
				// observations from persistent store so they are still injected into the prompt.
				if (
					!observationBlock &&
					typeof (memory as any).getSystemMessage === "function"
				) {
					try {
						observationBlock =
							(await (memory as any).getSystemMessage({
								threadId,
								resourceId,
							})) ?? null
						observationTokens = observationBlock
							? Math.ceil(estimateTextTokens(observationBlock))
							: 0
					} catch {}
				}
			}

			// Ensure observationBlock is safely formatted and capped within token budget
			const omMaxTokens = Math.min(
				DEFAULT_MAX_OBSERVATIONAL_TOKENS,
				Math.max(1_000, Math.floor(MAX_HISTORY_TOKENS * 0.15)),
			)
			if (observationBlock) {
				if (!observationBlock.startsWith("# Observational Memory")) {
					observationBlock = formatObservationalMemory(
						observationBlock,
						omMaxTokens,
					)
				} else {
					observationBlock = truncateStringForTokenEstimate(
						observationBlock,
						omMaxTokens,
						false,
					)
				}
				observationTokens = observationBlock
					? Math.ceil(estimateTextTokens(observationBlock))
					: 0
			}

			// Include observationBlock, tool schema and system prompt tokens in the total estimated context tokens.
			// System prompt and tool schemas are invariant structural constants; dynamic calibration applies exclusively to conversational messages & observations.
			let calibratedContextTokens =
				toolSchemaTokens +
				baseSystemPromptTokens +
				Math.round((rawEstimatedTokens + observationTokens) * calibrationRatio)

			// Smooth Nudge: high-watermark warning when context usage is between 70% and 100%
			const NUDGE_THRESHOLD = Math.floor(MAX_HISTORY_TOKENS * 0.7)
			if (
				calibratedContextTokens >= NUDGE_THRESHOLD &&
				calibratedContextTokens <= MAX_HISTORY_TOKENS
			) {
				const usagePct = Math.round(
					(calibratedContextTokens / MAX_HISTORY_TOKENS) * 100,
				)
				const advisoryContent = `[Context Advisory: Context window is at ~${usagePct}% capacity (${calibratedContextTokens}/${MAX_HISTORY_TOKENS} tokens, model window: ${contextWindow}). Please plan your remaining edits and summarize key outcomes before automated context folding.]`
				coreMessages.push({
					role: "user",
					content: advisoryContent,
				})
				// Keep messageTokens synchronized with coreMessages to prevent index misalignment and NaN
				const advTokens = Math.ceil(estimateTextTokens(advisoryContent))
				messageTokens.push(advTokens)
				rawEstimatedTokens += advTokens
			}

			if (calibratedContextTokens > MAX_HISTORY_TOKENS) {
				// Anti-oscillation: Before folding real conversation messages,
				// check if any unevicted retrieve_folded_messages tool results exist in coreMessages.
				let evictedAnyRfm = false
				for (const msg of coreMessages) {
					if (msg.role === "tool" && Array.isArray(msg.content)) {
						for (const part of msg.content) {
							if (
								part.type === "tool-result" &&
								(part.toolName === "retrieve_folded_messages" ||
									part.name === "retrieve_folded_messages")
							) {
								const currentResult =
									part.output !== undefined
										? typeof part.output === "object" &&
											part.output?.value !== undefined
											? part.output.value
											: part.output
										: part.result
								const isAlreadyEvicted =
									typeof currentResult === "string" &&
									currentResult.startsWith("[Retrieved History")

								if (!isAlreadyEvicted) {
									const evictedText = `[Retrieved History: Inspected by model. Content evicted to prevent context oscillation.]`
									part.result = evictedText
									part.output = { type: "text", value: evictedText }
									evictedAnyRfm = true
								}
							}
						}
					}
				}
				if (evictedAnyRfm) {
					// Re-estimate tokens cleanly after evicting retrieved content
					const recheck = estimateMessagesTokens(coreMessages)
					rawEstimatedTokens = recheck.totalTokens
					for (let i = 0; i < coreMessages.length; i++) {
						messageTokens[i] = recheck.tokensByMessage[i]
					}
					calibratedContextTokens =
						toolSchemaTokens +
						baseSystemPromptTokens +
						Math.round(
							(rawEstimatedTokens + observationTokens) * calibrationRatio,
						)
				}
			}

			if (calibratedContextTokens > MAX_HISTORY_TOKENS) {
				let keptTokens =
					toolSchemaTokens +
					baseSystemPromptTokens +
					Math.round(observationTokens * calibrationRatio)
				// Ensure at least the last 4 messages (recent 2 turns) are immune from folding
				const maxFoldIndex = Math.max(0, coreMessages.length - 4)
				let startIndex = maxFoldIndex
				for (let i = coreMessages.length - 1; i >= 0; i--) {
					const rawTokens =
						messageTokens[i] !== undefined
							? messageTokens[i]
							: estimateMessageTokens(coreMessages[i])
					const calibratedMsgTokens = Math.round(rawTokens * calibrationRatio)
					if (
						i < maxFoldIndex &&
						keptTokens + calibratedMsgTokens > MAX_HISTORY_TOKENS
					) {
						break
					}
					keptTokens += calibratedMsgTokens
					startIndex = i
				}
				startIndex = Math.min(startIndex, maxFoldIndex)

				// If startIndex points to a tool result without its tool call, advance to next user message
				while (
					startIndex < coreMessages.length &&
					coreMessages[startIndex].role === "tool"
				) {
					startIndex++
				}

				if (startIndex > 0 && startIndex < coreMessages.length) {
					const foldedMessages = coreMessages.slice(0, startIndex)

					// Resolve initialUserGoal: prioritize persistent thread metadata,
					// or extract the first real user message (ignoring previous [System Note] or [Context Advisory])
					let initialUserGoal = ""
					try {
						const threadRec = await store.getThreadById({ threadId })
						if ((threadRec?.metadata as any)?.rootUserGoal) {
							initialUserGoal = (threadRec.metadata as any).rootUserGoal
						}
					} catch {}

					if (!initialUserGoal) {
						const firstRealUserMsg = coreMessages.find((m) => {
							if (m.role !== "user") return false
							const text =
								typeof m.content === "string"
									? m.content
									: Array.isArray(m.content)
										? m.content.find((p: any) => p.type === "text")?.text || ""
										: ""
							return (
								!text.startsWith("[System Note:") &&
								!text.startsWith("[Context Advisory:")
							)
						})
						if (firstRealUserMsg) {
							const rawText =
								typeof firstRealUserMsg.content === "string"
									? firstRealUserMsg.content
									: Array.isArray(firstRealUserMsg.content)
										? firstRealUserMsg.content.find(
												(p: any) => p.type === "text",
											)?.text || ""
										: ""
							initialUserGoal = rawText.trim()
						}
					}

					// Collect all message IDs already covered by existing folded ranges to prevent duplication
					const newlyFoldedMessages = foldedMessages.filter((m) => {
						if (!m.id) return false
						if (allAlreadyFoldedIds.has(m.id)) return false
						if (
							m.role === "user" &&
							typeof m.content === "string" &&
							m.content.startsWith("[System Note:")
						) {
							return false
						}
						if (m.role === "tool" && Array.isArray(m.content)) {
							const hasRfm = m.content.some(
								(p: any) =>
									p.toolName === "retrieve_folded_messages" ||
									p.name === "retrieve_folded_messages",
							)
							if (hasRfm) return false
						}
						return true
					})

					let rangeId: string
					if (newlyFoldedMessages.length === 0 && existingRanges.length > 0) {
						// All messages are already covered in existing ranges; reuse latest range ID without duplicate writes
						rangeId = existingRanges[existingRanges.length - 1].rangeId
					} else {
						let maxIndex = 0
						for (const r of existingRanges) {
							const match = r.rangeId.match(/^fold_(\d+)$/)
							if (match) {
								const num = parseInt(match[1], 10)
								if (!isNaN(num) && num > maxIndex) maxIndex = num
							}
						}
						rangeId = `fold_${String(maxIndex + 1).padStart(3, "0")}`
						const targetFolded =
							newlyFoldedMessages.length > 0
								? newlyFoldedMessages
								: foldedMessages.filter(
										(m) =>
											m.id &&
											!(
												m.role === "user" &&
												typeof m.content === "string" &&
												m.content.startsWith("[System Note:")
											),
									)
						const messageIds = Array.from(
							new Set(targetFolded.map((m) => m.id).filter(Boolean)),
						)

						await this.recordFoldedRange(
							threadId,
							{
								rangeId,
								threadId,
								messageCount: targetFolded.length,
								startIndex: 0,
								firstMessageId: targetFolded[0]?.id,
								lastMessageId: targetFolded[targetFolded.length - 1]?.id,
								firstMessageCreatedAt: targetFolded[0]?.createdAt,
								lastMessageCreatedAt:
									targetFolded[targetFolded.length - 1]?.createdAt,
								messageIds,
								userGoal: initialUserGoal,
								createdAt: Date.now(),
								messages: targetFolded,
							},
							store,
						)

						for (const mid of messageIds) {
							allAlreadyFoldedIds.add(mid)
						}
					}

					coreMessages.splice(0, startIndex)

					// Remove any existing [System Note] at the top of coreMessages to prevent stacking multiple notes
					while (
						coreMessages.length > 0 &&
						coreMessages[0].role === "user" &&
						typeof coreMessages[0].content === "string" &&
						coreMessages[0].content.startsWith("[System Note:")
					) {
						coreMessages.shift()
					}

					const goalSnippet = initialUserGoal
						? initialUserGoal.slice(0, 300) +
							(initialUserGoal.length > 300 ? "..." : "")
						: ""

					// Observational Memory coordination: if OM is active, acknowledge that high-level
					// decisions are already summarized in Observational Memory above, preventing duplicate summaries.
					const omCoordinationHint = observationBlock
						? " High-level decisions and constraints are preserved in Observational Memory above."
						: ""

					const totalFoldedCount =
						existingRanges.reduce(
							(acc, r) => acc + (r.messageCount || r.messageIds?.length || 0),
							0,
						) +
						(newlyFoldedMessages.length > 0 ? newlyFoldedMessages.length : 0)

					const summaryNote = initialUserGoal
						? `[System Note: Earlier conversation history was truncated and folded into range "${rangeId}" (${totalFoldedCount > 0 ? totalFoldedCount : startIndex} messages folded) to stay within token context limits. Original User Task: "${goalSnippet}".${omCoordinationHint} If you need to inspect previous tool outputs, errors, or code from this folded history, call the "retrieve_folded_messages" tool with rangeId "${rangeId}".]`
						: `[System Note: Earlier conversation history was truncated and folded into range "${rangeId}" (${totalFoldedCount > 0 ? totalFoldedCount : startIndex} messages folded) to stay within token context limits.${omCoordinationHint} If you need to inspect previous tool outputs, errors, or code from this folded history, call the "retrieve_folded_messages" tool with rangeId "${rangeId}".]`

					coreMessages.unshift({
						role: "user",
						content: summaryNote,
					})

					// Re-estimate raw message tokens after folding so post-flight token calibration
					// matches the actual messages dispatched to the model rather than the pre-folded count.
					const postFoldEstimate = estimateMessagesTokens(coreMessages)
					rawEstimatedTokens = postFoldEstimate.totalTokens
				}
			}

			// 6. Create assistant message placeholder
			const assistantMessageId = randomUUID()

			threadRunState.currentAssistantMessage = {
				id: assistantMessageId,
				role: "assistant",
				content: [],
				threadId,
				resourceId,
				isStreaming: true,
				createdAt: new Date(),
			}

			this.emit({
				type: "message_start",
				threadId,
				id: assistantMessageId,
				message: {
					id: assistantMessageId,
					role: "assistant",
					content: [],
					isStreaming: true,
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
			// The observation summary rides in the system prompt rather than as a
			// message: a synthetic "user said earlier" turn would be replayed as a
			// real instruction on the next request and could override the actual
			// task, whereas the system prompt is re-sent verbatim each time.
			const instructionsWithMemory = observationBlock
				? `${instructions}\n\n${observationBlock}`
				: instructions
			const graphCtx: GraphExecutionContext = {
				modeId: this._modeId || DEFAULT_EXECUTION_MODE,
				model: activeModel as any,
				modelIdStr,
				instructions: instructionsWithMemory,
				executableTools: activeExecutableTools,
				abortSignal: abortController.signal,
				emit: (ev) => {
					if (ev && typeof ev === "object" && !(ev as any).threadId) {
						;(ev as any).threadId = threadId
					}
					if (ev?.type === "message_update" && ev.message) {
						threadRunState.currentAssistantMessage = {
							...(ev.message as any),
							threadId,
							resourceId,
							durationMs: Date.now() - startTime,
							isStreaming: true,
						}
					}
					this.emit(ev)
				},
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

			// Dynamic token calibration update from actual LanguageModelUsage.
			// Isolates static constants (tool schemas + base system prompt) so calibration
			// exclusively tracks dynamic conversational content (messages + observation memory).
			//
			// Note on Prompt Caching: Provider usage (e.g. usage.inputTokens from Anthropic or OpenAI)
			// reports the total input tokens for the request, including cached and uncached tokens.
			// Preflight estimates similarly estimate the complete input context, so numerator and
			// denominator represent the exact same prompt payload.
			const actualPromptTokens = runResult.tokenUsage?.promptTokens
			let newCalibrationRatio = calibrationRatio
			if (actualPromptTokens && actualPromptTokens > 0) {
				const estimatedConversationalTokens =
					rawEstimatedTokens + observationTokens
				if (estimatedConversationalTokens >= 80) {
					// Subtract invariant structural constants (tool schemas + base system prompt)
					const actualConversationalTokens = Math.max(
						0,
						actualPromptTokens - (toolSchemaTokens + baseSystemPromptTokens),
					)
					const observedRatio =
						actualConversationalTokens / estimatedConversationalTokens
					const clampedObserved = Math.min(Math.max(observedRatio, 0.5), 2.0)
					// Exponential moving average: 50% historical baseline, 50% latest observation.
					// With invariant system prompt and tool schemas completely removed from the denominator,
					// the ratio tracks pure conversational language/format shifts and converges in 1-2 turns.
					newCalibrationRatio =
						Math.round(
							(calibrationRatio * 0.5 + clampedObserved * 0.5) * 1000,
						) / 1000
					this._setTokenCalibration(threadId, newCalibrationRatio)
				}
			}

			// Persist usage, context window and calibration stats to thread metadata
			if (store?.updateThread && store?.getThreadById) {
				try {
					const threadRec = await store.getThreadById({ threadId })
					if (threadRec) {
						await store.updateThread({
							id: threadId,
							metadata: {
								...(threadRec.metadata || {}),
								lastUsage: runResult.tokenUsage,
								tokenCalibrationRatio: newCalibrationRatio,
								contextWindow,
								maxHistoryTokens: MAX_HISTORY_TOKENS,
							},
						})
					}
				} catch (err) {
					console.warn("[Session] Failed to persist usage metadata:", err)
				}
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

			threadRunState.currentAssistantMessage = null

			if (store?.saveMessages) {
				await store.saveMessages({ messages: [assistantDbMessage] })
			}

			// Call memory output processors if registered
			if (memory && typeof (memory as any).getOutputProcessors === "function") {
				try {
					const outputProcessors = await (memory as any).getOutputProcessors(
						[],
						{
							requestContext,
							threadId,
							resourceId,
						},
					)
					for (const processor of outputProcessors) {
						if (typeof processor?.processOutputResult === "function") {
							await processor.processOutputResult({
								messageList: [assistantDbMessage],
								requestContext,
								result: runResult,
							})
						}
					}
				} catch (procErr) {
					console.warn("[Session] Error in memory output processors:", procErr)
				}
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
				threadId,
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
				// Surface the failure in the UI: the renderer listens for this
				// event, shows the error message and ends the run. Without it a
				// failed run only emits agent_end and the session looks like it
				// is still working.
				this.emit({
					type: "error",
					threadId,
					error: { message: err?.message || String(err) },
				})
				if (recorder) {
					recorder.recordRunEnd({
						status: "error",
						error: err?.message || String(err),
					})
				}
			}

			// Call memory error processors if registered
			if (memory && typeof (memory as any).getErrorProcessors === "function") {
				try {
					const errorProcessors = await (memory as any).getErrorProcessors([], {
						requestContext,
						threadId,
						resourceId,
					})
					for (const processor of errorProcessors) {
						if (typeof processor?.processError === "function") {
							await processor.processError({
								error: err,
								requestContext,
								threadId,
								resourceId,
							})
						}
					}
				} catch {}
			}
			const durationMs = Date.now() - startTime

			// Persist partial / interrupted assistant message so history is not blank on crash/abort
			try {
				const partial = threadRunState?.currentAssistantMessage
				const hasContent =
					(Array.isArray(partial?.content) && partial.content.length > 0) ||
					(typeof partial?.content === "string" &&
						partial.content.trim().length > 0)

				if (hasContent) {
					const assistantDbMessage = {
						id: partial?.id || randomUUID(),
						role: "assistant",
						content: partial!.content,
						threadId,
						resourceId,
						createdAt: partial?.createdAt || new Date(),
						durationMs,
					}

					const store = await this.getMemoryStore()
					if (store?.saveMessages) {
						await store.saveMessages({ messages: [assistantDbMessage] })
					}
				}
			} catch (persistErr) {
				console.warn(
					"[Session] Failed to persist interrupted assistant message:",
					persistErr,
				)
			}

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
			this._threadRuns.delete(threadId)
			this._isRunning = this._threadRuns.size > 0
			if (this._activeAbortController === abortController) {
				this._activeAbortController = null
			}
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
