import { useCallback } from "react"
import type { Dispatch } from "react"
import type { ChatAction } from "../types/chat"
import type { ThreadInfo } from "../types/ipc"
import type { PermissionMode } from "./useThreadModelPermissions"

export interface ThreadActionsOptions {
	dispatch: Dispatch<ChatAction>
	currentThreadId: string | null
	modelId: string
	modeId: string
	thinkingLevel: string
	modelsByThread: Record<string, string>
	permissionsByThread: Record<string, PermissionMode>
	threadModel: {
		setThreadModel: (threadId: string, modelId: string) => void
		setThreadPermission: (threadId: string, permission: PermissionMode) => void
		removeThread: (threadId: string) => void
	}
	setCurrentThreadId: (id: string | null) => void
	setModelId: (id: string) => void
	setThinkingLevel: (level: string) => void
	setThreads: Dispatch<React.SetStateAction<ThreadInfo[]>>
	tabs: {
		activeTab: string
		setOpenThreadTabs: (updater: (prev: string[]) => string[]) => void
		setActiveTab: (tab: string) => void
	}
	dialogs: {
		setShowModelSelector: (v: boolean) => void
		setShowCommandPalette: (v: boolean) => void
	}
	applyPermissionMode: (permission: PermissionMode) => Promise<void>
	loadThreads: () => Promise<ThreadInfo[] | undefined>
}

/**
 * Thread lifecycle & global toggles (new/switch/delete/rename, thinking,
 * planning, builtin slash commands).
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
		threadModel,
		setCurrentThreadId,
		setModelId,
		setThinkingLevel,
		setThreads,
		tabs,
		dialogs,
		applyPermissionMode,
		loadThreads,
	} = opts

	const handleNewThread = useCallback(async () => {
		const thread = (await window.api.invoke({ type: "createThread" })) as {
			id: string
			title?: string
		}
		if (!thread?.id) return
		dispatch({ type: "CLEAR" })
		threadModel.setThreadModel(thread.id, modelId)
		threadModel.setThreadPermission(thread.id, "default")
		tabs.setOpenThreadTabs((prev) => [...prev, thread.id])
		tabs.setActiveTab(`thread:${thread.id}`)
		await applyPermissionMode("default")
	}, [
		dispatch,
		modelId,
		threadModel,
		tabs.setOpenThreadTabs,
		tabs.setActiveTab,
		applyPermissionMode,
	])

	const handleSwitchThread = useCallback(
		async (threadId: string) => {
			await window.api.invoke({ type: "switchThread", threadId })
			setCurrentThreadId(threadId)
			tabs.setOpenThreadTabs((prev) =>
				prev.includes(threadId) ? prev : [...prev, threadId],
			)
			tabs.setActiveTab(`thread:${threadId}`)

			// Apply thread-scoped model
			const threadModelId = modelsByThread[threadId] || modelId
			if (threadModelId) {
				setModelId(threadModelId)
				await window.api.invoke({
					type: "switchModel",
					modelId: threadModelId,
					scope: "thread",
				})
			}

			// Apply thread-scoped permission
			await applyPermissionMode(permissionsByThread[threadId] || "default")
		},
		[
			setCurrentThreadId,
			setModelId,
			tabs.setOpenThreadTabs,
			tabs.setActiveTab,
			modelsByThread,
			permissionsByThread,
			modelId,
			applyPermissionMode,
		],
	)

	const handleDeleteThread = useCallback(
		async (threadId: string) => {
			setThreads((prev) => prev.filter((t) => t.id !== threadId))
			tabs.setOpenThreadTabs((prev) => prev.filter((id) => id !== threadId))
			dispatch({ type: "CLEAR_THREAD_QUEUE", threadId })
			threadModel.removeThread(threadId)
			if (tabs.activeTab === `thread:${threadId}`) {
				tabs.setActiveTab("chat")
			}
			if (currentThreadId === threadId) {
				setCurrentThreadId(null)
				dispatch({ type: "CLEAR" })
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
			tabs.setOpenThreadTabs,
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

	const handleToggleThinking = useCallback(async () => {
		const newLevel = thinkingLevel === "off" ? "medium" : "off"
		setThinkingLevel(newLevel)
		await window.api.invoke({ type: "setThinkingLevel", level: newLevel })
	}, [thinkingLevel, setThinkingLevel])

	const handleTogglePlanning = useCallback(async () => {
		const newMode = modeId === "plan" ? "build" : "plan"
		await window.api.invoke({ type: "switchMode", modeId: newMode })
	}, [modeId])

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
					await window.api.invoke({ type: "switchMode", modeId: "plan" })
					break
				case "build":
					await window.api.invoke({ type: "switchMode", modeId: "build" })
					break
				case "fast":
					await window.api.invoke({ type: "switchMode", modeId: "fast" })
					break
				case "model":
					dialogs.setShowModelSelector(true)
					break
				case "thinking":
					handleToggleThinking()
					break
				case "settings":
					tabs.setActiveTab("settings")
					break
				case "help":
					dialogs.setShowCommandPalette(true)
					break
			}
		},
		[
			dispatch,
			handleNewThread,
			handleToggleThinking,
			dialogs,
			tabs.setActiveTab,
		],
	)

	return {
		handleNewThread,
		handleSwitchThread,
		handleDeleteThread,
		handleRenameThread,
		handleToggleThinking,
		handleTogglePlanning,
		handleBuiltinCommand,
	}
}
