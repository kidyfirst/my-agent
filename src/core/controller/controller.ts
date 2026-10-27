import { randomUUID } from "node:crypto"
import { stepCountIs, streamText, wrapLanguageModel } from "ai"
import { RequestContext } from "../context/index.js"
import { toModelTool } from "../tools/ai-tool.js"
import type { Agent, MyAgentMessagePart } from "../agent/index.js"

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

export interface HarnessMode {
	id: string
	name: string
	defaultModelId?: string
	metadata?: Record<string, unknown>
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
		this.defaultModeId = config.defaultModeId || "build"
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
		this._modeId = config.defaultModeId || "build"
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

	private async getMemoryStore(): Promise<any> {
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
				const threadObj = {
					id: threadId,
					title,
					resourceId: this.resourceId,
					createdAt: new Date(),
					updatedAt: new Date(),
					metadata: opts?.metadata || {},
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
			getRules: () => ({
				categories: { ...this._categoryPolicies },
				tools: { ...this._toolPolicies },
			}),
		}
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
			requestContext.set("controller", this.controller)
			requestContext.set("harness", this.controller)
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
			const model = await agent.getModel({ requestContext })
			const rawTools = await agent.listTools({ requestContext })

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
							result = await origTool.execute(
								{ ...args, context: toolContext },
								toolContext,
							)
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
					let userText = ""
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
								userText = (userText ? userText + "\n" : "") + p.text
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
							userText = m.content
						} else if (m.content?.content) {
							userText =
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
						if (!userText.includes("[Attached image:")) {
							userText = userText ? `${userText}\n\n${note}` : note
						}
					}

