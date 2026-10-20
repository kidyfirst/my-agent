import type { IpcCommandHandler, HandlerContext } from "./types.js"
import {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	type ToolCategory,
	type PermissionPolicy,
} from "../../permissions.js"

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
							const thread = session.threads.find((t) => t.id === threadAfter)
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
			return await ctx
				.getActiveSession()
				.harness.listMessages({ limit: command.limit })
		},
		getModes: async (_command, ctx) => {
			return ctx
				.getActiveSession()
				.harness.listModes()
				.map((m) => ({
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
			const rawModels = await ctx
				.getActiveSession()
				.harness.listAvailableModels()
			return (rawModels ?? []).map((m: any) => ({
				id: m.id,
				name: m.modelName ?? m.name ?? m.id.split("/").pop(),
				provider: m.provider,
				hasAuth: m.hasApiKey ?? m.hasAuth ?? false,
			}))
		},
	}
}
