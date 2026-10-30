import fs from "node:fs"
import path from "node:path"

// Suppress benign AI SDK warning banners
;(globalThis as any).AI_SDK_LOG_WARNINGS = false
import {
	AgentController as Harness,
	Session,
	Agent,
	type HarnessConfig,
	type HarnessDisplayState,
	type HarnessEvent,
	type HarnessMode,
	type HarnessRequestContext,
	type HarnessSubagent,
	type HarnessThread,
	type AvailableModel,
	type IntervalHandler,
	type PermissionPolicy,
	type TokenUsage,
	type ToolCategory,
	RequestContext,
	defaultGraphRegistry,
	ExecutionMode,
	DEFAULT_EXECUTION_MODE,
	type GraphTopologyMetadata,
} from "../core/index.js"

export { Harness }
export type {
	Session,
	HarnessConfig,
	HarnessDisplayState,
	HarnessEvent,
	HarnessMode,
	HarnessRequestContext,
	HarnessSubagent,
	HarnessThread,
	AvailableModel,
	IntervalHandler,
	PermissionPolicy,
	TokenUsage,
	ToolCategory,
}
import { Memory } from "../memory/index.js"
import { SQLiteStore } from "../store/index.js"
import { AuthStorage } from "../auth/storage.js"
import { MCPManager } from "../mcp/manager.js"
import type { McpServerStatus } from "../mcp/types.js"
import { HookManager } from "../hooks/manager.js"
import {
	detectProject,
	getStorageConfig,
	getDatabasePath,
	getResourceIdOverride,
	getOmScope,
	type StorageConfig,
} from "../utils/project.js"
import { getRecentProjectLastThread } from "../utils/recent-projects.js"
import { syncGateways } from "../utils/gateway-sync.js"
import {
	getToolCategory,
	getRuntimeYolo,
	getRuntimeCategoryPolicies,
	setRuntimeCategoryPolicy,
} from "../permissions.js"
import {
	stateSchema,
	DEFAULT_OM_MODEL_ID,
	DEFAULT_OBS_THRESHOLD,
	DEFAULT_REF_THRESHOLD,
	type HarnessState,
} from "./state.js"
import {
	loadSettings,
	saveSettings,
	acquireThreadLock,
	releaseThreadLock,
} from "./settings.js"
import {
	createModelResolver,
	createDynamicModelGetter,
} from "./model-resolver.js"
import { getDynamicWorkspace } from "./workspace.js"
import { createDynamicTools } from "./tools.js"
import { getDynamicInstructions } from "./instructions.js"
import { createDefaultSubagents } from "./subagents.js"
import {
	resolveDefaultModel,
	CURATED_CHAT_MODELS,
} from "../constants/models.js"

export interface ControllerMessageLike {
	id?: string
	role?: string
	type?: string
	content?: unknown
	createdAt?: string
	metadata?: Record<string, unknown>
	[key: string]: unknown
}

export function normalizeControllerMessage(
	m: unknown,
): ControllerMessageLike | unknown {
	if (!m || typeof m !== "object") return m
	const record = m as Record<string, unknown>
	let role = (record.role as string | undefined) ?? ""
	const type = record.type as string | undefined
	let content = record.content

	if (typeof content === "string") {
		const trimmed = content.trim()
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				content = JSON.parse(trimmed)
			} catch {}
		}
	}

	if (content && typeof content === "object") {
		const signal = (
			content as { metadata?: { signal?: Record<string, unknown> } }
		)?.metadata?.signal
		if (
			signal?.type === "user" ||
			signal?.tagName === "user" ||
			signal?.type === "data-user-message" ||
			signal?.type === "text" ||
			type === "user" ||
			type === "data-user-message"
		) {
			role = "user"
		}
	}

	if (role === "signal") {
		if (type === "user" || type === "data-user-message") {
			role = "user"
		} else if (type === "system") {
			role = "system"
		}
	}

	const attachments =
		record.attachments ||
		(content && typeof content === "object"
			? (content as any).attachments
			: undefined)

	return {
		...record,
		role,
		content,
		...(attachments ? { attachments } : {}),
	}
}

export interface HarnessSessionInfo {
	id: string
	resourceId: string
	currentThreadId: string | null
	currentModeId: string
	currentModelId: string
	threads: HarnessThread[]
}

export interface SendMessageFile {
	data: string
	mediaType: string
	filename?: string
	[key: string]: unknown
}

export interface SendMessageOptions {
	content: string
	files?: SendMessageFile[]
	requestContext?: RequestContext
	[key: string]: unknown
}

export interface SteerOptions {
	content: string
	files?: SendMessageFile[]
	requestContext?: RequestContext
}

export interface FollowUpOptions {
	content: string
	files?: SendMessageFile[]
	requestContext?: RequestContext
}

export interface PermissionRulesResult {
	categories: Record<string, string>
	tools: Record<string, string>
}

export interface SessionGrantsResult {
	categories: string[]
	tools: string[]
}

