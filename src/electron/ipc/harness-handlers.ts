import type { IpcCommandHandler, HandlerContext } from "./types.js"
import { normalizeControllerMessage } from "../../harness/index.js"
import {
	CURATED_CHAT_MODELS,
	isDeprecatedModel,
} from "../../constants/models.js"
import {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	type ToolCategory,
	type PermissionPolicy,
} from "../../permissions.js"

function isUsableChatModel(modelId: string): boolean {
	const id = modelId.toLowerCase()
	// Exclude embeddings
	if (id.includes("embedding")) return false
	// Exclude image generation models
	if (
		id.includes("-image") ||
		id.includes("image-") ||
		id.startsWith("gpt-image") ||
		id.includes("imagen") ||
		id.includes("dall-e")
	)
		return false
	// Exclude video generation models (Veo, Sora, etc.)
	if (id.includes("veo") || id.includes("sora")) return false
	// Exclude audio / TTS / music generation
	if (
		id.includes("tts") ||
		id.includes("lyria") ||
		id.includes("audio") ||
		id.includes("whisper")
	)
		return false
	// Exclude realtime streaming / audio-video WebSockets
	if (
		id.includes("realtime") ||
		id.includes("live-preview") ||
		id.includes("live-translate")
	)
		return false
	// Exclude internal research / experimental previews / robotics
	if (
		id.includes("deep-research") ||
		id.includes("robotics") ||
		id.includes("banana") ||
		id.includes("argon")
	)
		return false
	// Exclude moderation / search / edits
	if (id.includes("moderation") || id.includes("search") || id.includes("edit"))
		return false
	// Exclude deprecated models that return 404 for new users
	if (isDeprecatedModel(modelId)) return false
	// Exclude legacy OpenAI completions
	if (
		id.includes("text-davinci") ||
		id.includes("text-curie") ||
		id.includes("text-babbage") ||
		id.includes("text-ada")
	)
		return false
	return true
}

