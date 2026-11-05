import { useCallback, useRef } from "react"
import type { Dispatch } from "react"
import type { ChatAction } from "../types/chat"
import type { ThreadInfo } from "../types/ipc"
import { ExecutionMode } from "../types/ipc"
import type { PermissionMode } from "./useThreadModelPermissions"

export interface ThreadActionsOptions {
	dispatch: Dispatch<ChatAction>
	currentThreadId: string | null
	modelId: string
	modeId?: string
	thinkingLevel: string
	modelsByThread: Record<string, string>
	permissionsByThread: Record<string, PermissionMode>
	modesByThread?: Record<string, string>
	thinkingByThread?: Record<string, string>
	threadModel: {
		setThreadModel: (threadId: string, modelId: string) => void
		setThreadPermission: (threadId: string, permission: PermissionMode) => void
		setThreadMode?: (threadId: string, modeId: string) => void
		setThreadThinking?: (threadId: string, level: string) => void
		removeThread: (threadId: string) => void
		currentThreadPermission?: PermissionMode
		currentThreadMode?: string
		currentThreadThinking?: string
	}
	setCurrentThreadId: (id: string | null) => void
	setModelId: (id: string) => void
	setModeId?: (modeId: string) => void
	setThinkingLevel: (level: string) => void
	setThreads: Dispatch<React.SetStateAction<ThreadInfo[]>>
	tabs: {
		activeTab: string
		setActiveTab: (tab: string) => void
	}
	dialogs: {
		setShowModelSelector: (v: boolean) => void
		setShowCommandPalette: (v: boolean) => void
		handleOpenGraphViewer?: () => void
		handleOpenSettings?: (section?: string) => void
	}
	applyPermissionMode: (
		permission: PermissionMode,
		threadId?: string,
	) => Promise<void>
	loadThreads: () => Promise<ThreadInfo[] | undefined>
	loadMessages?: (threadId?: string) => Promise<void>
	runningThreads?: Set<string>
	threadsWithApproval?: Map<string, any>
	setPendingApproval?: (approval: any) => void
	setRunningThreadId?: (id: string | null) => void
	projectRootPath?: string
	isAgentActive?: boolean
	handleToggleRecording?: () => void
	handleStartReplay?: (filePath?: string) => void
}

/**
 * Thread lifecycle & actions (new/switch/delete/rename, thinking,
 * mode switching, builtin slash commands).
 */
