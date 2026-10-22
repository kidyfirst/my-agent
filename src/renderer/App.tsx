import { useState, useCallback, useMemo } from "react"
import { Sidebar } from "./components/Sidebar"
import { AppModals } from "./components/AppModals"
import { MainContent } from "./components/MainContent"
import type { CommandItem } from "./components/CommandPalette"
import { StatusBar } from "./components/StatusBar"
import { RightSidebar, type RightSidebarTab } from "./components/RightSidebar"
import { TabBar } from "./components/TabBar"
import type {
	TokenUsage,
	ThreadInfo,
	OMProgressState,
	Message,
} from "./types/ipc"
import type { AttachedFile } from "./types/chat"
import { ensureAudioContext } from "./utils/audio"
import { useChatReducer } from "./hooks/useChatReducer"
import { useAuthManager } from "./hooks/useAuthManager"
import { useDialogManager } from "./hooks/useDialogManager"
import { useTabManager } from "./hooks/useTabManager"
import { useProjectManager } from "./hooks/useProjectManager"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useHarnessEvents } from "./hooks/useHarnessEvents"
import {
	useThreadModelPermissions,
	applyPermissionMode as applyPermissionModeIPC,
	type PermissionMode,
} from "./hooks/useThreadModelPermissions"
import { useThreadActions } from "./hooks/useThreadActions"
import { useMessageQueue } from "./hooks/useMessageQueue"
import { buildCommandItems } from "./utils/commandItems"
import { upgradeDeprecatedModel } from "../constants/models"