export interface AvailableModelItem {
	id: string
	name?: string
	modelName?: string
	provider?: string
	hasApiKey?: boolean
	hasAuth?: boolean
	useCount?: number
	[key: string]: unknown
}

export interface QueuedMessage {
	id: string
	threadId: string | null
	content: string
	files?: SendMessageFile[]
	createdAt: string
	[key: string]: unknown
}

export interface ToolApprovalOptions {
	decision?: "approve" | "decline" | "always_allow_category"
	approved?: boolean
	toolCallId?: string
	requestContext?: RequestContext
	declineContext?: {
		reason?: string
		message?: string
	}
	[key: string]: unknown
}

export interface PlanApprovalOptions {
	planId?: string
	response?: string | { action: "approved" | "rejected"; feedback?: string }
	approved?: boolean
	feedback?: string
	[key: string]: unknown
}

export interface AskQuestionEvent {
	type: "ask_question"
	question?: string
	[key: string]: unknown
}

export interface PlanApprovalRequiredEvent {
	type: "plan_approval_required"
	title?: string
	[key: string]: unknown
}

export type MyAgentEvent =
	| HarnessEvent
	| AskQuestionEvent
	| PlanApprovalRequiredEvent

export interface MyAgentHarness<TState = HarnessState> {
	id: string
	controller: Harness<TState>
	activeSession?: Session<TState> | null
	init(): Promise<void>
	subscribe(listener: (event: MyAgentEvent) => void): () => void
	emitEvent?(event: MyAgentEvent): void
	sendMessage(options: SendMessageOptions): Promise<void>
	abort(): Promise<void>
	steer(options: SteerOptions): Promise<void>
	followUp(options: FollowUpOptions): Promise<void>
	getState(): TState & Record<string, unknown>
	setState(patch: Partial<TState>): Promise<void>
	listModes(): HarnessMode[]
	listExecutionModes?(): GraphTopologyMetadata[]
	getModeGraph?(options: { modeId: string }): GraphTopologyMetadata | undefined
	getCurrentModeId(): string
	switchMode(options: { modeId: string }): Promise<void>
	getCurrentModelId(): string
	getFullModelId(): string
	switchModel(
		options:
			| {
					modelId: string
					scope?: string
					modeId?: string
			  }
			| string,
	): Promise<void>
	switchObserverModel(options: { modelId: string }): Promise<void>
	switchReflectorModel(options: { modelId: string }): Promise<void>
	getCurrentThreadId(): string
	createThread(options?: {
		title?: string
		metadata?: Record<string, unknown>
	}): Promise<HarnessThread | null>
	switchThread(options: { threadId: string }): Promise<void>
	renameThread(options: { threadId?: string; title: string }): Promise<void>
	deleteThread(options: { threadId: string }): Promise<void>
	listThreads(): Promise<HarnessThread[]>
	listMessages(options?: {
		threadId?: string
		limit?: number
	}): Promise<ControllerMessageLike[]>
	getTokenUsage(): TokenUsage
	getDisplayState(): HarnessDisplayState
	isRunning(): boolean
	respondToToolApproval(options: ToolApprovalOptions): unknown
	respondToQuestion(options: { questionId: string; answer: string }): void
	registerQuestion?(options: {
		questionId: string
		resolve: (ans: string) => void
	}): void
	registerPlanApproval?(options: {
		planId: string
		resolve: (response: {
			action: "approved" | "rejected"
			feedback?: string
		}) => void
	}): void
	respondToPlanApproval(options: PlanApprovalOptions): Promise<void> | void
	listAvailableModels(): AvailableModelItem[] | Promise<AvailableModelItem[]>
	loadOMProgress?(): Promise<unknown>
	setPermissionForCategory(options: { category: string; policy: string }): void
	getPermissionRules(): PermissionRulesResult
	getSessionGrants(): SessionGrantsResult
	/**
	 * Names of the tools the connected MCP servers registered (already namespaced
	 * as `server_tool`). The system prompt lists them so the model knows it can
	 * look things up instead of claiming it has no web access.
	 */
	getMcpToolNames?(): string[]
	/**
	 * Connection state of every configured MCP server. The prompt uses it to
	 * separate "key saved but the server rejected it" from "no key yet" — the two
	 * failures look identical to the model otherwise, and it guesses wrong.
	 */
	getMcpServerStatuses?(): McpServerStatus[]
	grantSessionCategory(options: { category: string }): void
	getSession(): Promise<HarnessSessionInfo>
	getMessageQueue(options: { threadId: string }): Promise<QueuedMessage[]>
	setMessageQueue(options: {
		threadId: string
		queue: QueuedMessage[]
	}): Promise<void>
}

