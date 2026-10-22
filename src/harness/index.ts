import fs from "node:fs"
import path from "node:path"
import {
	AgentController as Harness,
	Session,
	type AgentControllerConfig as HarnessConfig,
	type AgentControllerDisplayState as HarnessDisplayState,
	type AgentControllerEvent as HarnessEvent,
	type AgentControllerMode as HarnessMode,
	type AgentControllerRequestContext as HarnessRequestContext,
	type AgentControllerSubagent as HarnessSubagent,
	type AgentControllerThread as HarnessThread,
	type AvailableModel,
	type IntervalHandler,
	type PermissionPolicy,
	type TokenUsage,
	type ToolCategory,
} from "@mastra/core/agent-controller"

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
import { Agent } from "@mastra/core/agent"
import { Memory } from "@mastra/memory"
import { LibSQLStore } from "@mastra/libsql"
import type { RequestContext } from "@mastra/core/request-context"
import { AuthStorage } from "../auth/storage.js"
import { MCPManager } from "../mcp/manager.js"
import { HookManager } from "../hooks/manager.js"
import {
	detectProject,
	getStorageConfig,
	getDatabasePath,
	getResourceIdOverride,
	getOmScope,
	type StorageConfig,
} from "../utils/project.js"
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

	return {
		...record,
		role,
		content,
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
	response?: string
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

export type MastraCodeEvent =
	| HarnessEvent
	| AskQuestionEvent
	| PlanApprovalRequiredEvent

export interface MastraCodeHarness<TState = HarnessState> {
	id: string
	controller: Harness<TState>
	activeSession?: Session<TState> | null
	init(): Promise<void>
	subscribe(listener: (event: MastraCodeEvent) => void): () => void
	sendMessage(options: SendMessageOptions): Promise<void>
	abort(): Promise<void>
	steer(options: SteerOptions): Promise<void>
	followUp(options: FollowUpOptions): Promise<void>
	getState(): TState & Record<string, unknown>
	setState(patch: Partial<TState>): Promise<void>
	listModes(): HarnessMode[]
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
	respondToPlanApproval(options: PlanApprovalOptions): Promise<void> | void
	listAvailableModels(): AvailableModelItem[] | Promise<AvailableModelItem[]>
	loadOMProgress?(): Promise<unknown>
	setPermissionForCategory(options: { category: string; policy: string }): void
	getPermissionRules(): PermissionRulesResult
	getSessionGrants(): SessionGrantsResult
	grantSessionCategory(options: { category: string }): void
	getSession(): Promise<HarnessSessionInfo>
	getMessageQueue(options: { threadId: string }): Promise<QueuedMessage[]>
	setMessageQueue(options: {
		threadId: string
		queue: QueuedMessage[]
	}): Promise<void>
}

export interface MastraCodeConfig<TState = HarnessState> {
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
	storage?: StorageConfig | LibSQLStore
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
}

function getDynamicMemory(
	storage: LibSQLStore,
	resolveModel: ReturnType<typeof createModelResolver>,
) {
	let cachedMemory: Memory | null = null
	let cachedMemoryKey: string | null = null

	return ({ requestContext }: { requestContext: RequestContext }) => {
		const harnessContext = (requestContext.get("controller") ||
			requestContext.get("harness")) as
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

export interface CreateMastraCodeResult {
	harness: MastraCodeHarness
	mcpManager?: MCPManager
	hookManager?: HookManager
	authStorage: AuthStorage
	resolveModel: ReturnType<typeof createModelResolver>
	storageWarning?: string
}

export async function createMastraCode(
	config?: MastraCodeConfig,
): Promise<CreateMastraCodeResult> {
	const cwd = config?.cwd ?? process.cwd()
	const authStorage = new AuthStorage()

	const project = detectProject(cwd)
	const resourceIdOverride = getResourceIdOverride(project.rootPath)
	if (resourceIdOverride) {
		project.resourceId = resourceIdOverride
		project.resourceIdOverride = true
	}

	const storageConfig: StorageConfig | undefined =
		config?.storage && !(config.storage instanceof LibSQLStore)
			? config.storage
			: getStorageConfig(project.rootPath)
	const dbUrl =
		config?.storage instanceof LibSQLStore
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
		config?.storage instanceof LibSQLStore
			? config.storage
			: new LibSQLStore({
					id: "mastra-code-storage",
					url: dbUrl!,
					...(storageConfig?.authToken
						? { authToken: storageConfig.authToken }
						: {}),
				})
	const storageWarning: string | undefined = undefined

	const resolveModel = createModelResolver(authStorage)
	const memory = getDynamicMemory(storage, resolveModel)
	const mcpManager = config?.disableMcp
		? undefined
		: new MCPManager(project.rootPath)

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

	const defaultModelId =
		loadSettings().models?.modeDefaults?.build ||
		resolveDefaultModel((p) => authStorage.isLoggedIn(p))

	const defaultSubagents = createDefaultSubagents(project.rootPath)
	const defaultModes: HarnessMode[] = [
		{
			id: "build",
			name: "Build",
			defaultModelId,
			metadata: { default: true },
		},
		{
			id: "plan",
			name: "Plan",
			defaultModelId,
		},
		{
			id: "fast",
			name: "Fast",
			defaultModelId,
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
		id: "mastra-code",
		agent: codeAgent,
		defaultModeId: "build",
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

	const subscribers = new Set<(event: MastraCodeEvent) => void>()
	let activeSession: Session<HarnessState> | null = null
	const pendingQuestions = new Map<string, (ans: string) => void>()
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

	const adapter: MastraCodeHarness = {
		id: "mastra-code",
		controller,
		get activeSession() {
			return activeSession
		},
		async init() {
			await controller.init()
			await sessionReady
		},
		subscribe(listener: (event: MastraCodeEvent) => void) {
			subscribers.add(listener)
			return () => {
				subscribers.delete(listener)
			}
		},
		async sendMessage(options: SendMessageOptions) {
			const session = activeSession ?? (await sessionReady)
			return session.sendMessage(options)
		},
		async abort() {
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
			return session.state?.set?.(patch)
		},
		listModes() {
			return controller.listModes?.() ?? modes
		},
		getCurrentModeId() {
			return activeSession?.mode?.get?.() ?? "build"
		},
		async switchMode(options: { modeId: string }) {
			const session = activeSession ?? (await sessionReady)
			return session.mode?.switch?.(options)
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
			return session.thread?.switch?.(options)
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
			const rawMessages =
				(await session.thread?.listMessages?.({ ...options, threadId })) ?? []
			return rawMessages.map(
				(m) => normalizeControllerMessage(m) as ControllerMessageLike,
			)
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
		async respondToPlanApproval(options: PlanApprovalOptions) {
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
				resumeData:
					options.response ??
					(options.approved ? "approved" : (options.feedback ?? "rejected")),
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
			return {
				id: session?.identity?.getId?.() ?? project.resourceId,
				resourceId: project.resourceId,
				currentThreadId: this.getCurrentThreadId() || null,
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

	const harness: MastraCodeHarness = new Proxy(adapter, {
		get(target: MastraCodeHarness, prop: string | symbol) {
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
		harness.subscribe((event: MastraCodeEvent) => {
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

export const createAgentHarness = createMastraCode