export function App() {
	// Core hooks
	const [chat, dispatch] = useChatReducer()
	const auth = useAuthManager()
	const dialogs = useDialogManager()

	// Remaining state that's cross-cutting
	const [modeId, setModeId] = useState("build")
	const [thinkingLevel, setThinkingLevel] = useState("off")
	const [modelId, setModelId] = useState("")
	const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	})
	const [omProgress, setOMProgress] = useState<OMProgressState | null>(null)
	const [omModelIds, setOMModelIds] = useState<{
		observer: string
		reflector: string
	}>({
		observer: "",
		reflector: "",
	})
	const [threads, setThreads] = useState<ThreadInfo[]>([])
	const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
	const threadModel = useThreadModelPermissions(currentThreadId)
	const modelsByThread = threadModel.modelsByThread
	const permissionsByThread = threadModel.permissionsByThread
	const setThreadModel = threadModel.setThreadModel
	const setThreadPermission = threadModel.setThreadPermission
	const [tasks, setTasks] = useState<
		Array<{
			content: string
			status: "pending" | "in_progress" | "completed"
			activeForm: string
		}>
	>([])

	// Sidebar state
	const [sidebarVisible, setSidebarVisible] = useState(true)
	const [rightSidebarVisible, setRightSidebarVisible] = useState(true)
	const [rightSidebarTab, setRightSidebarTab] =
		useState<RightSidebarTab>("files")

	// Tab manager
	const tabs = useTabManager(currentThreadId)

	// Project manager
	const project = useProjectManager(dispatch, {
		setOpenThreadTabs: tabs.setOpenThreadTabs,
		setOpenFiles: tabs.setOpenFiles,
		setActiveTab: tabs.setActiveTab,
		setThreads,
		setTokenUsage,
	})

	// Keyboard shortcuts
	useKeyboardShortcuts({
		activeTab: tabs.activeTab,
		enrichedProjects: project.enrichedProjects,
		projectInfo: project.projectInfo,
		setShowCommandPalette: dialogs.setShowCommandPalette,
		setRightSidebarVisible,
		setSidebarVisible,
		setRightSidebarTab,
		setActiveTab: tabs.setActiveTab,
		setShowQuickFileOpen: dialogs.setShowQuickFileOpen,
		handleOpenFolder: project.handleOpenFolder,
		handleCloseTab: tabs.handleCloseTab,
		handleSwitchProject: project.handleSwitchProject,
	})

	// Initialize app & subscribe to harness events
	async function initializeApp() {
		try {
			const session = (await window.api.invoke({
				type: "getSession",
			})) as {
				currentThreadId: string | null
				currentModeId: string
				threads: ThreadInfo[]
			}
			if (session) {
				setModeId(session.currentModeId)
				setCurrentThreadId(session.currentThreadId)
				setThreads(session.threads)
				if (session.currentThreadId) {
					tabs.setOpenThreadTabs([session.currentThreadId])
					tabs.setActiveTab(`thread:${session.currentThreadId}`)

					const savedModels = (() => {
						try {
							return JSON.parse(
								localStorage.getItem("myagent-thread-models") || "{}",
							)
						} catch {
							return {}
						}
					})()
					const savedPerms = (() => {
						try {
							return JSON.parse(
								localStorage.getItem("myagent-thread-permissions") || "{}",
							)
						} catch {
							return {}
						}
					})()
					const tModel = savedModels[session.currentThreadId]
						? upgradeDeprecatedModel(savedModels[session.currentThreadId])
						: undefined
					if (tModel) {
						setModelId(tModel)
						window.api.invoke({
							type: "switchModel",
							modelId: tModel,
							scope: "thread",
						})
					}
					const tPerm = savedPerms[session.currentThreadId] || "default"
					applyPermissionModeIPC(tPerm)
					setModeId(tPerm === "read-only" ? "plan" : "build")
				}
			}

			const state = (await window.api.invoke({ type: "getState" })) as {
				theme?: string
				currentModelId?: string
				notifications?: string
				observerModelId?: string
				reflectorModelId?: string
				thinkingLevel?: string
				tasks?: Array<{
					content: string
					status: "pending" | "in_progress" | "completed"
					activeForm: string
				}>
			}
			const theme =
				state?.theme ||
				(typeof localStorage !== "undefined" &&
					localStorage.getItem("myagent-theme")) ||
				"light"
			const effectiveTheme =
				theme === "system"
					? window.matchMedia("(prefers-color-scheme: dark)").matches
						? "dark"
						: "light"
					: theme
			document.documentElement.setAttribute("data-theme", effectiveTheme)

			if (state?.currentModelId)
				setModelId(upgradeDeprecatedModel(state.currentModelId))
			if (state?.thinkingLevel) setThinkingLevel(state.thinkingLevel)
			if (state?.tasks) setTasks(state.tasks)
			if (state?.notifications)
				project.notificationPrefRef.current = state.notifications
			if (
				state?.observerModelId ||
				state?.reflectorModelId ||
				state?.currentModelId
			) {
				setOMModelIds({
					observer: state.observerModelId || state.currentModelId || "",
					reflector: state.reflectorModelId || state.currentModelId || "",
				})
			}

			const usage = (await window.api.invoke({
				type: "getTokenUsage",
			})) as TokenUsage
			if (usage) setTokenUsage(usage)

			window.api
				.invoke({ type: "getOMProgress" })
				.then((progress) => {
					setOMProgress((progress as OMProgressState) ?? null)
				})
				.catch(() => {})

			const loggedIn = (await window.api.invoke({
				type: "getLoggedInProviders",
			})) as string[]
			console.log("[AUTH] getLoggedInProviders result:", loggedIn)
			console.log("[AUTH] state?.currentModelId:", state?.currentModelId)
			if (loggedIn?.length > 0) {
				auth.setLoggedInProviders(new Set(loggedIn))
			}
			const authenticated = loggedIn && loggedIn.length > 0

			try {
				const proj = (await window.api.invoke({
					type: "getProjectInfo",
				})) as {
					name: string
					rootPath: string
					gitBranch?: string
					isWorktree?: boolean
				}
				if (proj) project.setProjectInfo(proj)
			} catch {
				// ignore
			}

			await project.loadEnrichedProjects()
			auth.setIsAuthenticated(authenticated)
			await loadMessages()
			project.loadPRStatus()
		} catch (err) {
			console.error("Failed to initialize:", err)
		}
	}

	async function loadMessages() {
		try {
			const msgs = (await window.api.invoke({
				type: "getMessages",
			})) as Message[]
			if (msgs) dispatch({ type: "SET_MESSAGES", messages: msgs })
		} catch {
			// Thread may not exist yet
		}
	}

	async function loadThreads(): Promise<ThreadInfo[] | undefined> {
		try {
			const list = (await window.api.invoke({
				type: "listThreads",
			})) as ThreadInfo[]
			if (list) setThreads(list)
			return list
		} catch {
			return undefined
		}
	}

	const applyPermissionMode = useCallback(async (perm: PermissionMode) => {
		await applyPermissionModeIPC(perm)
		setModeId(perm === "read-only" ? "plan" : "build")
	}, [])

	const activeThreadKey = currentThreadId || "default"
	const currentThreadModelId = upgradeDeprecatedModel(
		modelsByThread[activeThreadKey] ||
			modelId ||
			"anthropic/claude-3-5-sonnet-20241022",
	)
	const currentThreadPermission =
		permissionsByThread[activeThreadKey] || "default"

	const handleSelectThreadModel = useCallback(
		async (newModelId: string) => {
			setThreadModel(currentThreadId || "default", newModelId)
			setModelId(newModelId)
			await window.api.invoke({
				type: "switchModel",
				modelId: newModelId,
				scope: "thread",
			})
		},
		[currentThreadId, setThreadModel],
	)

	const handleSelectThreadPermission = useCallback(
		async (newPerm: PermissionMode) => {
			setThreadPermission(currentThreadId || "default", newPerm)
			await applyPermissionMode(newPerm)
		},
		[currentThreadId, setThreadPermission, applyPermissionMode],
	)

	const handleNewThread = useCallback(async () => {
		const thread = (await window.api.invoke({ type: "createThread" })) as
			| { id: string }
			| undefined
		dispatch({ type: "CLEAR" })
		if (thread?.id) {
			const newThreadId = thread.id
			const currentModel = currentThreadModelId
			setThreadModel(newThreadId, currentModel)
			setThreadPermission(newThreadId, "default")
			setCurrentThreadId(newThreadId)
			tabs.setOpenThreadTabs((prev) =>
				prev.includes(newThreadId) ? prev : [...prev, newThreadId],
			)
			tabs.setActiveTab(`thread:${newThreadId}`)
			await window.api.invoke({
				type: "switchModel",
				modelId: currentModel,
				scope: "thread",
			})
			await applyPermissionMode("default")
		}
	}, [
		currentThreadModelId,
		tabs,
		applyPermissionMode,
		setThreadModel,
		setThreadPermission,
	])

	// Harness events
	useHarnessEvents({
		dispatch,
		setModeId,
		setModelId,
		setCurrentThreadId,
		setTokenUsage,
		setOMProgress,
		setOMModelIds,
		setThreads,
		setOpenThreadTabs: tabs.setOpenThreadTabs,
		setActiveTab: tabs.setActiveTab,
		setTasks,
		setPendingApproval: dialogs.setPendingApproval,
		setPendingQuestion: dialogs.setPendingQuestion,
		setPendingPlan: dialogs.setPendingPlan,
		setLoginState: auth.setLoginState,
		setIsAuthenticated: auth.setIsAuthenticated,
		setLoggedInProviders: auth.setLoggedInProviders,
		setProjectInfo: project.setProjectInfo,
		setProjectSwitching: project.setProjectSwitching,
		setOpenFiles: tabs.setOpenFiles,
		setUnreadWorktrees: project.setUnreadWorktrees,
		setActiveWorktrees: project.setActiveWorktrees,
		setSidebarVisible,
		setRightSidebarVisible,
		setRightSidebarTab,
		projectInfoRef: project.projectInfoRef,
		notificationPrefRef: project.notificationPrefRef,
		loadMessages,
		getLastAssistantMessageId: () => {
			for (let i = chat.messages.length - 1; i >= 0; i--) {
				if (chat.messages[i].role === "assistant") return chat.messages[i].id
			}
			return null
		},
		loadThreads,
		loadPRStatus: project.loadPRStatus,
		loadEnrichedProjects: project.loadEnrichedProjects,
		handleNewThread,
		handleOpenFolder: project.handleOpenFolder,
		handleBrowserOpenRef: tabs.handleBrowserOpenRef,
		initializeApp,
		setShowCommandPalette: dialogs.setShowCommandPalette,
	})

	// Chat handlers
	const handleSend = useCallback(
		async (content: string, files?: AttachedFile[]) => {
			ensureAudioContext()
			let finalContent = content || ""
			if (typeof finalContent === "string" && finalContent.startsWith("/")) {
				const spaceIndex = finalContent.indexOf(" ")
				const commandName =
					spaceIndex === -1
						? finalContent.slice(1)
						: finalContent.slice(1, spaceIndex)
				const args =
					spaceIndex === -1
						? []
						: finalContent
								.slice(spaceIndex + 1)
								.trim()
								.split(/\s+/)
				try {
					finalContent = (await window.api.invoke({
						type: "processSlashCommand",
						commandName,
						args,
					})) as string
				} catch {
					// Command not found — send as-is
				}
			}

			// Separate images from non-image files
			const imageFiles = files?.filter((f) => f.type === "image")
			const textFiles = files?.filter((f) => f.type === "file")

			// Inline non-image file contents into the message text
			if (textFiles && textFiles.length > 0) {
				const fileBlocks = textFiles
					.map((f) => `<file name="${f.name}">\n${f.data}\n</file>`)
					.join("\n\n")
				finalContent = finalContent
					? `${finalContent}\n\n${fileBlocks}`
					: fileBlocks
			}

			const messageContent: Message["content"] = []
			if (finalContent) {
				messageContent.push({ type: "text", text: finalContent })
			}
			if (imageFiles) {
				for (const img of imageFiles) {
					messageContent.push({
						type: "image",
						mimeType: img.mimeType || "image/png",
						data: img.data,
						name: img.name,
						url: img.preview,
					})
				}
			}
			if (textFiles) {
				for (const f of textFiles) {
					messageContent.push({
						type: "file",
						mimeType: f.mimeType || "text/plain",
						data: f.data,
						name: f.name,
					})
				}
			}
			dispatch({
				type: "MESSAGE_START",
				message: {
					id: `user-${Date.now()}`,
					role: "user",
					content: messageContent,
					createdAt: new Date().toISOString(),
					attachments: files && files.length > 0 ? files : undefined,
				},
			})
			dispatch({ type: "AGENT_START" })
			const ipcImages = imageFiles?.map(({ mimeType, data, name }) => ({
				mediaType: mimeType || "image/png",
				mimeType: mimeType || "image/png",
				data,
				name,
			}))
			const ipcFiles = textFiles?.map(({ mimeType, data, name }) => ({
				mediaType: mimeType || "text/plain",
				mimeType: mimeType || "text/plain",
				data,
				name,
			}))
			try {
				await window.api.invoke({
					type: "sendMessage",
					content: finalContent,
					...(ipcImages && ipcImages.length > 0 ? { images: ipcImages } : {}),
					...(ipcFiles && ipcFiles.length > 0 ? { files: ipcFiles } : {}),
				})
			} catch (err: unknown) {
				console.error("Failed to invoke sendMessage:", err)
				const errMsg = err instanceof Error ? err.message : String(err)
				dispatch({
					type: "MESSAGE_START",
					message: {
						id: `error-${Date.now()}`,
						role: "assistant",
						content: [{ type: "text", text: `Error: ${errMsg}` }],
						createdAt: new Date().toISOString(),
						stopReason: "error",
						errorMessage: errMsg,
					},
				})
				dispatch({ type: "AGENT_END" })
			}
		},
		[],
	)

	const handleAbort = useCallback(async () => {
		ensureAudioContext()
		dispatch({ type: "SET_QUEUE_PAUSED", paused: true })
		await window.api.invoke({ type: "abort" })
	}, [])

	const {
		handleResumeQueue,
		handleQueue,
		handleSteerQueued,
		handleDeleteQueued,
		handleReorderQueue,
		handleClearQueue,
	} = useMessageQueue(chat, dispatch, currentThreadId, handleSend)

	const threadActions = useThreadActions({
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
	})
	const {
		handleSwitchThread,
		handleDeleteThread,
		handleRenameThread,
		handleToggleThinking,
		handleTogglePlanning,
		handleBuiltinCommand,
	} = threadActions

	// Command palette items
	const commandPaletteItems = useMemo((): CommandItem[] => {
		return buildCommandItems({
			close: () => dialogs.setShowCommandPalette(false),
			openThreadTabs: tabs.openThreadTabs,
			openFiles: tabs.openFiles,
			threads,
			enrichedProjects: project.enrichedProjects,
			modeId,
			thinkingLevel,
			setActiveTab: tabs.setActiveTab,
			setRightSidebarVisible,
			setRightSidebarTab,
			setSidebarVisible,
			setRightSidebarVisibleUpdater: setRightSidebarVisible,
			setShowQuickFileOpen: dialogs.setShowQuickFileOpen,
			setShowModelSelector: dialogs.setShowModelSelector,
			handleNewThread,
			handleOpenFolder: project.handleOpenFolder,
			handleShowCloneModal: project.handleShowCloneModal,
			handleBrowserOpen: tabs.handleBrowserOpen,
			handleToggleThinking,
			handleTogglePlanning,
			handleSwitchProject: project.handleSwitchProject,
		})
	}, [
		tabs.openThreadTabs,
		tabs.openFiles,
		threads,
		project.enrichedProjects,
		modeId,
		thinkingLevel,
		handleNewThread,
		handleToggleThinking,
		handleTogglePlanning,
	])

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				overflow: "hidden",
			}}
		>
			{/* Left sidebar */}
			<Sidebar
				threads={threads}
				currentThreadId={currentThreadId}
				queuesByThread={chat.queuesByThread}
				loggedInProviders={auth.loggedInProviders}
				projectName={project.projectInfo?.name ?? ""}
				sidebarVisible={sidebarVisible}
				enrichedProjects={project.enrichedProjects}
				activeProjectPath={project.projectInfo?.rootPath ?? null}
				isAgentActive={chat.isAgentActive}
				activeWorktrees={project.activeWorktrees}
				unreadWorktrees={project.unreadWorktrees}
				worktreeStatuses={project.worktreeStatuses}
				linkedIssues={project.linkedIssues}
				onSwitchThread={handleSwitchThread}
				onNewThread={handleNewThread}
				onDeleteThread={handleDeleteThread}
				onRenameThread={handleRenameThread}
				onLogin={auth.handleLogin}
				onSwitchProject={project.handleSwitchProject}
				onOpenFolder={project.handleOpenFolder}
				onCloneRepo={project.handleShowCloneModal}
				onRemoveProject={project.handleRemoveProject}
				onRenameProject={project.handleRenameProject}
				onCreateWorktree={project.handleCreateWorktree}
				onDeleteWorktree={project.handleDeleteWorktree}
				onOpenSettings={() => tabs.setActiveTab("settings")}
				onOpenAccounts={() => {
					tabs.setActiveTab("settings")
					tabs.setSettingsSection("accounts")
				}}
				onOpenAgents={() => tabs.setActiveTab("agents")}
				isSettingsActive={tabs.activeTab === "settings"}
				isAgentsActive={tabs.activeTab === "agents"}
				activeAgentCount={project.activeWorktrees.size}
			/>

			{/* Center panel (middle chat box + editors) */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					minWidth: sidebarVisible ? 440 : 700,
				}}
			>
				{/* Tab bar */}
				<TabBar
					activeTab={tabs.activeTab}
					openThreadTabs={tabs.openThreadTabs}
					openFiles={tabs.openFiles}
					dirtyFiles={tabs.dirtyFiles}
					threads={threads}
					sidebarVisible={sidebarVisible}
					rightSidebarVisible={rightSidebarVisible}
					gitBranch={project.projectInfo?.gitBranch ?? undefined}
					prStatus={project.prStatus}
					isAgentActive={chat.isAgentActive}
					onSelectTab={tabs.setActiveTab}
					onCloseTab={tabs.handleCloseTab}
					onSwitchThread={handleSwitchThread}
					onNewThread={handleNewThread}
					onToggleRightSidebar={() => setRightSidebarVisible((v) => !v)}
					onCreatePR={() =>
						handleSend(
							"Create a pull request for this branch. Push if needed first.",
						)
					}
					projectRootPath={project.projectInfo?.rootPath ?? null}
				/>

				<MainContent
					auth={auth}
					project={project}
					tabs={tabs}
					chat={chat}
					tasks={tasks}
					activeThreadKey={currentThreadId || "default"}
					currentModelId={currentThreadModelId}
					modeId={modeId}
					permissionMode={currentThreadPermission}
					onSend={handleSend}
					onQueue={handleQueue}
					onAbort={handleAbort}
					onBuiltinCommand={handleBuiltinCommand}
					onSelectModel={handleSelectThreadModel}
					onSelectPermissionMode={handleSelectThreadPermission}
					onResumeQueue={handleResumeQueue}
					onSteerQueued={handleSteerQueued}
					onDeleteQueued={handleDeleteQueued}
					onReorderQueue={handleReorderQueue}
					onClearQueue={handleClearQueue}
				/>

				<StatusBar
					modeId={currentThreadPermission === "read-only" ? "plan" : modeId}
					modelId={currentThreadModelId}
					tokenUsage={tokenUsage}
					isAgentActive={chat.isAgentActive}
					projectName={project.projectInfo?.name}
					gitBranch={project.projectInfo?.gitBranch}
					onOpenModelSelector={dialogs.handleOpenModelSelector}
					omProgress={omProgress}
					omModelIds={omModelIds}
					loggedInProviders={auth.loggedInProviders}
					onOpenOMSettings={() => {
						tabs.setActiveTab("settings")
						tabs.setSettingsSection("memory")
					}}
					thinkingEnabled={thinkingLevel !== "off"}
					onToggleThinking={handleToggleThinking}
					planningEnabled={modeId === "plan"}
					onTogglePlanning={handleTogglePlanning}
				/>
			</div>

			{/* Right sidebar */}
			<RightSidebar
				visible={rightSidebarVisible && project.enrichedProjects.length > 0}
				activeTab={rightSidebarTab}
				onTabChange={setRightSidebarTab}
				projectName={project.projectInfo?.name ?? ""}
				projectPath={project.projectInfo?.rootPath ?? null}
				gitBranch={project.projectInfo?.gitBranch}
				onFileClick={tabs.handleFileClick}
				onDiffClick={tabs.handleDiffClick}
				activeFilePath={
					tabs.openFiles.includes(tabs.activeTab) ? tabs.activeTab : null
				}
				activeDiffPath={
					tabs.activeTab.startsWith("diff:") ? tabs.activeTab.slice(5) : null
				}
				loading={project.projectSwitching}
				onOpenBrowser={tabs.handleBrowserOpen}
				currentThreadId={currentThreadId}
				threadTitle={
					threads.find((t) => t.id === currentThreadId)?.title ||
					(currentThreadId
						? `Thread #${currentThreadId.slice(0, 8)}`
						: "Current Session")
				}
				currentThreadModelId={currentThreadModelId}
				currentThreadPermission={currentThreadPermission}
				modeId={modeId}
				tokenUsage={tokenUsage}
				messages={chat.messages}
				tools={chat.tools}
				openFiles={tabs.openFiles}
				tasks={tasks}
			/>

			<AppModals
				dialogs={dialogs}
				auth={auth}
				tabs={tabs}
				project={project}
				currentModelId={currentThreadModelId}
				onSelectModel={handleSelectThreadModel}
				commandPaletteItems={commandPaletteItems}
			/>
		</div>
	)
}
