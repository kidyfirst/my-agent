import fs from "node:fs"
import path from "node:path"
import { Harness } from "@mastra/core/harness"
import type {
	HarnessMode,
	HarnessSubagent,
	IntervalHandler,
} from "@mastra/core/harness"
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
} from "../utils/project.js"
import { syncGateways } from "../utils/gateway-sync.js"
import { getToolCategory } from "../permissions.js"
import {
	stateSchema,
	DEFAULT_OM_MODEL_ID,
	DEFAULT_OBS_THRESHOLD,
	DEFAULT_REF_THRESHOLD,
} from "./state.js"
import {
	loadSettings,
	saveSettings,
	getCustomProviderId,
	toCustomProviderModelId,
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

export function normalizeControllerMessage(m: any) {
	if (!m || typeof m !== "object") return m
	let role = m.role
	const type = m.type
	let content = m.content

	if (typeof content === "string") {
		const trimmed = content.trim()
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				content = JSON.parse(trimmed)
			} catch {}
		}
	}

	if (content && typeof content === "object") {
		if (
			content.metadata?.signal?.type === "user" ||
			content.metadata?.signal?.tagName === "user" ||
			content.metadata?.signal?.type === "data-user-message" ||
			content.metadata?.signal?.type === "text" ||
			type === "user"
		) {
			role = "user"
		}
	}

	if (role === "signal") {
		if (type === "user") {
			role = "user"
		} else if (type === "system") {
			role = "system"
		}
	}

	return {
		...m,
		role,
		content,
	}
}

export interface MastraCodeHarness<TState = any> {
	id: string
	controller: any
	activeSession?: any
	init(): Promise<void>
	subscribe(listener: (event: any) => void): () => void
	sendMessage(options: any): Promise<any>
	abort(): Promise<void>
	steer(options: any): Promise<any>
	followUp(options: any): Promise<any>
	getState(): any
	setState(patch: any): Promise<any>
	listModes(): any[]
	getCurrentModeId(): string
	switchMode(options: { modeId: string }): Promise<void>
	getCurrentModelId(): string
	getFullModelId(): string
	switchModel(options: {
		modelId: string
		scope?: string
		modeId?: string
	}): Promise<void>
	switchObserverModel(options: { modelId: string }): Promise<void>
	switchReflectorModel(options: { modelId: string }): Promise<void>
	getCurrentThreadId(): string
	createThread(options?: { title?: string }): Promise<any>
	switchThread(options: { threadId: string }): Promise<void>
	renameThread(options: { threadId?: string; title: string }): Promise<any>
	deleteThread(options: { threadId: string }): Promise<any>
	listThreads(): Promise<any[]>
	listMessages(options?: any): Promise<any[]>
	getTokenUsage(): any
	getDisplayState(): any
	isRunning(): boolean
	respondToToolApproval(options: any): any
	respondToQuestion(options: any): any
	registerQuestion?(options: any): any
	respondToPlanApproval(options: any): any
	listAvailableModels(): any[] | Promise<any[]>
	loadOMProgress?(): Promise<any>
	setPermissionForCategory(options: { category: string; policy: string }): void
	getPermissionRules(): {
		categories: Record<string, string>
		tools: Record<string, string>
	}
	getSessionGrants(): { categories: string[]; tools: string[] }
	grantSessionCategory(options: { category: string }): void
	getSession(): Promise<any>
	[key: string]: any
}

export interface MastraCodeConfig {
	/** Working directory for project detection. Default: process.cwd() */
	cwd?: string
	/** Override modes (model IDs, colors, which modes exist). Default: build/plan/fast */
	modes?: HarnessMode[]
	/** Override or extend subagent definitions. Default: explore/plan/execute */
	subagents?: HarnessSubagent[]
	/** Extra tools merged into the dynamic tool set. */
	extraTools?:
		| Record<string, any>
		| ((ctx: { requestContext: RequestContext }) => Record<string, any>)
	/** Custom storage config instead of auto-detected default */
	storage?: any
	/** Initial state overrides (yolo, thinkingLevel, etc.) */
	initialState?: Record<string, unknown>
	/** Override heartbeat/interval handlers. Default: gateway-sync */
	heartbeatHandlers?: IntervalHandler[]
	intervalHandlers?: IntervalHandler[]
	/** Override the workspace */
	workspace?: any
	/** Disable MCP server discovery. Default: false */
	disableMcp?: boolean
	/** Disable hooks. Default: false */
	disableHooks?: boolean
}