export interface MyAgentConfig<TState = HarnessState> {
	/** Working directory for project detection. Default: process.cwd() */
	cwd?: string
	/** Override modes (model IDs, colors, which modes exist). Default: build/plan/fast */
	modes?: HarnessMode[]
	/** Override or extend subagent definitions. Default: explore/plan/execute */
	subagents?: HarnessSubagent[]
	/** Extra tools merged into the dynamic tool set. */
	extraTools?:
		| Record<string, unknown>
		| ((ctx: { requestContext: RequestContext }) => Record<string, unknown>)
	/** Custom storage config instead of auto-detected default */
	storage?: StorageConfig | SQLiteStore
	/** Initial state overrides (yolo, thinkingLevel, etc.) */
	initialState?: Partial<TState>
	/** Override heartbeat/interval handlers. Default: gateway-sync */
	heartbeatHandlers?: IntervalHandler[]
	intervalHandlers?: IntervalHandler[]
	/** Override the workspace */
	workspace?: (ctx: {
		requestContext: RequestContext
	}) => Promise<unknown> | unknown
	/** Disable MCP server discovery. Default: false */
	disableMcp?: boolean
	/** Disable hooks. Default: false */
	disableHooks?: boolean
	/** Custom model resolver. Default: createModelResolver(authStorage) */
	resolveModel?:
		| ReturnType<typeof createModelResolver>
		| ((modelId: string, options?: any) => any)
}

function getDynamicMemory(
	storage: SQLiteStore,
	resolveModel: ReturnType<typeof createModelResolver>,
) {
	let cachedMemory: Memory | null = null
	let cachedMemoryKey: string | null = null

	return (opts?: { requestContext?: RequestContext }) => {
		const reqCtx = opts?.requestContext
		const harnessContext = (reqCtx?.get?.("controller") ||
			reqCtx?.get?.("harness")) as
			| { state?: HarnessState; getState?: () => HarnessState }
			| undefined
		const state = harnessContext?.state ?? harnessContext?.getState?.()
		const omScope = getOmScope(state?.projectPath)
		const obsThreshold = state?.observationThreshold ?? DEFAULT_OBS_THRESHOLD
		const refThreshold = state?.reflectionThreshold ?? DEFAULT_REF_THRESHOLD
		const cacheKey = `${obsThreshold}:${refThreshold}:${omScope}`
		if (cachedMemory && cachedMemoryKey === cacheKey) {
			return cachedMemory
		}

		cachedMemory = new Memory({
			storage,
			options: {
				observationalMemory: {
					enabled: true,
					scope: omScope,
					observation: {
						bufferTokens: 1 / 5,
						bufferActivation: 2000,
						model: ({
							requestContext: reqCtx,
						}: {
							requestContext: RequestContext
						}) => {
							const ctx = (reqCtx.get("controller") ||
								reqCtx.get("harness")) as
								| { state?: HarnessState; getState?: () => HarnessState }
								| undefined
							const s = ctx?.state ?? ctx?.getState?.()
							return resolveModel(s?.observerModelId ?? DEFAULT_OM_MODEL_ID, {
								remapForCodexOAuth: true,
							})
						},
						messageTokens: obsThreshold,
						blockAfter: 2,
					},
					reflection: {
						bufferActivation: 1 / 2,
						blockAfter: 1.1,
						model: ({
							requestContext: reqCtx,
						}: {
							requestContext: RequestContext
						}) => {
							const ctx = (reqCtx.get("controller") ||
								reqCtx.get("harness")) as
								| { state?: HarnessState; getState?: () => HarnessState }
								| undefined
							const s = ctx?.state ?? ctx?.getState?.()
							return resolveModel(s?.reflectorModelId ?? DEFAULT_OM_MODEL_ID, {
								remapForCodexOAuth: true,
							})
						},
						observationTokens: refThreshold,
					},
				},
			},
		})
		cachedMemoryKey = cacheKey
		return cachedMemory
	}
}

export interface CreateMyAgentResult {
	harness: MyAgentHarness
	mcpManager?: MCPManager
	hookManager?: HookManager
	authStorage: AuthStorage
	resolveModel: ReturnType<typeof createModelResolver>
	storageWarning?: string
}

