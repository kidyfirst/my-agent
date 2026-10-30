import { useEffect, useRef } from "react"
import type { ChatAction } from "../types/chat"
import type { ProjectInfo } from "../types/project"
import type {
	HarnessEventPayload,
	Message,
	TokenUsage,
	OMProgressState,
	ThreadInfo,
	UpdateInfo,
} from "../types/ipc"
import type { RightSidebarTab } from "../components/RightSidebar"
import type { PermissionMode } from "./useThreadModelPermissions"
import { playCompletionSound } from "../utils/audio"

export interface HarnessCallbacks {
	dispatch: React.Dispatch<ChatAction>
	setModeId: (v: string) => void
	setModelId: (v: string) => void
	setThreadModel?: (threadId: string, modelId: string) => void
	setThreadMode?: (threadId: string, modeId: string) => void
	setThreadPermission?: (
		threadId: string,
		permissionMode: PermissionMode,
	) => void
	setThreadThinking?: (threadId: string, level: string) => void
	setThinkingLevel?: (v: string) => void
	setCurrentThreadId: (v: string | null) => void
	setRunningThreadId?: (v: string | null) => void
	setTokenUsage: (v: TokenUsage) => void
	setOMProgress: (v: OMProgressState | null) => void
	setOMModelIds: React.Dispatch<
		React.SetStateAction<{ observer: string; reflector: string }>
	>
	setThreads: React.Dispatch<React.SetStateAction<ThreadInfo[]>>
	setOpenThreadTabs: React.Dispatch<React.SetStateAction<string[]>>
	setActiveTab: React.Dispatch<React.SetStateAction<string>>
	setTasks: React.Dispatch<
		React.SetStateAction<
			Array<{
				content: string
				status: "pending" | "in_progress" | "completed"
				activeForm: string
			}>
		>
	>
	setPendingApproval: (v: any) => void
	setPendingQuestion: (v: any) => void
	setPendingPlan: (v: any) => void
	setActiveGraphNode?: (
		node: { nodeId: string; nodeLabel: string; modeId: string } | null,
	) => void
	setLoginState: (v: any) => void
	setIsAuthenticated: (v: boolean) => void
	setLoggedInProviders: React.Dispatch<React.SetStateAction<Set<string>>>
	setProjectInfo: (v: ProjectInfo | null) => void
	setProjectSwitching: (v: boolean) => void
	setOpenFiles: React.Dispatch<React.SetStateAction<string[]>>
	setUnreadWorktrees: React.Dispatch<React.SetStateAction<Set<string>>>
	setActiveWorktrees: React.Dispatch<React.SetStateAction<Set<string>>>
	setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
	setRightSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
	setRightSidebarTab: React.Dispatch<React.SetStateAction<RightSidebarTab>>
	setRecordingThreads?: React.Dispatch<React.SetStateAction<Set<string>>>
	setRecordingProjects?: React.Dispatch<React.SetStateAction<Set<string>>>
	setReplayingThreads?: React.Dispatch<React.SetStateAction<Set<string>>>
	setReplayingProjects?: React.Dispatch<React.SetStateAction<Set<string>>>
	/** Developer logging switch — drives the sidebar Logging entry. */
	setLoggingEnabled?: (enabled: boolean) => void
	projectInfoRef: React.RefObject<ProjectInfo | null>
	notificationPrefRef: React.RefObject<string>
	loadMessages: (threadId?: string) => Promise<void>
	/** Id of the last assistant message, used to attach task results to it. */
	getLastAssistantMessageId: () => string | null
	getAgentDurationMs?: () => number | undefined
	currentThreadId?: string | null
	/** `path` tags the list with the folder it was listed for (see `threadsPath`). */
	loadThreads: (path?: string) => Promise<ThreadInfo[] | undefined>
	loadPRStatus: () => void
	loadEnrichedProjects: () => Promise<any>
	handleNewThread: () => void
	handleOpenFolder: () => void
	handleBrowserOpenRef: React.RefObject<(url: string) => void>
	initializeApp: () => Promise<void>
	setShowCommandPalette: React.Dispatch<React.SetStateAction<boolean>>
	setUpdateInfo?: React.Dispatch<React.SetStateAction<UpdateInfo | null>>
	setDownloadProgress?: React.Dispatch<
		React.SetStateAction<{
			percent: number
			downloadedBytes: number
			totalBytes: number
		} | null>
	>
}