const PROVIDER_TO_OAUTH_ID: Record<string, string> = {
	anthropic: "anthropic",
	openai: "openai-codex",
}

function getDynamicMemory(storage: any, resolveModel: any) {
	let cachedMemory: any = null
	let cachedMemoryKey: string | null = null

	return ({ requestContext }: { requestContext: RequestContext }) => {
		const harnessContext = (requestContext.get("controller") ||
			requestContext.get("harness")) as any
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
						model: ({ requestContext }: { requestContext: RequestContext }) => {
							const ctx = (requestContext.get("controller") ||
								requestContext.get("harness")) as any
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
						model: ({ requestContext }: { requestContext: RequestContext }) => {
							const ctx = (requestContext.get("controller") ||
								requestContext.get("harness")) as any
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

export async function createMastraCode(config?: MastraCodeConfig): Promise<{
	harness: MastraCodeHarness
	mcpManager?: MCPManager
	hookManager?: HookManager
	authStorage: AuthStorage
	resolveModel: ReturnType<typeof createModelResolver>
	storageWarning?: string
}> {
	const cwd = config?.cwd ?? process.cwd()
	const authStorage = new AuthStorage()

	const project = detectProject(cwd)
	const resourceIdOverride = getResourceIdOverride(project.rootPath)
	if (resourceIdOverride) {
		project.resourceId = resourceIdOverride
		project.resourceIdOverride = true
	}

	const storageConfig =
		config?.storage ?? (getStorageConfig(project.rootPath) as any)
	const dbUrl = storageConfig?.url ?? `file:${getDatabasePath()}`
	if (dbUrl.startsWith("file:") && !dbUrl.includes(":memory:")) {
		const filePath = dbUrl.slice(5)
		const dir = path.dirname(filePath)
		try {
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
		} catch {}
	}
	const storage = new LibSQLStore({
		id: "mastra-code-storage",
		url: dbUrl,
		...(storageConfig?.authToken ? { authToken: storageConfig.authToken } : {}),
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
		tools: createDynamicTools(mcpManager, config?.extraTools),
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

	const controller = new Harness({
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
			yolo: true,
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
	} as any)

	const subscribers = new Set<(event: any) => void>()
	let activeSession: any = null
	const pendingQuestions = new Map<string, (ans: string) => void>()
	const categoryPolicies: Record<string, string> = {}

	const sessionReady = controller
		.createSession({ resourceId: project.resourceId })
		.then(async (s) => {
			activeSession = s
			if (!(s.state?.get?.() as any)?.currentModelId) {
				await s.state?.set?.({ currentModelId: defaultModelId })
			}
			const knownMessages = new Map<string, any>()
			s.subscribe((event: any) => {
				if (event.message?.id) {
					event.message = normalizeControllerMessage(event.message)
					knownMessages.set(event.message.id, event.message)
				}
				// Normalize message events for UI compatibility
				if (event.type === "message_end" && !event.message) {
					const existing = event.id ? knownMessages.get(event.id) : undefined
					event.message = existing || {
						id: event.id || "unknown",
						role: "assistant",
						content: [],
					}
				} else if (event.type === "message_update" && !event.message) {
					const existing = event.id ? knownMessages.get(event.id) : undefined
					event.message = existing || {
						id: event.id || "unknown",
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
		subscribe(listener: (event: any) => void) {
			subscribers.add(listener)
			return () => {
				subscribers.delete(listener)
			}
		},
		async sendMessage(options: any) {
			const session = activeSession ?? (await sessionReady)
			return session.sendMessage(options)
		},
		async abort() {
			const session = activeSession ?? (await sessionReady)
			return session.run?.abort?.() ?? session.abort?.()
		},
		async steer(options: any) {
			const session = activeSession ?? (await sessionReady)
			return session.steer?.(options)
		},
		async followUp(options: any) {
			const session = activeSession ?? (await sessionReady)
			return session.followUp?.(options)
		},
		getState() {
			const sessionState = activeSession?.state?.get?.() ?? {}
			const currentModel = this.getCurrentModelId()
			return {
				projectPath: project.rootPath,
				projectName: project.name,
				gitBranch: project.gitBranch,
				yolo: true,
				...config?.initialState,
				currentModelId: sessionState.currentModelId || currentModel,
				currentModeId: this.getCurrentModeId(),
				...sessionState,
			}
		},
		async setState(patch: any) {
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
			if (m && typeof m === "object" && m.modelId) return m.modelId
			const sessionState = activeSession?.state?.get?.()
			if (sessionState?.currentModelId) {
				const sm = sessionState.currentModelId
				if (typeof sm === "string") return sm
				if (typeof sm === "object" && sm?.modelId) return sm.modelId
			}
			return defaultModelId
		},
		getFullModelId() {
			return this.getCurrentModelId()
		},
		async switchModel(options: { modelId: string; scope?: string } | string) {
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
		async createThread(options?: { title?: string }) {
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
		async listMessages(options?: any) {
			const session = activeSession ?? (await sessionReady)
			const threadId = options?.threadId || this.getCurrentThreadId()
			if (!threadId) return []
			const rawMessages =
				(await session.thread?.listMessages?.({ ...options, threadId })) ?? []
			return rawMessages.map(normalizeControllerMessage)
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
			return activeSession?.displayState?.get?.() ?? {}
		},
		isRunning() {
			return (
				activeSession?.run?.isRunning?.() ??
				activeSession?.stream?.isStreaming?.() ??
				false
			)
		},
		respondToToolApproval(options: any) {
			return activeSession?.respondToToolApproval?.(options)
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
		async respondToPlanApproval(options: any) {
			const session = activeSession ?? (await sessionReady)
			return session.handlePlanApprovalResume?.(options)
		},
		async listAvailableModels() {
			try {
				const models = await controller.listAvailableModels?.()
				if (Array.isArray(models) && models.length > 0) return models
			} catch {}
			return CURATED_CHAT_MODELS.map((m) => {
				const authId = m.provider === "openai" ? "openai-codex" : m.provider
				return {
					...m,
					hasApiKey: authStorage.isLoggedIn(authId),
				}
			})
		},
		async loadOMProgress() {
			return (controller as any).loadOMProgress?.(
				activeSession ?? project.resourceId,
			)
		},
		setPermissionForCategory(options: { category: string; policy: string }) {
			categoryPolicies[options.category] = options.policy
			if (activeSession?.permissions?.setForCategory) {
				activeSession.permissions.setForCategory(options)
			}
		},
		getPermissionRules() {
			if (activeSession?.permissions?.getRules) {
				const rules = activeSession.permissions.getRules()
				return {
					categories: { ...categoryPolicies, ...(rules?.categories ?? {}) },
					tools: rules?.tools ?? {},
				}
			}
			return { categories: categoryPolicies, tools: {} }
		},
		getSessionGrants() {
			if (activeSession?.getGrants) {
				const grants = activeSession.getGrants()
				return {
					categories: Array.isArray(grants?.categories)
						? grants.categories
						: Array.from(grants?.categories ?? []),
					tools: Array.isArray(grants?.tools)
						? grants.tools
						: Array.from(grants?.tools ?? []),
				}
			}
			return { categories: [], tools: [] }
		},
		grantSessionCategory(options: { category: string }) {
			if (activeSession?.grantCategory) {
				activeSession.grantCategory(options.category)
			}
		},
		async getSession() {
			const session = activeSession ?? (await sessionReady)
			const threads = await this.listThreads()
			return {
				id: session?.identity?.getSessionId?.() ?? project.resourceId,
				resourceId: project.resourceId,
				currentThreadId: this.getCurrentThreadId() || null,
				currentModeId: this.getCurrentModeId(),
				currentModelId: this.getCurrentModelId(),
				threads: threads ?? [],
			}
		},
	}

	const harness: MastraCodeHarness = new Proxy(adapter, {
		get(target: any, prop: string | symbol) {
			if (prop in target) {
				return target[prop]
			}
			if (activeSession && prop in activeSession) {
				const val = activeSession[prop]
				return typeof val === "function" ? val.bind(activeSession) : val
			}
			if (prop in controller) {
				const val = (controller as any)[prop]
				return typeof val === "function" ? val.bind(controller) : val
			}
			return undefined
		},
	})

	if (hookManager) {
		harness.subscribe((event: any) => {
			if (event.type === "thread_changed") {
				hookManager.setSessionId(event.threadId)
			} else if (event.type === "thread_created") {
				hookManager.setSessionId(event.thread.id)
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