export async function createMyAgent(
	config?: MyAgentConfig,
): Promise<CreateMyAgentResult> {
	const cwd = config?.cwd ?? process.cwd()
	const authStorage = new AuthStorage()

	const project = detectProject(cwd)
	const resourceIdOverride = getResourceIdOverride(project.rootPath)
	if (resourceIdOverride) {
		project.resourceId = resourceIdOverride
		project.resourceIdOverride = true
	}

	const storageConfig: StorageConfig | undefined =
		config?.storage && !(config.storage instanceof SQLiteStore)
			? config.storage
			: getStorageConfig(project.rootPath)
	const dbUrl =
		config?.storage instanceof SQLiteStore
			? undefined
			: (storageConfig?.url ?? `file:${getDatabasePath()}`)
	if (dbUrl && dbUrl.startsWith("file:") && !dbUrl.includes(":memory:")) {
		const filePath = dbUrl.slice(5)
		const dir = path.dirname(filePath)
		try {
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
		} catch {}
	}
	const storage =
		config?.storage instanceof SQLiteStore
			? config.storage
			: new SQLiteStore({
					id: "myagent-storage",
					url: dbUrl!,
					...(storageConfig?.authToken
						? { authToken: storageConfig.authToken }
						: {}),
				})
	const storageWarning: string | undefined = undefined

	const resolveModel =
		(config?.resolveModel as ReturnType<typeof createModelResolver>) ??
		createModelResolver(authStorage)
	const memory = getDynamicMemory(storage, resolveModel)
	const mcpManager = config?.disableMcp
		? undefined
		: new MCPManager(project.rootPath)

	// Warm the connection right away. `getTools()` is synchronous, so a manager
	// that only dials on first use hands the very first turn an empty MCP
	// toolset — the one turn where the user is most likely to ask something that
	// needs the web. The promise is deliberately not awaited: harness creation
	// must not wait on the network.
	if (mcpManager) void mcpManager.init().catch(() => {})

	const codeAgent = new Agent({
		id: "code-agent",
		name: "Code Agent",
		instructions: getDynamicInstructions,
		model: createDynamicModelGetter(resolveModel, authStorage),
		tools: createDynamicTools(
			mcpManager,
			config?.extraTools as Record<string, unknown>,
		),
	})

	const hookManager = config?.disableHooks
		? undefined
		: new HookManager(project.rootPath, "session-init")

	const modeDefaults = loadSettings().models?.modeDefaults
	const configuredReactModel =
		modeDefaults?.[ExecutionMode.REACT] || modeDefaults?.build
	let defaultModelId: string | undefined
	if (configuredReactModel) {
		const provider = configuredReactModel.split("/")[0] || ""
		let authProvider = provider === "openai" ? "openai-codex" : provider
		if (configuredReactModel.startsWith("deepseek")) authProvider = "deepseek"
		else if (configuredReactModel.startsWith("google")) authProvider = "google"
		if (authStorage.isLoggedIn(authProvider)) {
			defaultModelId = configuredReactModel
		}
	}
	if (!defaultModelId) {
		defaultModelId = resolveDefaultModel((p) => authStorage.isLoggedIn(p))
	}

	const defaultSubagents = createDefaultSubagents(project.rootPath)
	const defaultModes: HarnessMode[] = [
		{
			id: ExecutionMode.REACT,
			name: "ReAct",
			defaultModelId,
			metadata: { default: true },
			topology: defaultGraphRegistry.getTopology(ExecutionMode.REACT),
		},
		{
			id: ExecutionMode.PLAN,
			name: "Plan & Solve",
			defaultModelId,
			topology: defaultGraphRegistry.getTopology(ExecutionMode.PLAN),
		},
		{
			id: ExecutionMode.FAST,
			name: "Fast",
			defaultModelId,
			topology: defaultGraphRegistry.getTopology(ExecutionMode.FAST),
		},
	]

	const defaultHeartbeatHandlers: IntervalHandler[] = [
		{
			id: "gateway-sync",
			intervalMs: 5 * 60 * 1000,
			handler: () => syncGateways(),
		},
	]

	const modes = config?.modes ?? defaultModes
	const subagents = config?.subagents ?? defaultSubagents
	const intervalHandlers =
		config?.intervalHandlers ??
		config?.heartbeatHandlers ??
		defaultHeartbeatHandlers

	const controller = new Harness<HarnessState>({
		id: "myagent-code",
		agent: codeAgent,
		defaultModeId: ExecutionMode.REACT,
		resourceId: project.resourceId,
		storage,
		memory,
		stateSchema,
		subagents,
		modes,
		intervalHandlers,
		workspace: config?.workspace ?? getDynamicWorkspace,
		toolCategoryResolver: getToolCategory,
		initialState: {
			projectPath: project.rootPath,
			projectName: project.name,
			gitBranch: project.gitBranch,
			yolo: getRuntimeYolo(),
			...config?.initialState,
		},
		modelUseCountProvider: () => loadSettings().modelUseCounts,
		modelUseCountTracker: (modelId: string) => {
			try {
				const settings = loadSettings()
				settings.modelUseCounts[modelId] =
					(settings.modelUseCounts[modelId] ?? 0) + 1
				saveSettings(settings)
			} catch (err) {
				console.error("Failed to persist model usage count:", err)
			}
		},
		threadLock: {
			acquire: acquireThreadLock,
			release: releaseThreadLock,
		},
	} as unknown as HarnessConfig<HarnessState>)

	const subscribers = new Set<(event: MyAgentEvent) => void>()
	let activeSession: Session<HarnessState> | null = null
	const pendingQuestions = new Map<string, (ans: string) => void>()
	const pendingPlans = new Map<
		string,
		(response: { action: "approved" | "rejected"; feedback?: string }) => void
	>()
	const categoryPolicies: Record<string, string> = {}

	const sessionReady = controller
		.createSession({ resourceId: project.resourceId })
		.then(async (s: Session<HarnessState>) => {
			activeSession = s
			const currentSessionModelId = s.state?.get?.()?.currentModelId
			if (!currentSessionModelId) {
				await s.state?.set?.({ currentModelId: defaultModelId })
			}
			// Re-apply the process-wide permission mode: a session created before
			// the renderer sent its mode (or a new one after a mode change) would
			// otherwise fall back to the gate's "ask" default for every tool.
			const runtimePolicies = getRuntimeCategoryPolicies()
			for (const [category, policy] of Object.entries(runtimePolicies)) {
				try {
					await s.permissions.setForCategory({
						category: category as ToolCategory,
						policy: policy as PermissionPolicy,
					})
				} catch (e) {
					console.error("Failed to apply permission policy:", e)
				}
			}
			const runtimeYolo = getRuntimeYolo()
			if (s.state?.get?.()?.yolo !== runtimeYolo) {
				await s.state?.set?.({ yolo: runtimeYolo })
			}
			const knownMessages = new Map<string, ControllerMessageLike>()
			s.subscribe((event: HarnessEvent) => {
				const eventMessage = (event as { message?: ControllerMessageLike })
					.message
				if (eventMessage?.id) {
					const normalized = normalizeControllerMessage(
						eventMessage,
					) as ControllerMessageLike
					;(event as { message?: ControllerMessageLike }).message = normalized
					knownMessages.set(eventMessage.id, normalized)
				}
				// Normalize message events for UI compatibility
				if (event.type === "message_end" && !eventMessage) {
					const eventId = (event as { id?: string }).id
					const existing = eventId ? knownMessages.get(eventId) : undefined
					;(event as { message?: ControllerMessageLike }).message =
						existing || {
							id: eventId || "unknown",
							role: "assistant",
							content: [],
						}
				} else if (event.type === "message_update" && !eventMessage) {
					const eventId = (event as { id?: string }).id
					const existing = eventId ? knownMessages.get(eventId) : undefined
					;(event as { message?: ControllerMessageLike }).message =
						existing || {
							id: eventId || "unknown",
							role: "assistant",
							content: [],
						}
				}
				for (const sub of subscribers) {
					try {
						sub(event)
					} catch (e) {
						console.error("Event subscriber error:", e)
					}
				}
			})
			return s
		})

	const adapter: MyAgentHarness = {
		id: "myagent-code",
		controller,
		get activeSession() {
			return activeSession
		},
		async init() {
			await controller.init()
			const session = activeSession ?? (await sessionReady)
			await session.init?.()

			// Restore saved last active thread if present
			const savedThreadId = getRecentProjectLastThread(project.rootPath)
			if (savedThreadId) {
				try {
					const threads = await this.listThreads()
					if (threads && threads.some((t) => t.id === savedThreadId)) {
						await this.switchThread({ threadId: savedThreadId })
						return
					}
				} catch (err) {
					console.warn("Failed to restore saved thread:", err)
				}
			}

			// Otherwise, restore most recent thread if not already set
			if (!this.getCurrentThreadId()) {
				try {
					const threads = await this.listThreads()
					if (threads && threads.length > 0) {
						await this.switchThread({ threadId: threads[0].id })
					}
				} catch (err) {
					console.warn("Failed to restore initial thread:", err)
				}
			}
		},
		subscribe(listener: (event: MyAgentEvent) => void) {
			subscribers.add(listener)
			return () => {
				subscribers.delete(listener)
			}
		},
		emitEvent(event: MyAgentEvent) {
			for (const sub of subscribers) {
				try {
					sub(event)
				} catch (err) {
					console.error("Error in subscriber:", err)
				}
			}
		},
		async sendMessage(options: SendMessageOptions) {
			const session = activeSession ?? (await sessionReady)
			const rc = options.requestContext ?? new RequestContext()
			if (!rc.get("harness")) {
				rc.set("harness", this)
			}
			if (!rc.get("controller")) {
				rc.set("controller", this)
			}
			return session.sendMessage({ ...options, requestContext: rc })
		},
		async abort() {
			for (const resolver of pendingPlans.values()) {
				try {
					resolver({ action: "rejected", feedback: "Operation aborted" })
				} catch {}
			}
			pendingPlans.clear()
			for (const resolver of pendingQuestions.values()) {
				try {
					resolver("Operation aborted")
				} catch {}
			}
			pendingQuestions.clear()
			const session = activeSession ?? (await sessionReady)
			return session.abort()
		},
		async steer(options: SteerOptions) {
			const session = activeSession ?? (await sessionReady)
			return session.steer?.(options)
		},
		async followUp(options: FollowUpOptions) {
			const session = activeSession ?? (await sessionReady)
			return session.followUp?.(options)
		},
		getState(): HarnessState & Record<string, unknown> {
			const sessionState = (activeSession?.state?.get?.() ??
				{}) as Partial<HarnessState>
			const currentModel = this.getCurrentModelId()
			return {
				projectPath: project.rootPath,
				projectName: project.name,
				gitBranch: project.gitBranch,
				yolo: getRuntimeYolo(),
				...config?.initialState,
				...sessionState,
				currentModelId: sessionState.currentModelId || currentModel,
				currentModeId: this.getCurrentModeId(),
			} as HarnessState & Record<string, unknown>
		},
		async setState(patch: Partial<HarnessState>) {
			const session = activeSession ?? (await sessionReady)
			await session.state?.set?.(patch)
		},
		listModes() {
			return controller.listModes?.() ?? modes
		},
		listExecutionModes() {
			return defaultGraphRegistry.listTopologies()
		},
		getModeGraph(options: { modeId: string }) {
			return defaultGraphRegistry.getTopology(options.modeId)
		},
		getCurrentModeId() {
			return activeSession?.mode?.get?.() ?? ExecutionMode.REACT
		},
		async switchMode(options: { modeId: string }) {
			const session = activeSession ?? (await sessionReady)
			await session.mode?.switch?.(options)
		},
		getCurrentModelId() {
			const m = activeSession?.model?.get?.()
			if (typeof m === "string" && m) return m
			if (m && typeof m === "object" && (m as { modelId?: string }).modelId) {
				return (m as { modelId: string }).modelId
			}
			const sessionState = activeSession?.state?.get?.()
			if (sessionState?.currentModelId) {
				const sm = sessionState.currentModelId
				if (typeof sm === "string") return sm
				if (typeof sm === "object" && (sm as { modelId?: string })?.modelId) {
					return (sm as { modelId: string }).modelId
				}
			}
			return defaultModelId
		},
		getFullModelId() {
			return this.getCurrentModelId()
		},
		async switchModel(
			options:
				| {
						modelId: string
						scope?: string
						modeId?: string
				  }
				| string,
		) {
			const session = activeSession ?? (await sessionReady)
			const targetModelId =
				typeof options === "string" ? options : options.modelId
			await session.model?.switch?.(targetModelId)
			await session.state?.set?.({ currentModelId: targetModelId })
		},
		async switchObserverModel(options: { modelId: string }) {
			const session = activeSession ?? (await sessionReady)
			return session.om?.observer?.switchModel?.(options)
		},
		async switchReflectorModel(options: { modelId: string }) {
			const session = activeSession ?? (await sessionReady)
			return session.om?.reflector?.switchModel?.(options)
		},
		getCurrentThreadId() {
			return activeSession?.thread?.getId?.() ?? ""
		},
		async createThread(options?: {
			title?: string
			metadata?: Record<string, unknown>
		}) {
			const session = activeSession ?? (await sessionReady)
			return session.thread?.create?.(options ?? {})
		},
		async switchThread(options: { threadId: string }) {
			const session = activeSession ?? (await sessionReady)
			await session.thread?.switch?.(options)
		},
		async renameThread(options: { threadId?: string; title: string }) {
			const session = activeSession ?? (await sessionReady)
			return session.thread?.rename?.(options)
		},
		async deleteThread(options: { threadId: string }) {
			const session = activeSession ?? (await sessionReady)
			return session.thread?.delete?.(options)
		},
		async listThreads() {
			const session = activeSession ?? (await sessionReady)
			return session.thread?.list?.() ?? []
		},
		async listMessages(options?: { threadId?: string; limit?: number }) {
			const session = activeSession ?? (await sessionReady)
			const threadId = options?.threadId || this.getCurrentThreadId()
			if (!threadId) return []
			try {
				const rawMessages =
					(await session.thread?.listMessages?.({ ...options, threadId })) ?? []
				const list = Array.isArray(rawMessages)
					? rawMessages
					: ((rawMessages as any)?.messages ?? [])
				if (list.length > 0) {
					// Enrich durationMs from storage if present (In-memory session.thread may omit custom durationMs)
					try {
						const memStore = await storage.getStore("memory")
						const dbRes = await memStore.listMessages({
							threadId,
							limit: options?.limit,
							perPage: options?.limit ?? false,
							orderBy: { field: "createdAt", direction: "ASC" },
						})
						const dbDurMap = new Map<string, number>()
						for (const dm of dbRes.messages ?? []) {
							if ((dm as any).durationMs != null) {
								dbDurMap.set(dm.id, (dm as any).durationMs)
							}
						}
						if (dbDurMap.size > 0) {
							for (const m of list) {
								const d = dbDurMap.get(m.id)
								if (d != null && (m as any).durationMs == null) {
									;(m as any).durationMs = d
								}
							}
						}
					} catch {}

					return list.map(
						(m: any) => normalizeControllerMessage(m) as ControllerMessageLike,
					)
				}
			} catch (err) {
				console.warn(
					`[harness] session.thread.listMessages failed for ${threadId}, falling back to storage:`,
					err,
				)
			}

			// Fallback: query SQLite memory store directly (e.g. if session thread throws or returns empty)
			try {
				const memStore = await storage.getStore("memory")
				const res = await memStore.listMessages({
					threadId,
					limit: options?.limit,
					perPage: options?.limit ?? false,
					orderBy: { field: "createdAt", direction: "ASC" },
				})
				const list = res.messages ?? []
				return list.map(
					(m: any) => normalizeControllerMessage(m) as ControllerMessageLike,
				)
			} catch (fallbackErr) {
				console.error(
					`[harness] storage fallback listMessages failed for ${threadId}:`,
					fallbackErr,
				)
				return []
			}
		},
		getTokenUsage() {
			return (
				activeSession?.getTokenUsage?.() ?? {
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
				}
			)
		},
		getDisplayState() {
			return activeSession?.displayState?.get?.() ?? ({} as HarnessDisplayState)
		},
		isRunning() {
			return (
				activeSession?.run?.isRunning?.() ??
				activeSession?.stream?.isOpen?.() ??
				false
			)
		},
		respondToToolApproval(options: ToolApprovalOptions) {
			const decision =
				options.decision ?? (options.approved !== false ? "approve" : "decline")
			return activeSession?.respondToToolApproval?.({
				decision,
				toolCallId: options.toolCallId ?? "",
				...(options.requestContext
					? { requestContext: options.requestContext }
					: {}),
				...(options.declineContext
					? { declineContext: options.declineContext }
					: {}),
			})
		},
		respondToQuestion(options: { questionId: string; answer: string }) {
			const resolver = pendingQuestions.get(options.questionId)
			if (resolver) {
				resolver(options.answer)
				pendingQuestions.delete(options.questionId)
			}
		},
		registerQuestion(options: {
			questionId: string
			resolve: (ans: string) => void
		}) {
			pendingQuestions.set(options.questionId, options.resolve)
		},
		registerPlanApproval(options: {
			planId: string
			resolve: (response: {
				action: "approved" | "rejected"
				feedback?: string
			}) => void
		}) {
			pendingPlans.set(options.planId, options.resolve)
		},
		async respondToPlanApproval(options: PlanApprovalOptions) {
			const planId = options.planId
			let action: "approved" | "rejected" = "rejected"
			let feedback: string | undefined = options.feedback

			if (typeof options.response === "object" && options.response !== null) {
				action =
					options.response.action === "approved" ? "approved" : "rejected"
				feedback = options.response.feedback ?? feedback
			} else if (typeof options.response === "string") {
				action = options.response === "approved" ? "approved" : "rejected"
			} else if (typeof options.approved === "boolean") {
				action = options.approved ? "approved" : "rejected"
			}

			const normalizedResponse: {
				action: "approved" | "rejected"
				feedback?: string
			} = {
				action,
				feedback,
			}

			let resolver = planId ? pendingPlans.get(planId) : undefined
			if (!resolver && pendingPlans.size > 0) {
				const [firstKey, firstResolver] = pendingPlans.entries().next().value!
				resolver = firstResolver
				pendingPlans.delete(firstKey)
			} else if (planId) {
				pendingPlans.delete(planId)
			}

			if (resolver) {
				resolver(normalizedResponse)

				if (normalizedResponse.action === "approved") {
					try {
						await harness.switchMode({ modeId: ExecutionMode.REACT })
					} catch (e) {
						console.error(
							"[plan-approval] failed to switch mode on approval:",
							e,
						)
					}
				}
				return
			}

			const session = activeSession ?? (await sessionReady)
			if (
				typeof (
					session as unknown as {
						handlePlanApprovalResume?: (opts: unknown) => Promise<void>
					}
				).handlePlanApprovalResume === "function"
			) {
				return (
					session as unknown as {
						handlePlanApprovalResume: (opts: unknown) => Promise<void>
					}
				).handlePlanApprovalResume(options)
			}
			return session.respondToToolSuspension({
				resumeData: normalizedResponse,
			})
		},
		async listAvailableModels() {
			try {
				const models =
					(await controller.listAvailableModels?.()) as AvailableModelItem[]
				if (Array.isArray(models) && models.length > 0) return models
			} catch {}
			return CURATED_CHAT_MODELS.map((m) => {
				const authId = m.provider === "openai" ? "openai-codex" : m.provider
				return {
					...m,
					hasApiKey: authStorage.isLoggedIn(authId),
					hasAuth: authStorage.isLoggedIn(authId),
				}
			})
		},
		async loadOMProgress() {
			const ctrl = controller as unknown as {
				loadOMProgress?: (target: unknown) => Promise<unknown>
			}
			return ctrl.loadOMProgress?.(activeSession ?? project.resourceId)
		},
		setPermissionForCategory(options: { category: string; policy: string }) {
			categoryPolicies[options.category] = options.policy
			setRuntimeCategoryPolicy(
				options.category as Parameters<typeof setRuntimeCategoryPolicy>[0],
				options.policy as Parameters<typeof setRuntimeCategoryPolicy>[1],
			)
			if (activeSession?.permissions?.setForCategory) {
				activeSession.permissions.setForCategory({
					category: options.category as ToolCategory,
					policy: options.policy as PermissionPolicy,
				})
			}
		},
		getPermissionRules(): PermissionRulesResult {
			if (activeSession?.permissions?.getRules) {
				const rules = activeSession.permissions.getRules()
				const categories: Record<string, string> = { ...categoryPolicies }
				if (rules?.categories) {
					for (const [k, v] of Object.entries(rules.categories)) {
						if (v) categories[k] = v
					}
				}
				const tools: Record<string, string> = {}
				if (rules?.tools) {
					for (const [k, v] of Object.entries(rules.tools)) {
						if (v) tools[k] = v
					}
				}
				return { categories, tools }
			}
			return { categories: categoryPolicies, tools: {} }
		},
		/**
		 * Names of the tools the connected MCP servers registered, exactly as the
		 * model sees them (`langsearch_web_search`). The system prompt lists them
		 * in its authoritative toolset section; without that the model is told it
		 * only has the built-in tools and answers "no web access" while the search
		 * tool is sitting in the same request.
		 */
		getMcpToolNames(): string[] {
			return mcpManager ? Object.keys(mcpManager.getTools()) : []
		},
		getMcpServerStatuses(): McpServerStatus[] {
			return mcpManager?.getServerStatuses() ?? []
		},
		getSessionGrants(): SessionGrantsResult {
			if (activeSession?.getGrants) {
				const grants = activeSession.getGrants()
				return {
					categories: Array.isArray(grants?.categories)
						? (grants.categories as string[])
						: Array.from((grants?.categories as Iterable<string>) ?? []),
					tools: Array.isArray(grants?.tools)
						? (grants.tools as string[])
						: Array.from((grants?.tools as Iterable<string>) ?? []),
				}
			}
			return { categories: [], tools: [] }
		},
		grantSessionCategory(options: { category: string }) {
			if (activeSession?.grantCategory) {
				activeSession.grantCategory(options.category as ToolCategory)
			}
		},
		async getSession() {
			const session = activeSession ?? (await sessionReady)
			const threads = await this.listThreads()
			let currentThreadId = this.getCurrentThreadId()
			const savedThreadId = getRecentProjectLastThread(project.rootPath)
			if (
				savedThreadId &&
				threads &&
				threads.some((t) => t.id === savedThreadId) &&
				currentThreadId !== savedThreadId
			) {
				currentThreadId = savedThreadId
				await this.switchThread({ threadId: currentThreadId })
			} else if (!currentThreadId && threads && threads.length > 0) {
				currentThreadId = threads[0].id
				await this.switchThread({ threadId: currentThreadId })
			}
			return {
				id: session?.identity?.getId?.() ?? project.resourceId,
				resourceId: project.resourceId,
				currentThreadId: currentThreadId || null,
				currentModeId: this.getCurrentModeId(),
				currentModelId: this.getCurrentModelId(),
				threads: threads ?? [],
			}
		},
		async getMessageQueue(options: {
			threadId: string
		}): Promise<QueuedMessage[]> {
			try {
				const ctrl = controller as unknown as {
					readThreadMetadataValue?: (opts: {
						threadId: string
						key: string
					}) => Promise<unknown>
				}
				if (ctrl.readThreadMetadataValue) {
					const data = await ctrl.readThreadMetadataValue({
						threadId: options.threadId,
						key: "messageQueue",
					})
					return Array.isArray(data) ? (data as QueuedMessage[]) : []
				}
			} catch (err) {
				console.warn("[getMessageQueue] Error reading queue:", err)
			}
			return []
		},
		async setMessageQueue(options: {
			threadId: string
			queue: QueuedMessage[]
		}): Promise<void> {
			try {
				const ctrl = controller as unknown as {
					writeThreadMetadataValue?: (opts: {
						threadId: string
						key: string
						value: unknown
					}) => Promise<void>
				}
				if (ctrl.writeThreadMetadataValue) {
					await ctrl.writeThreadMetadataValue({
						threadId: options.threadId,
						key: "messageQueue",
						value: options.queue,
					})
				}
			} catch (err) {
				console.warn("[setMessageQueue] Error writing queue:", err)
			}
		},
	}

	const harness: MyAgentHarness = new Proxy(adapter, {
		get(target: MyAgentHarness, prop: string | symbol) {
			if (prop in target) {
				return (target as unknown as Record<string | symbol, unknown>)[prop]
			}
			if (activeSession && prop in (activeSession as unknown as object)) {
				const val = (
					activeSession as unknown as Record<string | symbol, unknown>
				)[prop]
				return typeof val === "function" ? val.bind(activeSession) : val
			}
			if (prop in (controller as unknown as object)) {
				const val = (controller as unknown as Record<string | symbol, unknown>)[
					prop
				]
				return typeof val === "function" ? val.bind(controller) : val
			}
			return undefined
		},
	})

	if (hookManager) {
		harness.subscribe((event: MyAgentEvent) => {
			if (event.type === "thread_changed" && "threadId" in event) {
				hookManager.setSessionId((event as { threadId: string }).threadId)
			} else if (event.type === "thread_created" && "thread" in event) {
				hookManager.setSessionId(
					(event as { thread: { id: string } }).thread.id,
				)
			}
		})
	}

	return {
		harness,
		mcpManager,
		hookManager,
		authStorage,
		resolveModel,
		storageWarning,
	}
}

export const createAgentHarness = createMyAgent
