import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import type { IpcCommandHandler, HandlerContext } from "./types.js"
import { normalizeControllerMessage } from "../../harness/index.js"
import {
	sessionRecordingManager,
	deriveReplayScript,
	createReplayModel,
	reconstructMessagesFromRecording,
	replayPlaybackKey,
	beginSessionReplay,
	endSessionReplay,
	runtimeMetadata,
	isReplayRunActive,
} from "../../core/recorder/index.js"
import { safeSend } from "../helpers.js"
import {
	loadRecentProjects,
	saveRecentProjectLastThread,
} from "../../utils/recent-projects.js"
import {
	captureGitSnapshot,
	diffBetweenSnapshots,
	diffFileBetweenSnapshots,
	type GitSnapshot,
} from "../git-task-snapshot.js"
import {
	deleteThreadTaskChanges,
	getStoredFileDiff,
	getThreadTaskChanges,
	saveTaskChanges,
	saveTaskDuration,
} from "../task-changes-store.js"
import { CURATED_CHAT_MODELS } from "../../constants/models.js"
import {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	type ToolCategory,
	type PermissionPolicy,
} from "../../permissions.js"

function validateRecordingFile(filePath?: string): {
	valid: boolean
	reason?: string
	eventCount: number
} {
	if (!filePath || !fs.existsSync(filePath)) {
		return { valid: false, reason: "No recording file found", eventCount: 0 }
	}
	try {
		const stat = fs.statSync(filePath)
		if (stat.size === 0) {
			return { valid: false, reason: "Recording file is empty", eventCount: 0 }
		}
		const content = fs.readFileSync(filePath, "utf8").trim()
		if (!content) {
			return {
				valid: false,
				reason: "Recording content is empty",
				eventCount: 0,
			}
		}
		let events: any[] = []
		if (content.startsWith("[")) {
			events = JSON.parse(content)
		} else {
			const lines = content
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
			for (const line of lines) {
				events.push(JSON.parse(line))
			}
		}
		const hasAction = events.some(
			(e) =>
				e.type === "run/start" ||
				e.type === "step/start" ||
				e.type === "assistant/stream" ||
				e.type === "tool/result",
		)
		if (events.length === 0 || !hasAction) {
			return {
				valid: false,
				reason: "Recording has no interaction steps",
				eventCount: events.length,
			}
		}
		return { valid: true, eventCount: events.length }
	} catch (err: any) {
		return {
			valid: false,
			reason: err?.message || "Corrupted recording data",
			eventCount: 0,
		}
	}
}

function isActiveProject(ctx: HandlerContext): boolean {
	if (!ctx.activeSessionPath) return false
	const recent = loadRecentProjects()
	const normActive = path
		.resolve(ctx.activeSessionPath)
		.replace(/\/+$/, "")
		.toLowerCase()
	return recent.some((r) => {
		const normRoot = path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase()
		return (
			normRoot === normActive ||
			normActive.startsWith(normRoot + "/") ||
			normActive.startsWith(normRoot + "\\")
		)
	})
}

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
	if (
		id.includes("text-davinci") ||
		id.includes("text-curie") ||
		id.includes("text-babbage") ||
		id.includes("text-ada")
	)
		return false
	return true
}

function modelSupportsVision(modelId: string): boolean {
	const id = (modelId || "").toLowerCase()
	// deepseek-flash (DeepSeek-V4.1-Flash) is multimodal and accepts images; deepseek-v4-pro is text-only.
	if (id.includes("deepseek")) return id.includes("flash") || id.includes("vl")
	if (id.includes("o3-mini") || id.includes("o1-mini")) return false
	if (id.includes("qwen") && !id.includes("vl")) return false
	if (id.includes("llama") && !id.includes("vision")) return false
	return true
}

// Snapshot of the worktree taken when a task starts. Used to report the files
// a task changed and the diff of a single file.
let currentTaskSnapshot: {
	root: string
	baseline: GitSnapshot
	/** End state of the task, taken once its files are reported. */
	after?: GitSnapshot
} | null = null

function beginTaskSnapshot(root: string): GitSnapshot | null {
	if (!root) return null
	const baseline = captureGitSnapshot(root)
	currentTaskSnapshot = { root, baseline }
	return baseline.tree ? baseline : null
}