export function useHarnessEvents(callbacks: HarnessCallbacks) {
	const cbRef = useRef(callbacks)
	cbRef.current = callbacks

	useEffect(() => {
		const unsubscribe = window.api.onEvent((raw: unknown) => {
			const cb = cbRef.current
			const event = raw as HarnessEventPayload
			const worktreePath = (event as any).worktreePath as string | undefined
			const currentRoot = cb.projectInfoRef.current?.rootPath
			const normalize = (p?: string) => p?.replace(/\/+$/, "")
			const isActiveWorktree =
				!worktreePath ||
				!currentRoot ||
				worktreePath === currentRoot ||
				normalize(worktreePath) === normalize(currentRoot)

			switch (event.type) {
				case "agent_start":
					if (isActiveWorktree) {
						cb.dispatch({ type: "AGENT_START" })
						const runningId =
							(event as any).threadId || cb.currentThreadId || null
						cb.setRunningThreadId?.(runningId)
					}
					if (worktreePath) {
						cb.setActiveWorktrees((prev) => new Set(prev).add(worktreePath))
					} else if (cb.projectInfoRef.current?.rootPath) {
						cb.setActiveWorktrees((prev) =>
							new Set(prev).add(cb.projectInfoRef.current!.rootPath),
						)
					}
					break
				case "agent_end": {
					const endPath = worktreePath || cb.projectInfoRef.current?.rootPath
					if (isActiveWorktree) {
						// Attach the files this task changed to its last assistant
						// message and persist the turn duration.
						const lastAssistant = cb.getLastAssistantMessageId()
						const durationMs = cb.getAgentDurationMs
							? cb.getAgentDurationMs()
							: undefined
						window.api
							.invoke({
								type: "getTaskChangedFiles",
								messageId: lastAssistant || undefined,
								durationMs,
							})
							.then((result: unknown) => {
								const files = (result as { files?: Message["changedFiles"] })
									?.files
								if (files && files.length > 0) {
									cb.dispatch({
										type: "SET_MESSAGE_CHANGED_FILES",
										messageId: lastAssistant || "",
										files,
									})
								}
							})
							.catch(() => {})
						if (durationMs != null) {
							window.api
								.invoke({
									type: "saveTaskDuration",
									threadId: cb.currentThreadId || undefined,
									messageId: lastAssistant || undefined,
									durationMs,
								})
								.catch(() => {})
						}
						cb.dispatch({ type: "AGENT_END" })
						cb.setRunningThreadId?.(null)
						cb.loadThreads()
						cb.loadPRStatus()
						if ((event as any).reason !== "error") {
							cb.loadMessages().catch(() => {})
						}
					}
					if (endPath) {
						cb.setActiveWorktrees((prev) => {
							const next = new Set(prev)
							next.delete(endPath)
							return next
						})
						const isCurrentAndFocused =
							document.hasFocus() &&
							endPath === cb.projectInfoRef?.current?.rootPath
						if (!isCurrentAndFocused) {
							cb.setUnreadWorktrees((prev) => new Set(prev).add(endPath))
						}
					}
					const pref = cb.notificationPrefRef.current
					if (pref === "bell" || pref === "both") {
						playCompletionSound()
					}
					break
				}
				case "thread_title_updated":
					cb.loadThreads()
					break
				case "message_start":
					if (isActiveWorktree && event.message) {
						cb.dispatch({
							type: "MESSAGE_START",
							message: event.message as Message,
						})
					}
					break
				case "message_update":
					if (isActiveWorktree) {
						const msg =
							(event.message as Message | undefined) ||
							((event as any).id
								? ({
										id: (event as any).id,
										role: "assistant",
										content: [],
										createdAt: new Date().toISOString(),
									} as Message)
								: undefined)
						if (msg) {
							cb.dispatch({
								type: "MESSAGE_UPDATE",
								message: msg,
							})
						}
					}
					break
				case "message_end":
					if (isActiveWorktree) {
						const msg =
							(event.message as Message | undefined) ||
							((event as any).id
								? ({
										id: (event as any).id,
										role: "assistant",
										content: [],
										createdAt: new Date().toISOString(),
									} as Message)
								: undefined)
						if (msg) {
							cb.dispatch({
								type: "MESSAGE_END",
								message: msg,
							})
						}
						window.api
							.invoke({ type: "getTokenUsage" })
							.then((usage) => {
								if (usage) cb.setTokenUsage(usage as TokenUsage)
							})
							.catch(() => {})
					}
					break
				case "tool_start":
					if (isActiveWorktree)
						cb.dispatch({
							type: "TOOL_START",
							id: event.toolCallId as string,
							name: event.toolName as string,
							args: event.args,
						})
					break
				case "tool_update":
					if (isActiveWorktree)
						cb.dispatch({
							type: "TOOL_UPDATE",
							id: event.toolCallId as string,
							partialResult: event.partialResult,
						})
					break
				case "tool_end":
					if (isActiveWorktree)
						cb.dispatch({
							type: "TOOL_END",
							id: event.toolCallId as string,
							result: event.result,
							isError: event.isError as boolean,
						})
					break
				case "shell_output":
					if (isActiveWorktree)
						cb.dispatch({
							type: "SHELL_OUTPUT",
							id: event.toolCallId as string,
							output: event.output as string,
							stream: event.stream as "stdout" | "stderr",
						})
					break
				case "tool_approval_required":
					cb.setPendingApproval({
						toolCallId: event.toolCallId as string,
						toolName: event.toolName as string,
						args: event.args,
						category: (event.category as string) ?? null,
						categoryLabel: (event.categoryLabel as string) ?? null,
					})
					break
				case "ask_question":
					cb.setPendingQuestion({
						questionId: event.questionId as string,
						question: event.question as string,
						options: event.options as
							| Array<{ label: string; description?: string }>
							| undefined,
					})
					break
				case "plan_approval_required":
					cb.setPendingPlan({
						planId: event.planId as string,
						title: event.title as string,
						plan: event.plan as string,
					})
					break
				case "plan_approved":
					cb.setPendingPlan(null)
					break
				case "mode_changed": {
					const newMode = event.modeId as string
					cb.setModeId(newMode)
					if (cb.currentThreadId) {
						cb.setThreadMode?.(cb.currentThreadId, newMode)
					}
					break
				}
				case "graph_node_started":
					cb.setActiveGraphNode?.({
						nodeId: event.nodeId as string,
						nodeLabel: event.nodeLabel as string,
						modeId: event.modeId as string,
					})
					break
				case "graph_node_completed":
					cb.setActiveGraphNode?.(null)
					break
				case "model_changed": {
					const newModel = event.modelId as string
					cb.setModelId(newModel)
					if (cb.currentThreadId) {
						cb.setThreadModel?.(cb.currentThreadId, newModel)
					}
					break
				}
				case "permission_mode_changed": {
					// A replay switches the session to the recorded permission mode
					// and puts the user's own back when it ends; keep the composer
					// picker in sync with whichever mode is actually active.
					const perm = event.permissionMode as PermissionMode | undefined
					if (perm && cb.currentThreadId) {
						cb.setThreadPermission?.(cb.currentThreadId, perm)
					}
					break
				}
				case "thread_changed":
					cb.setCurrentThreadId(event.threadId as string)
					cb.loadMessages(event.threadId as string)
					cb.loadThreads()
					window.api
						.invoke({ type: "getTokenUsage" })
						.then((usage) => {
							if (usage) cb.setTokenUsage(usage as TokenUsage)
						})
						.catch(() => {})
					window.api
						.invoke({ type: "getOMProgress" })
						.then((progress) => {
							cb.setOMProgress((progress as OMProgressState) ?? null)
						})
						.catch(() => {})
					break
				case "thread_created": {
					const newThreadId = (event.thread as any)?.id
					if (newThreadId) {
						cb.setCurrentThreadId(newThreadId)
						cb.setOpenThreadTabs((prev) =>
							prev.includes(newThreadId) ? prev : [...prev, newThreadId],
						)
						cb.setActiveTab(`thread:${newThreadId}`)
					}
					cb.loadThreads()
					break
				}
				case "thread_deleted": {
					const deletedId = (event as any).threadId
					if (deletedId) {
						cb.setThreads((prev) => prev.filter((t) => t.id !== deletedId))
						cb.setOpenThreadTabs((prev) =>
							prev.filter((id) => id !== deletedId),
						)
					}
					cb.loadThreads()
					break
				}
				case "usage_update":
					if (isActiveWorktree) {
						window.api
							.invoke({ type: "getTokenUsage" })
							.then((usage) => {
								if (usage) cb.setTokenUsage(usage as TokenUsage)
							})
							.catch(() => {})
					}
					break
				case "om_status":
				case "om_observation_start":
				case "om_observation_end":
				case "om_observation_failed":
				case "om_reflection_start":
				case "om_reflection_end":
				case "om_reflection_failed":
				case "om_buffering_start":
				case "om_buffering_end":
				case "om_buffering_failed":
				case "om_activation":
					if (isActiveWorktree) {
						window.api
							.invoke({ type: "getOMProgress" })
							.then((progress) => {
								cb.setOMProgress((progress as OMProgressState) ?? null)
							})
							.catch(() => {})
					}
					break
				case "om_model_changed":
					if (isActiveWorktree) {
						const role = event.role as string
						const mid = event.modelId as string
						if (role && mid) {
							cb.setOMModelIds((prev) => ({
								...prev,
								[role === "observer" ? "observer" : "reflector"]: mid,
							}))
						}
					}
					break
				case "task_updated":
					cb.setTasks(
						event.tasks as Array<{
							content: string
							status: "pending" | "in_progress" | "completed"
							activeForm: string
						}>,
					)
					break
				case "subagent_start":
					cb.dispatch({
						type: "SUBAGENT_START",
						toolCallId: event.toolCallId as string,
						agentType: event.agentType as string,
						task: event.task as string,
						modelId: event.modelId as string | undefined,
					})
					break
				case "subagent_tool_start":
					cb.dispatch({
						type: "SUBAGENT_TOOL_START",
						toolCallId: event.toolCallId as string,
						subToolName: event.subToolName as string,
						subToolArgs: event.subToolArgs,
					})
					break
				case "subagent_tool_end":
					cb.dispatch({
						type: "SUBAGENT_TOOL_END",
						toolCallId: event.toolCallId as string,
						subToolName: event.subToolName as string,
						subToolResult: event.subToolResult,
						isError: event.isError as boolean,
					})
					break
				case "subagent_end":
					cb.dispatch({
						type: "SUBAGENT_END",
						toolCallId: event.toolCallId as string,
						result: event.result as string,
						isError: event.isError as boolean,
						durationMs: event.durationMs as number,
					})
					break
				case "error": {
					const err = event.error as { message?: string }
					const errorText =
						err?.message ?? String(event.error ?? "Unknown error")
					console.error("Harness error:", errorText)
					cb.dispatch({
						type: "MESSAGE_START",
						message: {
							id: `error-${Date.now()}`,
							role: "assistant",
							content: [{ type: "text", text: errorText }],
							createdAt: new Date().toISOString(),
							stopReason: "error",
							errorMessage: errorText,
						},
					})
					cb.dispatch({ type: "AGENT_END" })
					cb.setRunningThreadId?.(null)
					break
				}
				case "shortcut": {
					const action = (event as { action?: string }).action
					if (action === "new_thread") cb.handleNewThread()
					else if (action === "toggle_terminal")
						cb.setRightSidebarVisible((v) => !v)
					else if (action === "toggle_sidebar") cb.setSidebarVisible((v) => !v)
					else if (action === "toggle_right_sidebar")
						cb.setRightSidebarVisible((v) => !v)
					else if (action === "focus_git") {
						cb.setRightSidebarVisible(true)
						cb.setRightSidebarTab("git")
					} else if (action === "open_project") cb.handleOpenFolder()
					else if (action === "command_palette")
						cb.setShowCommandPalette((v) => !v)
					break
				}
				case "login_auth":
					cb.setLoginState({
						providerId: event.providerId as string,
						stage: "auth",
						url: event.url as string,
						instructions: event.instructions as string | undefined,
					})
					break
				case "login_prompt":
					cb.setLoginState((prev: any) => ({
						providerId: (event.providerId as string) ?? prev?.providerId ?? "",
						stage: "prompt",
						promptMessage: event.message as string,
						promptPlaceholder: event.placeholder as string | undefined,
					}))
					break
				case "login_progress":
					cb.setLoginState((prev: any) => ({
						providerId: (event.providerId as string) ?? prev?.providerId ?? "",
						stage: "progress",
						progressMessage: event.message as string,
					}))
					break
				case "login_success": {
					const pid = (event.providerId as string) ?? ""
					console.log(
						"[AUTH] login_success event, providerId:",
						pid,
						"modelId:",
						event.modelId,
					)
					cb.setLoginState((prev: any) => ({
						providerId: pid || prev?.providerId || "",
						stage: "success",
					}))
					cb.setModelId((event.modelId as string) ?? "")
					cb.setIsAuthenticated(true)
					cb.setLoggedInProviders((prev) => {
						const next = new Set(prev)
						next.add(pid)
						console.log("[AUTH] loggedInProviders updated:", [...next])
						return next
					})
					break
				}
				case "login_error":
					cb.setLoginState((prev: any) => ({
						providerId: (event.providerId as string) ?? prev?.providerId ?? "",
						stage: "error",
						errorMessage: event.error as string,
					}))
					break
				case "project_changed": {
					cb.dispatch({ type: "CLEAR" })
					const oldPath = cb.projectInfoRef.current?.rootPath
					if (oldPath) {
						cb.setActiveWorktrees((prev) => {
							if (!prev.has(oldPath)) return prev
							cb.setUnreadWorktrees((up) => new Set(up).add(oldPath))
							const next = new Set(prev)
							next.delete(oldPath)
							return next
						})
					}
					const proj = event.project as ProjectInfo
					const resumeThreadId = event.currentThreadId as string | undefined
					cb.setProjectSwitching(false)
					cb.setProjectInfo(proj)
					if (proj?.rootPath) {
						try {
							localStorage.setItem("myagent-last-project", proj.rootPath)
						} catch {}
					}
					cb.setOpenFiles([])
					cb.setUnreadWorktrees((prev) => {
						if (!prev.has(proj.rootPath)) return prev
						const next = new Set(prev)
						next.delete(proj.rootPath)
						return next
					})
					cb.setTokenUsage({
						promptTokens: 0,
						completionTokens: 0,
						totalTokens: 0,
					})
					cb.loadPRStatus()
					window.api
						.invoke({ type: "getTokenUsage" })
						.then((usage) => {
							if (usage) cb.setTokenUsage(usage as TokenUsage)
						})
						.catch(() => {})
					if (resumeThreadId) {
						cb.setCurrentThreadId(resumeThreadId)
						cb.setOpenThreadTabs([resumeThreadId])
						cb.setActiveTab(`thread:${resumeThreadId}`)
						if (proj?.rootPath) {
							localStorage.setItem(
								`myagent-last-thread-${proj.rootPath}`,
								resumeThreadId,
							)
						}
						cb.loadMessages(resumeThreadId)
						// Tagged with the project that just opened: the sidebar must
						// never render this list under the project it came from.
						cb.loadThreads(proj.rootPath)
					} else {
						cb.dispatch({ type: "CLEAR" })
						cb.setCurrentThreadId(null)
						cb.setThreads([])
						cb.setOpenThreadTabs([])
						cb.setActiveTab("chat")
						cb.loadThreads(proj.rootPath).then(async (loaded) => {
							if (loaded && loaded.length > 0) {
								const savedThreadId = proj?.rootPath
									? localStorage.getItem(`myagent-last-thread-${proj.rootPath}`)
									: null
								const recent =
									(savedThreadId &&
										loaded.find((t) => t.id === savedThreadId)) ||
									loaded[0]
								await window.api.invoke({
									type: "switchThread",
									threadId: recent.id,
								})
								cb.setCurrentThreadId(recent.id)
								cb.setOpenThreadTabs([recent.id])
								cb.setActiveTab(`thread:${recent.id}`)
								if (proj?.rootPath) {
									localStorage.setItem(
										`myagent-last-thread-${proj.rootPath}`,
										recent.id,
									)
								}
								cb.loadMessages(recent.id)
							}
						})
					}
					break
				}
				case "update_available":
					if ((event as any).updateInfo) {
						cb.setUpdateInfo?.((event as any).updateInfo as UpdateInfo)
					}
					break
				case "update_download_progress":
					cb.setDownloadProgress?.({
						percent: Number((event as any).percent) || 0,
						downloadedBytes: Number((event as any).downloadedBytes) || 0,
						totalBytes: Number((event as any).totalBytes) || 0,
					})
					break
				case "update_download_complete":
				case "update_download_error":
					cb.setDownloadProgress?.(null)
					break
				case "session_recording_changed": {
					const rThreads = (event as any).recordingThreads as
						| string[]
						| undefined
					const rProjects = (event as any).recordingProjects as
						| string[]
						| undefined
					if (Array.isArray(rThreads)) {
						cb.setRecordingThreads?.(new Set(rThreads))
					}
					if (Array.isArray(rProjects)) {
						cb.setRecordingProjects?.(new Set(rProjects))
					}
					break
				}
				case "session_recording_exported": {
					const filePath = (event as any).filePath as string | undefined
					if (filePath) {
						console.log(
							`[SessionRecording] Successfully exported session to ${filePath}`,
						)
					}
					break
				}
				case "session_replay_started": {
					const tId = (event as any).threadId as string | undefined
					if (tId) {
						cb.setReplayingThreads?.((prev) => new Set(prev).add(tId))
					}
					cb.loadThreads?.()
					break
				}
				case "session_replay_stopped": {
					const tId = (event as any).threadId as string | undefined
					const projectPath = (event as any).worktreePath as string | undefined
					cb.setReplayingThreads?.((prev) => {
						const s = new Set(prev)
						if (tId) s.delete(tId)
						else s.clear()
						return s
					})
					if (projectPath) {
						cb.setReplayingProjects?.((prev) => {
							const s = new Set(prev)
							s.delete(projectPath)
							return s
						})
					}
					cb.loadThreads?.()
					break
				}
				case "logging_config_changed": {
					const enabled = Boolean((event as any).config?.enabled)
					cb.setLoggingEnabled?.(enabled)
					break
				}
			}
		})

		cbRef.current.initializeApp()

		const unsubscribeUrl = window.api.onOpenUrl((url: string) => {
			cbRef.current.handleBrowserOpenRef.current(url)
		})

		return () => {
			unsubscribe()
			unsubscribeUrl()
		}
	}, [])
}