export function getHarnessHandlers(): Record<string, IpcCommandHandler> {
	return {
		sendMessage: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const h = s.harness
			try {
				await ctx.ensureAuthenticatedModel(h, s.authStorage)
			} catch (err: unknown) {
				console.error("ensureAuthenticatedModel error:", err)
				const errMsg = err instanceof Error ? err.message : String(err)
				ctx.mainWindow?.webContents.send("harness:event", {
					type: "error",
					error: { message: errMsg },
					worktreePath: ctx.activeSessionPath,
				})
				return
			}
			const threadBefore = h.getCurrentThreadId()
			const files = Array.isArray(command.images)
				? command.images.map((img: any) => ({
						mediaType: img.mediaType || img.mimeType || "image/png",
						mimeType: img.mimeType || img.mediaType || "image/png",
						data: img.data || "",
						filename: img.name || img.filename || "image.png",
					}))
				: undefined

			h.sendMessage({
				content: command.content || "",
				...(files ? { files } : {}),
			})
				.then(async () => {
					const threadAfter = h.getCurrentThreadId()
					if (!threadAfter) return
					let needsTitle = threadAfter !== threadBefore
					if (!needsTitle) {
						try {
							const session = await h.getSession()
							const thread = session.threads.find(
								(t: any) => t.id === threadAfter,
							)
							const title = thread?.title ?? ""
							needsTitle =
								!title || title === "New Thread" || title === "Untitled"
						} catch {}
					}
					if (needsTitle) {
						ctx
							.generateThreadTitle(h, command.content, s.resolveModel)
							.catch((err) => console.warn("Title gen catch:", err))
					}
				})
				.catch((err: unknown) => {
					console.error("sendMessage error:", err)
					const errMsg = err instanceof Error ? err.message : String(err)
					ctx.mainWindow?.webContents.send("harness:event", {
						type: "error",
						error: { message: errMsg },
						worktreePath: ctx.activeSessionPath,
					})
					ctx.mainWindow?.webContents.send("harness:event", {
						type: "agent_end",
						reason: "error",
						worktreePath: ctx.activeSessionPath,
					})
				})
			return
		},
		abort: async (command, ctx) => {
			ctx.getActiveSession().harness.abort()
		},
		steer: async (command, ctx) => {
			await ctx.getActiveSession().harness.steer({ content: command.content })
		},
		followUp: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.followUp({ content: command.content })
		},
		switchMode: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchMode({ modeId: command.modeId })
		},
		switchModel: async (command, ctx) => {
			await ctx.getActiveSession().harness.switchModel({
				modelId: command.modelId,
				scope: command.scope,
				modeId: command.modeId,
			})
		},
		switchThread: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await s.harness.switchThread({ threadId: command.threadId })
			await ctx.ensureAuthenticatedModel(s.harness, s.authStorage)
		},
		createThread: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const thread = await s.harness.createThread({ title: command.title })
			await ctx.ensureAuthenticatedModel(s.harness, s.authStorage)
			return thread
		},
		renameThread: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const targetThreadId =
				(command.threadId as string) || s.harness.getCurrentThreadId()
			const newTitle = (command.title as string)?.trim()
			if (!targetThreadId || !newTitle) return

			const isCurrent = s.harness.getCurrentThreadId() === targetThreadId
			if (isCurrent && typeof s.harness.renameThread === "function") {
				await s.harness.renameThread({ title: newTitle })
			} else {
				try {
					const memoryStorage = await (s.harness as any).getMemoryStorage?.()
					if (memoryStorage) {
						const thread = await memoryStorage.getThreadById({
							threadId: targetThreadId,
						})
						if (thread) {
							await memoryStorage.saveThread({
								thread: {
									...thread,
									title: newTitle,
									updatedAt: new Date(),
								},
							})
						}
					}
				} catch (err) {
					console.warn("[renameThread] Error saving renamed thread:", err)
				}
			}

			ctx.mainWindow?.webContents.send("harness:event", {
				type: "thread_title_updated",
				threadId: targetThreadId,
				title: newTitle,
				worktreePath: ctx.activeSessionPath,
			})
		},
		deleteThread: async (command, ctx) => {
			await ctx.deleteThread(ctx.getActiveSession().harness, command.threadId)
		},
		getMessages: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const threadId = command.threadId || h.getCurrentThreadId()
			if (!threadId) return []
			const rawMessages = await h.listMessages({
				threadId,
				limit: command.limit,
			})
			return (rawMessages ?? []).map(normalizeControllerMessage)
		},
		getModes: async (_command, ctx) => {
			return ctx
				.getActiveSession()
				.harness.listModes()
				.map((m: any) => ({
					id: m.id,
					name: m.name,
					color: m.color,
				}))
		},
		getState: async (_command, ctx) => {
			const session = ctx.getActiveSession()
			await ctx.ensureAuthenticatedModel(session.harness, session.authStorage)
			return {
				...session.harness.getState(),
				...session.electronState.getState(),
			}
		},
		getSession: async (_command, ctx) => {
			const h = ctx.getActiveSession().harness
			const session = await h.getSession()
			await h.loadOMProgress?.().catch(() => {})
			return session
		},
		listThreads: async (_command, ctx) => {
			return await ctx.getActiveSession().harness.listThreads()
		},
		getTokenUsage: async (_command, ctx) => {
			return ctx.getActiveSession().harness.getTokenUsage()
		},
		getOMProgress: async (_command, ctx) => {
			const ds = ctx.getActiveSession().harness.getDisplayState()
			return ds?.omProgress ?? null
		},
		isRunning: async (_command, ctx) => {
			return ctx.getActiveSession().harness.isRunning()
		},
		getCurrentModeId: async (_command, ctx) => {
			return ctx.getActiveSession().harness.getCurrentModeId()
		},
		getFullModelId: async (_command, ctx) => {
			return ctx.getActiveSession().harness.getFullModelId()
		},
		getAvailableModels: async (_command, ctx) => {
			const session = ctx.getActiveSession()
			const rawModels = await session.harness.listAvailableModels()
			const modelMap = new Map<string, any>()
			for (const m of CURATED_CHAT_MODELS) {
				const authId = m.provider === "openai" ? "openai-codex" : m.provider
				modelMap.set(m.id, {
					id: m.id,
					name: m.name,
					provider: m.provider,
					hasAuth: session.authStorage.isLoggedIn(authId),
				})
			}
			for (const m of rawModels ?? []) {
				if (!m.id || !isUsableChatModel(m.id)) continue
				if (!modelMap.has(m.id)) {
					const provider = m.provider || (m.id ? m.id.split("/")[0] : "other")
					const authId = provider === "openai" ? "openai-codex" : provider
					const hasAuth =
						m.hasApiKey ?? m.hasAuth ?? session.authStorage.isLoggedIn(authId)
					modelMap.set(m.id, {
						id: m.id,
						name: m.modelName ?? m.name ?? m.id.split("/").pop(),
						provider,
						hasAuth: Boolean(hasAuth),
					})
				}
			}
			return Array.from(modelMap.values())
		},
	}
}