/**
 * Write a batch of thread-metadata values in one go (falling back to
 * one-by-one writes), ignoring the ones the storage layer refuses. Metadata is
 * decoration here — a failure must never abort a replay.
 */
async function writeThreadMetadata(
	threadId: string,
	ctrl: any,
	entries: Array<[string, unknown]>,
): Promise<void> {
	if (!threadId) return
	const values: Record<string, unknown> = {}
	for (const [key, value] of entries) {
		if (value === undefined) continue
		values[key] = value
	}
	if (Object.keys(values).length === 0) return
	try {
		if (typeof ctrl?.writeThreadMetadataValues === "function") {
			await ctrl.writeThreadMetadataValues({ threadId, values })
			return
		}
		for (const [key, value] of Object.entries(values)) {
			await ctrl?.writeThreadMetadataValue?.({ threadId, key, value })
		}
	} catch (e) {
		console.warn("[replay] failed to write thread metadata:", e)
	}
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
				safeSend(ctx.mainWindow, "harness:event", {
					type: "error",
					error: { message: errMsg },
					worktreePath: ctx.activeSessionPath,
				})
				safeSend(ctx.mainWindow, "harness:event", {
					type: "agent_end",
					reason: "error",
					worktreePath: ctx.activeSessionPath,
				})
				return
			}
			const threadBefore = h.getCurrentThreadId()
			const currentModelId = h.getCurrentModelId() || ""
			const baseline = beginTaskSnapshot(ctx.getActiveSession().projectRoot)
			if (baseline && ctx.mainWindow) {
				// Lets the renderer know a fresh task baseline exists, so it can
				// request the changed files once the task ends.
				safeSend(ctx.mainWindow, "harness:event", {
					type: "task_baseline",
					worktreePath: ctx.activeSessionPath,
				})
			}
			const hasImages =
				Array.isArray(command.images) && command.images.length > 0
			const messageContent = command.content || ""

			const imageFiles = hasImages
				? command.images.map((img: any) => ({
						type: "image",
						mediaType: img.mediaType || img.mimeType || "image/png",
						mimeType: img.mimeType || img.mediaType || "image/png",
						data: img.data || "",
						name: img.name || img.filename || "image.png",
						filename: img.name || img.filename || "image.png",
					}))
				: []

			const nonImgFiles =
				Array.isArray(command.files) && command.files.length > 0
					? command.files.map((f: any) => ({
							type: "file",
							mediaType: f.mediaType || f.mimeType || "text/plain",
							mimeType: f.mimeType || f.mediaType || "text/plain",
							data: f.data || "",
							name: f.name || f.filename || "attachment.txt",
							filename: f.name || f.filename || "attachment.txt",
						}))
					: []

			const allFiles = [...imageFiles, ...nonImgFiles]

			const startTime = Date.now()
			h.sendMessage({
				content: messageContent,
				...(allFiles.length > 0 ? { files: allFiles } : {}),
				...(imageFiles.length > 0 ? { images: imageFiles } : {}),
			})
				.then(async () => {
					const threadAfter = h.getCurrentThreadId()
					const durationMs = Date.now() - startTime
					if (threadAfter) {
						try {
							const session = h.activeSession
							const memoryStore =
								typeof (session as any)?.memory?.storage?.getStore ===
								"function"
									? await (session as any).memory.storage.getStore("memory")
									: (session as any)?.memory?.storage
							if (memoryStore?.updateMessageDuration) {
								await memoryStore.updateMessageDuration({
									threadId: threadAfter,
									durationMs,
								})
							}
						} catch {}
					}
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
					safeSend(ctx.mainWindow, "harness:event", {
						type: "error",
						error: { message: errMsg },
						worktreePath: ctx.activeSessionPath,
					})
					safeSend(ctx.mainWindow, "harness:event", {
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
		// Files changed by the current task, with +/- line counts
		getTaskChangedFiles: async (command, ctx) => {
			const root =
				currentTaskSnapshot?.root || ctx?.getActiveSession()?.projectRoot
			const baseline = currentTaskSnapshot?.baseline
			if (!root || !baseline?.tree) return { files: [] }
			try {
				// The end state is snapshotted here rather than diffing against
				// HEAD, so a task that commits its own work still reports counts.
				const after = captureGitSnapshot(root)
				if (currentTaskSnapshot) currentTaskSnapshot.after = after
				const files = diffBetweenSnapshots(root, baseline, after)
				const threadId =
					(command.threadId as string) ||
					ctx.getActiveSession().harness.getCurrentThreadId() ||
					""
				const messageId = command.messageId as string
				const durationMs =
					typeof command.durationMs === "number"
						? command.durationMs
						: undefined
				if (threadId && messageId) {
					if (files.length > 0) {
						// Diffs are captured now because the in-memory snapshot is gone
						// after a restart.
						const diffs: Record<string, string> = {}
						for (const file of files) {
							diffs[file.path] = diffFileBetweenSnapshots(
								root,
								baseline,
								after,
								file.path,
							)
						}
						saveTaskChanges({ threadId, messageId, files, diffs, durationMs })
					} else if (durationMs != null) {
						saveTaskDuration({ threadId, messageId, durationMs })
					}
				}
				return { files }
			} catch (err) {
				console.warn("getTaskChangedFiles failed:", err)
				return { files: [] }
			}
		},
		saveTaskDuration: async (command, ctx) => {
			const threadId =
				(command.threadId as string) ||
				ctx?.getActiveSession()?.harness.getCurrentThreadId() ||
				""
			const messageId = command.messageId as string | undefined
			const durationMs =
				typeof command.durationMs === "number" ? command.durationMs : undefined
			if (!threadId || durationMs == null) return

			if (messageId) {
				saveTaskDuration({ threadId, messageId, durationMs })
			}
			try {
				const h = ctx.getActiveSession().harness
				const session = h.activeSession
				const memoryStore =
					typeof (session as any)?.memory?.storage?.getStore === "function"
						? await (session as any).memory.storage.getStore("memory")
						: (session as any)?.memory?.storage
				if (memoryStore?.updateMessageDuration) {
					await memoryStore.updateMessageDuration({
						threadId,
						messageId,
						durationMs,
					})
				}
			} catch (err) {
				console.warn("Failed to persist message duration in SQLite:", err)
			}
		},
		// Unified diff of one file changed by the current task
		getTaskFileDiff: async (command, ctx) => {
			if (!command.path) return { diff: "" }
			const threadId =
				(command.threadId as string) ||
				ctx?.getActiveSession()?.harness.getCurrentThreadId() ||
				""
			const messageId = command.messageId as string
			if (threadId && messageId) {
				const stored = getStoredFileDiff(
					threadId,
					messageId,
					command.path as string,
				)
				if (stored !== null) return { diff: stored }
			}
			const root =
				currentTaskSnapshot?.root || ctx?.getActiveSession()?.projectRoot
			const baseline = currentTaskSnapshot?.baseline
			if (!root || !baseline?.tree) return { diff: "" }
			try {
				return {
					diff: diffFileBetweenSnapshots(
						root,
						baseline,
						currentTaskSnapshot?.after ?? captureGitSnapshot(root),
						command.path as string,
					),
				}
			} catch (err) {
				console.warn("getTaskFileDiff failed:", err)
				return { diff: "" }
			}
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
			const s = ctx.getActiveSession()
			await s.harness.switchMode({ modeId: command.modeId })
			const threadId =
				(command.threadId as string) || s.harness.getCurrentThreadId()
			if (threadId) {
				const ctrl = (s.harness as any).controller
				await ctrl?.writeThreadMetadataValue?.({
					threadId,
					key: "modeId",
					value: command.modeId,
				})
			}
		},
		switchModel: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await s.harness.switchModel({
				modelId: command.modelId,
				scope: command.scope,
				modeId: command.modeId,
			})
			const threadId =
				(command.threadId as string) || s.harness.getCurrentThreadId()
			if (threadId) {
				const ctrl = (s.harness as any).controller
				await ctrl?.writeThreadMetadataValue?.({
					threadId,
					key: "modelId",
					value: command.modelId,
				})
			}
		},
		switchThread: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await s.harness.switchThread({ threadId: command.threadId })
			await ctx.ensureAuthenticatedModel(s.harness, s.authStorage)
			if (s.projectRoot && command.threadId) {
				const recent = loadRecentProjects()
				const exists = recent.some(
					(r) =>
						path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase() ===
						path.resolve(s.projectRoot).replace(/\/+$/, "").toLowerCase(),
				)
				if (exists) {
					saveRecentProjectLastThread(s.projectRoot, command.threadId)
				}
			}
		},
		createThread: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const thread = await s.harness.createThread({
				title: command.title,
				metadata: command.metadata,
			})
			await ctx.ensureAuthenticatedModel(s.harness, s.authStorage)
			if (s.projectRoot && thread?.id) {
				const recent = loadRecentProjects()
				const exists = recent.some(
					(r) =>
						path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase() ===
						path.resolve(s.projectRoot).replace(/\/+$/, "").toLowerCase(),
				)
				if (exists) {
					saveRecentProjectLastThread(s.projectRoot, thread.id)
				}
			}
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

			safeSend(ctx.mainWindow, "harness:event", {
				type: "thread_title_updated",
				threadId: targetThreadId,
				title: newTitle,
				worktreePath: ctx.activeSessionPath,
			})
		},
		deleteThread: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await ctx.deleteThread(s.harness, command.threadId)
			deleteThreadTaskChanges(command.threadId)
			if (s.projectRoot) {
				const current = s.harness.getCurrentThreadId()
				if (current) {
					const recent = loadRecentProjects()
					const exists = recent.some(
						(r) =>
							path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase() ===
							path.resolve(s.projectRoot).replace(/\/+$/, "").toLowerCase(),
					)
					if (exists) {
						saveRecentProjectLastThread(s.projectRoot, current)
					}
				}
			}
		},
		getMessages: async (command, ctx) => {
			if (!command.threadId && !isActiveProject(ctx)) return []
			const h = ctx.getActiveSession().harness
			const threadId = command.threadId || h.getCurrentThreadId()
			if (!threadId) return []
			try {
				const rawMessages = await h.listMessages({
					threadId,
					limit: command.limit,
				})
				const messages = (rawMessages ?? []).map(normalizeControllerMessage)
				// Restore the files each task changed, saved when the task ended, so
				// the records survive an app restart.
				const stored = getThreadTaskChanges(threadId)
				return messages.map((m) => {
					const id = (m as { id?: string })?.id
					const storedItem = id ? stored[id] : undefined
					const files = storedItem?.files
					const durationMs =
						(m as { durationMs?: number })?.durationMs ?? storedItem?.durationMs
					return {
						...(m as Record<string, unknown>),
						...(files && files.length > 0 ? { changedFiles: files } : {}),
						...(durationMs != null ? { durationMs } : {}),
					}
				})
			} catch (err) {
				console.error("[ipc] getMessages error:", err)
				return []
			}
		},
		getModes: async (_command, ctx) => {
			return ctx
				.getActiveSession()
				.harness.listModes()
				.map((m: any) => ({
					id: m.id,
					name: m.name,
					color: m.color,
					topology: m.topology,
				}))
		},
		getModeGraph: async (command, ctx) => {
			const s = ctx.getActiveSession()
			return s.harness.getModeGraph?.({ modeId: (command as any).modeId })
		},
		listExecutionModes: async (_command, ctx) => {
			const s = ctx.getActiveSession()
			return s.harness.listExecutionModes?.() ?? []
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
			if (!isActiveProject(ctx)) {
				return {
					currentThreadId: null,
					currentModeId: "fast",
					threads: [],
				}
			}
			const h = ctx.getActiveSession().harness
			const session = await h.getSession()
			await h.loadOMProgress?.().catch(() => {})
			return session
		},
		getMessageQueue: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const threadId = (command.threadId as string) || h.getCurrentThreadId()
			if (!threadId) return []
			return await h.getMessageQueue({ threadId })
		},
		setMessageQueue: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const threadId = (command.threadId as string) || h.getCurrentThreadId()
			if (!threadId) return { success: false }
			await h.setMessageQueue({
				threadId,
				queue: command.queue || [],
			})
			return { success: true }
		},
		listThreads: async (_command, ctx) => {
			if (!isActiveProject(ctx)) return []
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
				const idLower = m.id.toLowerCase()
				if (
					idLower.includes("deepseek") &&
					!idLower.endsWith("/deepseek-flash") &&
					!idLower.endsWith("/deepseek-v4-pro") &&
					idLower !== "deepseek-flash" &&
					idLower !== "deepseek-v4-pro"
				) {
					continue
				}
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
		toggleSessionRecording: async (command, ctx) => {
			let threadId = (command.threadId as string) || undefined
			let projectPath = (command.projectPath as string) || undefined
			let active: any = null
			try {
				active = ctx.getActiveSession()
				if (!threadId)
					threadId = active?.harness?.getCurrentThreadId() || undefined
				if (!projectPath)
					projectPath =
						active?.projectRoot || ctx.activeSessionPath || undefined
			} catch {}

			const enabled =
				typeof command.enabled === "boolean" ? command.enabled : undefined
			const isCurrentlyRecording = sessionRecordingManager.isRecording(
				threadId,
				projectPath,
			)
			const willStart = enabled !== undefined ? enabled : !isCurrentlyRecording

			if (willStart) {
				const ctrl = active?.harness?.controller
				const isRunning = ctrl?.isRunning
					? ctrl.isRunning()
					: Boolean(ctrl?._isRunning)
				if (isRunning) {
					return {
						isRecording: false,
						valid: false,
						error: "任务执行中，不允许录制",
						threadId,
						...sessionRecordingManager.getStatus(),
					}
				}
			}

			const isRecording = sessionRecordingManager.toggleRecording(
				threadId,
				projectPath,
				enabled,
			)
			const status = sessionRecordingManager.getStatus()

			safeSend(ctx.mainWindow, "harness:event", {
				type: "session_recording_changed",
				threadId,
				projectPath,
				isRecording,
				recordingThreads: status.recordingThreads,
				recordingProjects: status.recordingProjects,
				worktreePath: ctx.activeSessionPath,
			})

			let valid = true
			let error: string | undefined
			let reason: string | undefined
			let filePath: string | undefined
			let eventCount = 0
			let size = 0

			if (!isRecording) {
				const sessionsDir =
					process.env.MYAGENT_SESSIONS_DIR ||
					path.join(os.homedir(), ".myagent", "sessions")
				const recordings = sessionRecordingManager.listRecordings(
					sessionsDir,
					threadId,
				)
				const latestRec =
					recordings[0] ||
					sessionRecordingManager.listRecordings(sessionsDir)[0]
				const validation = validateRecordingFile(latestRec?.filePath)

				if (!validation.valid) {
					valid = false
					error = "record failed"
					reason = validation.reason
				} else {
					valid = true
					filePath = latestRec.filePath
					eventCount = validation.eventCount
					size = latestRec.size
				}
			}

			return {
				isRecording,
				valid,
				error,
				reason,
				filePath,
				threadId,
				eventCount,
				size,
				recordingThreads: status.recordingThreads,
				recordingProjects: status.recordingProjects,
			}
		},
		exportSessionRecording: async (command, ctx) => {
			const sessionsDir =
				process.env.MYAGENT_SESSIONS_DIR ||
				path.join(os.homedir(), ".myagent", "sessions")
			let threadId = (command.threadId as string) || undefined
			try {
				if (!threadId)
					threadId =
						ctx.getActiveSession()?.harness?.getCurrentThreadId() || undefined
			} catch {}

			let sourcePath = command.filePath as string | undefined
			if (!sourcePath && threadId) {
				const recs = sessionRecordingManager.listRecordings(
					sessionsDir,
					threadId,
				)
				if (recs.length > 0) sourcePath = recs[0].filePath
			}
			if (!sourcePath) {
				const recs = sessionRecordingManager.listRecordings(sessionsDir)
				if (recs.length > 0) sourcePath = recs[0].filePath
			}

			if (!sourcePath || !fs.existsSync(sourcePath)) {
				throw new Error("No recording file found to export.")
			}

			const format = command.format === "jsonl" ? "jsonl" : "json"
			const { dialog, shell } = await import("electron")
			const dateStr = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, 19)
			const defaultExportName = `session-recording-${threadId || "export"}-${dateStr}.${format}`
			const saveRes = await dialog.showSaveDialog(ctx.mainWindow!, {
				title: "Export Session Recording Data",
				defaultPath: path.join(os.homedir(), "Downloads", defaultExportName),
				filters:
					format === "json"
						? [
								{ name: "JSON (*.json)", extensions: ["json"] },
								{ name: "JSON Lines (*.jsonl)", extensions: ["jsonl"] },
								{ name: "All Files", extensions: ["*"] },
							]
						: [
								{ name: "JSON Lines (*.jsonl)", extensions: ["jsonl"] },
								{ name: "JSON (*.json)", extensions: ["json"] },
								{ name: "All Files", extensions: ["*"] },
							],
			})

			if (saveRes.canceled || !saveRes.filePath) {
				return { cancelled: true }
			}

			const rawContent = fs.readFileSync(sourcePath, "utf8")
			if (saveRes.filePath.endsWith(".json")) {
				let events: any[] = []
				const trimmed = rawContent.trim()
				if (trimmed.startsWith("[")) {
					try {
						events = JSON.parse(trimmed)
					} catch {}
				} else {
					events = trimmed
						.split("\n")
						.map((l) => l.trim())
						.filter(Boolean)
						.map((l) => {
							try {
								return JSON.parse(l)
							} catch {
								return l
							}
						})
				}
				fs.writeFileSync(
					saveRes.filePath,
					JSON.stringify(events, null, 2),
					"utf8",
				)
			} else {
				const trimmed = rawContent.trim()
				if (trimmed.startsWith("[")) {
					try {
						const events = JSON.parse(trimmed)
						if (Array.isArray(events)) {
							const jsonl =
								events.map((e) => JSON.stringify(e)).join("\n") + "\n"
							fs.writeFileSync(saveRes.filePath, jsonl, "utf8")
						} else {
							fs.writeFileSync(saveRes.filePath, rawContent, "utf8")
						}
					} catch {
						fs.writeFileSync(saveRes.filePath, rawContent, "utf8")
					}
				} else {
					fs.writeFileSync(saveRes.filePath, rawContent, "utf8")
				}
			}

			try {
				shell.showItemInFolder(saveRes.filePath)
			} catch {}

			safeSend(ctx.mainWindow, "harness:event", {
				type: "session_recording_exported",
				threadId,
				filePath: saveRes.filePath,
				worktreePath: ctx.activeSessionPath,
			})

			return {
				success: true,
				filePath: saveRes.filePath,
			}
		},
		selectRecordingFile: async (_command, ctx) => {
			const { dialog } = await import("electron")
			const res = await dialog.showOpenDialog(ctx.mainWindow!, {
				title: "Select Recording File to Replay",
				filters: [
					{
						name: "Recording Files (*.json, *.jsonl)",
						extensions: ["json", "jsonl"],
					},
					{ name: "JSON (*.json)", extensions: ["json"] },
					{ name: "JSON Lines (*.jsonl)", extensions: ["jsonl"] },
					{ name: "All Files", extensions: ["*"] },
				],
				properties: ["openFile"],
			})
			if (res.canceled || !res.filePaths[0]) {
				return { canceled: true }
			}
			const filePath = res.filePaths[0]
			const stat = fs.statSync(filePath)
			return {
				canceled: false,
				filePath,
				fileName: path.basename(filePath),
				size: stat.size,
			}
		},
		getSessionRecordingStatus: async (_command, _ctx) => {
			return sessionRecordingManager.getStatus()
		},
		listSessionRecordings: async (command, ctx) => {
			const sessionsDir =
				process.env.MYAGENT_SESSIONS_DIR ||
				path.join(os.homedir(), ".myagent", "sessions")
			let threadId = (command.threadId as string) || undefined
			if (!threadId) {
				try {
					threadId =
						ctx.getActiveSession()?.harness?.getCurrentThreadId() || undefined
				} catch {}
			}
			return sessionRecordingManager.listRecordings(sessionsDir, threadId)
		},
		startSessionReplay: async (command, ctx) => {
			let filePath = command.filePath as string | undefined
			const sessionsDir =
				process.env.MYAGENT_SESSIONS_DIR ||
				path.join(os.homedir(), ".myagent", "sessions")
			let threadId = (command.threadId as string) || ""
			if (!threadId) {
				try {
					threadId = ctx.getActiveSession()?.harness?.getCurrentThreadId() || ""
				} catch {}
			}

			if (!filePath && threadId) {
				const recordings = sessionRecordingManager.listRecordings(
					sessionsDir,
					threadId,
				)
				if (recordings.length > 0) {
					filePath = recordings[0].filePath
				}
			}

			if (!filePath || !fs.existsSync(filePath)) {
				throw new Error(
					`Recording file not found: ${filePath || "no recording found for thread"}`,
				)
			}

			const content = fs.readFileSync(filePath, "utf8")
			const script = deriveReplayScript(content)
			const replayModel = createReplayModel(script, {
				speed: command.speed || "instant",
				// The same file must be replayable more than once: wrap instead of
				// throwing once the last recorded step has been used.
				onExhausted: "wrap",
			})
			const s = ctx.getActiveSession()
			const ctrl = (s?.harness as any)?.controller

			if (!threadId && s?.harness?.createThread) {
				try {
					const title = `Replay: ${path.basename(filePath, path.extname(filePath))}`
					const newThread = await s.harness.createThread({
						title,
						metadata: { isReplay: true, replayFile: path.basename(filePath) },
					})
					threadId = newThread?.id || ""
				} catch (e) {
					console.error("Failed to create thread for replay:", e)
				}
			}

			// How many playbacks this thread has had once this one is written, and
			// whether writing the reconstructed block failed.
			let playbackIndex = 1
			let replayError: string | null = null

			if (threadId) {
				// A replay only reconstructs the transcript, so it must never lend
				// its offline model to a run that is already streaming — that run
				// would answer the user's real prompt with the recorded reply and
				// leave a duplicate answer next to the reconstruction.
				const liveSession = (s?.harness as any)?.activeSession ?? null
				const runActive = isReplayRunActive(liveSession)
				if (!runActive) {
					sessionRecordingManager.setReplayModel(threadId, replayModel)
				}

				// This replay is a reconstruction, so no run consumes the recorded
				// runtime: switching model/mode/permission would only rattle the
				// composer's pickers (and, if a run happened to be streaming, would
				// change *that* run's settings). The snapshot is taken before
				// anything is written so the restore still has something to hand
				// back if a replay state outlives this call.
				const recordedRuntime = script.runtime ?? script.session?.runtime
				if (recordedRuntime) {
					beginSessionReplay(liveSession, threadId, recordedRuntime, {
						apply: false,
					})
				}

				try {
					await writeThreadMetadata(threadId, ctrl, [
						["replayFile", path.basename(filePath)],
					])

					// Reconstruct recorded messages and save into thread memory store.
					// The messages must carry the thread's real resourceId — the
					// message query filters on it, so a hardcoded "default" made the
					// whole replay invisible.
					const resourceId =
						(ctrl as any)?.resourceId ||
						(s?.harness as any)?.resourceId ||
						"default"
					let store = await ctrl?.getMemoryStore?.()
					if (
						!store &&
						typeof (s?.harness as any)?.getMemoryStore === "function"
					) {
						store = await (s.harness as any).getMemoryStore()
					}
					if (!store && (s?.harness as any)?.storage) {
						const st = (s.harness as any).storage
						store =
							typeof st.getStore === "function"
								? await st.getStore("memory")
								: st
					}

					// Inspect what is already in the thread before inserting: an earlier
					// playback of the same file stays where it is, and this one is
					// appended after the whole conversation (otherwise the new block
					// would interleave with the old one, or with live messages).
					let existingMessages: any[] = []
					if (typeof store?.listMessages === "function") {
						try {
							const existing = await store.listMessages({
								threadId,
								orderBy: { field: "createdAt", direction: "ASC" },
							})
							existingMessages = existing?.messages || []
						} catch (e) {
							console.warn("Failed to read existing messages:", e)
						}
					}

					// How many playbacks this thread already holds. Reported back so the
					// toast can say "Replay #3" instead of looking like a no-op.
					const knownPlaybacks = new Set<string>()
					for (const message of existingMessages) {
						if (typeof message?.id !== "string") continue
						if (!message.id.startsWith("replay-")) continue
						knownPlaybacks.add(replayPlaybackKey(message.id) ?? "legacy")
					}
					playbackIndex = knownPlaybacks.size + 1

					// Each playback gets a fresh id space. Without it a second replay of
					// the same file writes rows with identical ids, which the message
					// store upserts into the *existing* rows: the transcript stays
					// byte-identical and the new playback is invisible.
					const playbackId = `pb${Date.now().toString(36)}${Math.random()
						.toString(36)
						.slice(2, 5)}`
					const reconstructedMessages = reconstructMessagesFromRecording(
						content,
						threadId,
						resourceId,
						existingMessages.length > 0 ? Date.now() : undefined,
						{ playbackId },
					)

					if (store?.saveMessages && reconstructedMessages.length > 0) {
						// Append. Replaying the same recording several times is a
						// legitimate review workflow — each pass has to show up as its
						// own block, so nothing from the previous playback is removed.
						await store.saveMessages({ messages: reconstructedMessages })
					}
				} catch (e) {
					replayError = e instanceof Error ? e.message : String(e)
					console.error("Failed to write thread replay metadata / messages:", e)
				}
			}

			// A replay here is a *reconstruction*, not a live run: once the
			// recorded block is in the thread there is nothing left to stream, so
			// the session must not stay parked on the recorded model/mode/
			// permission (nor keep the "replaying" badge lit). Only a caller that
			// really drives a run keeps the replay state alive, in which case the
			// controller's `finally` finishes it once that run ends.
			const stillRunning = threadId
				? isReplayRunActive((s?.harness as any)?.activeSession)
				: false

			safeSend(ctx.mainWindow, "harness:event", {
				type: "session_replay_started",
				threadId,
				filePath,
				replayFile: path.basename(filePath),
				stepCount: script.entries.length,
				worktreePath: ctx.activeSessionPath,
			})

			if (threadId && !stillRunning) {
				await writeThreadMetadata(threadId, ctrl, [["isReplay", false]])
				const { restored } = endSessionReplay(
					(s?.harness as any)?.activeSession,
					threadId,
				)
				await writeThreadMetadata(threadId, ctrl, runtimeMetadata(restored))
				safeSend(ctx.mainWindow, "harness:event", {
					type: "session_replay_stopped",
					threadId,
					worktreePath: ctx.activeSessionPath,
				})
			} else if (threadId) {
				await writeThreadMetadata(threadId, ctrl, [["isReplay", true]])
			}

			return {
				success: true,
				filePath,
				stepCount: script.entries.length,
				threadId,
				// Tells the renderer the replay already completed, so it does not
				// light the sidebar badge for a replay that is over.
				finished: !stillRunning,
				// Lets the renderer say "Replay #3" instead of leaving the user
				// unsure whether the second pass actually ran.
				playbackIndex,
				// Non-null when the transcript could not be written at all.
				error: replayError,
			}
		},
		stopSessionReplay: async (command, ctx) => {
			let threadId = (command.threadId as string) || ""
			if (!threadId) {
				try {
					threadId = ctx.getActiveSession()?.harness?.getCurrentThreadId() || ""
				} catch {}
			}
			if (threadId) {
				const s = ctx.getActiveSession()
				const ctrl = (s?.harness as any)?.controller
				const liveSession = (s?.harness as any)?.activeSession ?? null
				// Stopping by hand has to undo the same switch the replay made:
				// otherwise the session stays on the recorded mode / permission.
				const { restored } = endSessionReplay(liveSession, threadId)
				await writeThreadMetadata(threadId, ctrl, [
					...runtimeMetadata(restored),
					["isReplay", false],
				])
			}
			safeSend(ctx.mainWindow, "harness:event", {
				type: "session_replay_stopped",
				threadId,
				worktreePath: ctx.activeSessionPath,
			})
			return { success: true, threadId }
		},
	}
}