export function useThreadActions(opts: ThreadActionsOptions) {
	const {
		dispatch,
		currentThreadId,
		modelId,
		modeId,
		thinkingLevel,
		modelsByThread,
		permissionsByThread,
		modesByThread = {},
		thinkingByThread = {},
		threadModel,
		setCurrentThreadId,
		setModelId,
		setModeId,
		setThinkingLevel,
		setThreads,
		tabs,
		dialogs,
		applyPermissionMode,
		loadThreads,
		projectRootPath,
		isAgentActive,
		handleToggleRecording,
		handleStartReplay,
	} = opts

	/**
	 * Monotonic id of the latest switch. Background syncs from an older switch
	 * must not overwrite the model/permission of the thread the user is on now.
	 */
	const switchSeqRef = useRef(0)

	const handleNewThread = useCallback(async () => {
		const targetModel = modelId
		const targetMode = modeId || "react"
		const targetPerm =
			permissionsByThread[currentThreadId || "default"] || "default"
		const targetThinking = thinkingLevel || "off"

		const thread = (await window.api.invoke({
			type: "createThread",
			metadata: {
				modelId: targetModel,
				modeId: targetMode,
				permissionMode: targetPerm,
				thinkingLevel: targetThinking,
			},
		})) as {
			id: string
			title?: string
		}
		if (!thread?.id) return
		dispatch({ type: "CLEAR" })
		threadModel.setThreadModel(thread.id, targetModel)
		threadModel.setThreadPermission(thread.id, targetPerm)
		threadModel.setThreadMode?.(thread.id, targetMode)
		threadModel.setThreadThinking?.(thread.id, targetThinking)
		setCurrentThreadId(thread.id)
		tabs.setActiveTab(`thread:${thread.id}`)
		if (projectRootPath) {
			localStorage.setItem(`myagent-last-thread-${projectRootPath}`, thread.id)
		}
		await applyPermissionMode(targetPerm, thread.id)
		await window.api.invoke({
			type: "switchMode",
			modeId: targetMode,
			threadId: thread.id,
		})
		await window.api.invoke({
			type: "setThinkingLevel",
			level: targetThinking,
			threadId: thread.id,
		})
	}, [
		dispatch,
		modelId,
		modeId,
		thinkingLevel,
		currentThreadId,
		permissionsByThread,
		threadModel,
		setCurrentThreadId,
		tabs.setActiveTab,
		applyPermissionMode,
		projectRootPath,
	])

	const handleSwitchThread = useCallback(
		async (threadId: string) => {
			if (threadId === currentThreadId) return

			// 1. Flip the UI before touching IPC. The title, the active tab, the
			//    permission badge and the agent indicator all key off this id, so
			//    the switch reads as instant instead of waiting for the harness.
			setCurrentThreadId(threadId)
			tabs.setActiveTab(`thread:${threadId}`)
			if (projectRootPath) {
				localStorage.setItem(`myagent-last-thread-${projectRootPath}`, threadId)
			}
			const optimisticRunning = opts.runningThreads?.has(threadId) ?? false
			dispatch({ type: "SET_AGENT_ACTIVE", active: optimisticRunning })
			opts.setRunningThreadId?.(optimisticRunning ? threadId : null)
			opts.setPendingApproval?.(opts.threadsWithApproval?.get(threadId) || null)

			// 2. The transcript and the harness switch are independent — the IPC
			//    handler resolves messages by threadId — so they run side by side
			//    instead of queueing behind each other.
			const switching = window.api
				.invoke({ type: "switchThread", threadId })
				.then(() => true)
				.catch(() => false)
			const loading = opts.loadMessages?.(threadId).catch(() => {})

			// 3. Thread-scoped runtime only matters for the *next* turn. Syncing
			//    it in the background keeps six IPC round-trips off the switch's
			//    critical path; awaiting them is what made the first switch stall.
			const seq = ++switchSeqRef.current
			void switching.then((switched) => {
				if (!switched || seq !== switchSeqRef.current) return

				const threadModelId = modelsByThread[threadId] || modelId
				if (threadModelId) {
					setModelId(threadModelId)
					window.api
						.invoke({
							type: "switchModel",
							modelId: threadModelId,
							threadId,
							scope: "thread",
						})
						.catch(() => {})
				}

				const threadModeId = modesByThread[threadId] || modeId || "react"
				if (threadModeId && setModeId) {
					setModeId(threadModeId)
					window.api
						.invoke({ type: "switchMode", modeId: threadModeId, threadId })
						.catch(() => {})
				}

				const threadThinking =
					thinkingByThread[threadId] || thinkingLevel || "off"
				if (threadThinking) {
					setThinkingLevel(threadThinking)
					window.api
						.invoke({
							type: "setThinkingLevel",
							level: threadThinking,
							threadId,
						})
						.catch(() => {})
				}

				void applyPermissionMode(
					permissionsByThread[threadId] || "default",
					threadId,
				).catch(() => {})

				// The optimistic value is usually right; correct it once the
				// main process answers, as long as the user is still here.
				if (!optimisticRunning) {
					window.api
						.invoke({ type: "isRunning", threadId })
						.then((running) => {
							if (!running || seq !== switchSeqRef.current) return
							dispatch({ type: "SET_AGENT_ACTIVE", active: true })
							opts.setRunningThreadId?.(threadId)
						})
						.catch(() => {})
				}
			})

			await loading
		},
		[
			dispatch,
			currentThreadId,
			setCurrentThreadId,
			setModelId,
			setModeId,
			setThinkingLevel,
			tabs.setActiveTab,
			modelsByThread,
			modesByThread,
			thinkingByThread,
			permissionsByThread,
			modelId,
			modeId,
			thinkingLevel,
			applyPermissionMode,
			projectRootPath,
			opts.loadMessages,
			opts.runningThreads,
			opts.threadsWithApproval,
			opts.setPendingApproval,
			opts.setRunningThreadId,
		],
	)

	const handleDeleteThread = useCallback(
		async (threadId: string) => {
			setThreads((prev) => prev.filter((t) => t.id !== threadId))
			dispatch({ type: "CLEAR_THREAD_QUEUE", threadId })
			threadModel.removeThread(threadId)
			if (tabs.activeTab === `thread:${threadId}`) {
				tabs.setActiveTab("chat")
			}
			if (currentThreadId === threadId) {
				setCurrentThreadId(null)
				dispatch({ type: "CLEAR" })
			}
			if (projectRootPath) {
				const key = `myagent-last-thread-${projectRootPath}`
				if (localStorage.getItem(key) === threadId) {
					localStorage.removeItem(key)
				}
			}
			try {
				await window.api.invoke({ type: "deleteThread", threadId })
			} finally {
				await loadThreads()
			}
		},
		[
			dispatch,
			threadModel,
			tabs.activeTab,
			tabs.setActiveTab,
			currentThreadId,
			setCurrentThreadId,
			setThreads,
			loadThreads,
		],
	)

	const handleRenameThread = useCallback(
		async (threadId: string, title: string) => {
			const trimmed = title.trim()
			if (!trimmed) return
			setThreads((prev) =>
				prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t)),
			)
			try {
				await window.api.invoke({
					type: "renameThread",
					threadId,
					title: trimmed,
				})
			} finally {
				await loadThreads()
			}
		},
		[setThreads, loadThreads],
	)

	const handleSelectThinkingLevel = useCallback(
		async (newLevel: string) => {
			setThinkingLevel(newLevel)
			if (currentThreadId) {
				threadModel.setThreadThinking?.(currentThreadId, newLevel)
			}
			await window.api.invoke({
				type: "setThinkingLevel",
				level: newLevel,
				threadId: currentThreadId || undefined,
			})
		},
		[setThinkingLevel, currentThreadId, threadModel],
	)

	const handleToggleThinking = useCallback(async () => {
		const cycle: Record<string, string> = {
			off: "medium",
			low: "medium",
			medium: "high",
			high: "xhigh",
			xhigh: "off",
		}
		const newLevel = cycle[thinkingLevel] ?? "off"
		await handleSelectThinkingLevel(newLevel)
	}, [thinkingLevel, handleSelectThinkingLevel])

	const handleSelectMode = useCallback(
		async (targetModeId: string) => {
			if (isAgentActive) return
			if (setModeId) setModeId(targetModeId)
			if (currentThreadId) {
				threadModel.setThreadMode?.(currentThreadId, targetModeId)
			}
			await window.api.invoke({
				type: "switchMode",
				modeId: targetModeId,
				threadId: currentThreadId || undefined,
			})
		},
		[setModeId, currentThreadId, threadModel, isAgentActive],
	)

	const handleBuiltinCommand = useCallback(
		async (name: string) => {
			switch (name) {
				case "new":
					handleNewThread()
					break
				case "clear":
					dispatch({ type: "CLEAR" })
					break
				case "plan":
					await handleSelectMode(ExecutionMode.PLAN)
					break
				case "react":
				case "build":
					await handleSelectMode(ExecutionMode.REACT)
					break
				case "fast":
				case "chat":
					await handleSelectMode(ExecutionMode.FAST)
					break
				case "graph":
					dialogs.handleOpenGraphViewer?.()
					break
				case "settings":
					dialogs.handleOpenSettings?.()
					break
				case "record":
					if (handleToggleRecording) {
						handleToggleRecording()
					} else {
						window.api
							.invoke({
								type: "toggleSessionRecording",
								threadId: currentThreadId || undefined,
								projectPath: projectRootPath || undefined,
							})
							.catch(() => {})
					}
					break
				case "replay":
					if (handleStartReplay) {
						handleStartReplay()
					} else {
						window.api
							.invoke({
								type: "startSessionReplay",
								threadId: currentThreadId || undefined,
							})
							.catch(() => {})
					}
					break
				case "help":
					dialogs.setShowCommandPalette(true)
					break
			}
		},
		[
			dispatch,
			handleNewThread,
			handleSelectMode,
			dialogs,
			tabs.setActiveTab,
			handleToggleRecording,
			handleStartReplay,
			currentThreadId,
			projectRootPath,
		],
	)

	return {
		handleNewThread,
		handleSwitchThread,
		handleDeleteThread,
		handleRenameThread,
		handleToggleThinking,
		handleSelectThinkingLevel,
		handleSelectMode,
		handleBuiltinCommand,
	}
}