					userText = userText.trim()
					if (parts.length > 0) {
						if (userText) {
							parts.unshift({ type: "text", text: userText })
						}
						coreMessages.push({ role: "user", content: parts })
					} else if (userText) {
						coreMessages.push({ role: "user", content: userText })
					}
				} else {
					let text = ""
					if (typeof m.content === "string") {
						text = m.content
					} else if (m.content?.content) {
						text =
							typeof m.content.content === "string" ? m.content.content : ""
					} else if (Array.isArray(m.content?.parts)) {
						text = m.content.parts.map((p: any) => p.text || "").join("")
					}
					text = text.trim()
					if (!text) continue
					coreMessages.push({ role: "assistant", content: text })
				}
			}

			// 6. Create assistant message placeholder
			const assistantMessageId = randomUUID()
			let assistantText = ""
			let reasoningText = ""

			this.emit({
				type: "message_start",
				id: assistantMessageId,
				message: {
					id: assistantMessageId,
					role: "assistant",
					content: [],
				},
			})

			// 7. Run AI streamText
			// The AI SDK dropped `maxSteps` in favour of `stopWhen`; without it the
			// run stops after a single model call, so a tool call would never be
			// followed by the assistant's answer.
			// Wrap model to guarantee v3/v4 file part compatibility (avoiding null serialization).
			// `modelIdStr` also decides how image parts are shaped: providers built on
			// AI SDK v4 (DeepSeek) only understand the legacy `image` part and serialize
			// anything newer as `null`, which the API rejects with a 400.
			const legacyImageParts = modelIdStr.includes("deepseek")
			const effectiveModel = wrapLanguageModel({
				model: model as any,
				middleware: {
					specificationVersion: "v3",
					transformParams: async ({ params }) => {
						if (Array.isArray(params.prompt)) {
							for (const msg of params.prompt) {
								if (!Array.isArray(msg.content)) continue
								for (const part of msg.content) {
									if (part.type === "file" && typeof part.data === "string") {
										;(part as any).data = { type: "data", data: part.data }
									}
									if (legacyImageParts && (part as any).type === "image") {
										// `image_url` -> `image`: the OpenAI-compatible
										// adapter rebuilds the data URL from base64 + mediaType.
										const url = (part as any).image_url
										if (typeof url === "string" && url.startsWith("data:")) {
											const comma = url.indexOf(",")
											const header = url.slice(5, comma)
											;(part as any).image = url.slice(comma + 1)
											;(part as any).mediaType =
												header.split(";")[0] || "image/png"
											delete (part as any).image_url
										}
									}
								}
							}
						}
						return params
					},
				},
			})

			const streamRes = (streamText as any)({
				model: effectiveModel,
				system: instructions,
				messages: coreMessages,
				tools:
					Object.keys(executableTools).length > 0 ? executableTools : undefined,
				stopWhen: stepCountIs(50),
				abortSignal: abortController.signal,
			})

			const buildCurrentContent = (): {
				parts: MyAgentMessagePart[]
				cleanText: string
				hasThinking: boolean
			} => {
				const parts: MyAgentMessagePart[] = []
				let finalCleanText = assistantText
				let activeThinking = reasoningText

				// If no structured reasoning, check if assistantText has embedded <think> tags
				if (!activeThinking && assistantText.includes("<think")) {
					const tagRegex =
						/<(think|thought|reasoning|thinking)>([\s\S]*?)<\/\1>/gi
					const extracted: string[] = []
					const withoutClosed = assistantText.replace(tagRegex, (_m, _t, c) => {
						const trimmed = String(c || "").trim()
						if (trimmed) extracted.push(trimmed)
						return ""
					})
					const unclosedMatch = withoutClosed.match(
						/<(think|thought|reasoning|thinking)>([\s\S]*)$/i,
					)
					if (unclosedMatch) {
						const unclosed = String(unclosedMatch[2] || "").trim()
						if (unclosed) extracted.push(unclosed)
						finalCleanText = withoutClosed.slice(0, unclosedMatch.index).trim()
					} else {
						finalCleanText = withoutClosed.trim()
					}
					if (extracted.length > 0) {
						activeThinking = extracted.join("\n\n")
					}
				}

				if (activeThinking) {
					parts.push({
						type: "thinking",
						thinking: activeThinking,
						text: activeThinking,
					})
				}
				for (const t of executedTools) {
					parts.push({
						type: "tool-call",
						toolCallId: t.id,
						toolName: t.name,
						args: t.args,
					} as any)
					if (t.result !== undefined) {
						parts.push({
							type: "tool-result",
							toolCallId: t.id,
							toolName: t.name,
							result: t.result,
							isError: t.isError,
						} as any)
					}
				}
				if (finalCleanText) {
					parts.push({
						type: "text",
						text: finalCleanText,
					})
				}
				return {
					parts,
					cleanText: finalCleanText,
					hasThinking: Boolean(activeThinking),
				}
			}

			for await (const chunk of streamRes.fullStream) {
				if (abortController.signal.aborted) break
				// Stream failures (bad credentials, provider 4xx, network) arrive as
				// `error` parts and the stream then completes normally. Rethrow so the
				// send fails loudly instead of persisting an empty assistant message.
				if (chunk.type === "error") {
					throw chunk.error instanceof Error
						? chunk.error
						: new Error(String(chunk.error))
				}
				if (chunk.type === "finish") {
					const usage = (chunk as any).totalUsage ?? (chunk as any).usage
					if (usage) {
						this._tokenUsage = {
							promptTokens:
								this._tokenUsage.promptTokens + (usage.inputTokens ?? 0),
							completionTokens:
								this._tokenUsage.completionTokens + (usage.outputTokens ?? 0),
							totalTokens:
								this._tokenUsage.totalTokens + (usage.totalTokens ?? 0),
						}
					}
				}
				if (
					chunk.type === "reasoning-delta" ||
					chunk.type === "reasoning" ||
					(chunk.type as string) === "reasoning-content"
				) {
					const delta =
						(chunk as any).delta ||
						(chunk as any).textDelta ||
						(chunk as any).text ||
						""
					if (delta) {
						reasoningText += delta
						this.emit({
							type: "message_delta",
							id: assistantMessageId,
							delta: "",
							reasoningDelta: delta,
						})
						const { parts } = buildCurrentContent()
						this.emit({
							type: "message_update",
							id: assistantMessageId,
							message: {
								id: assistantMessageId,
								role: "assistant",
								content: parts,
							},
						})
					}
				} else if (chunk.type === "tool-call") {
					const toolCallId = (chunk as any).toolCallId
					const existing = executedTools.find((t) => t.id === toolCallId)
					if (!existing) {
						executedTools.push({
							id: toolCallId,
							name: (chunk as any).toolName,
							args: (chunk as any).args,
						})
					}
					const { parts } = buildCurrentContent()
					this.emit({
						type: "message_update",
						id: assistantMessageId,
						message: {
							id: assistantMessageId,
							role: "assistant",
							content: parts,
						},
					})
				} else if (chunk.type === "tool-result") {
					const toolCallId = (chunk as any).toolCallId
					const existing = executedTools.find((t) => t.id === toolCallId)
					if (existing) {
						existing.result = (chunk as any).result
						existing.isError = (chunk as any).isError
					} else {
						executedTools.push({
							id: toolCallId,
							name: (chunk as any).toolName,
							args: (chunk as any).args,
							result: (chunk as any).result,
							isError: (chunk as any).isError,
						})
					}
					const { parts } = buildCurrentContent()
					this.emit({
						type: "message_update",
						id: assistantMessageId,
						message: {
							id: assistantMessageId,
							role: "assistant",
							content: parts,
						},
					})
				} else if (chunk.type === "text-delta") {
					const delta = (chunk as any).textDelta || (chunk as any).text || ""
					assistantText += delta
					this.emit({
						type: "message_delta",
						id: assistantMessageId,
						delta,
					})
					const { parts } = buildCurrentContent()
					this.emit({
						type: "message_update",
						id: assistantMessageId,
						message: {
							id: assistantMessageId,
							role: "assistant",
							content: parts,
						},
					})
				}
			}

			const durationMs = Date.now() - startTime
			const { parts: finalParts, cleanText: finalCleanText } =
				buildCurrentContent()

			// 8. Persist assistant message with durationMs
			const assistantDbMessage = {
				id: assistantMessageId,
				role: "assistant",
				content: {
					format: 2,
					parts:
						finalParts.length > 0
							? finalParts
							: [{ type: "text", text: assistantText }],
					content: finalCleanText || assistantText,
					reasoning: reasoningText || undefined,
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
			} else {
				console.error("[Session] Error during sendMessage:", err)
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
