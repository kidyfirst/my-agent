import {
	useState,
	useCallback,
	useMemo,
	useEffect,
	useRef,
	type Dispatch,
	type SetStateAction,
} from "react"
import { flushSync } from "react-dom"
import { Sidebar } from "./components/Sidebar"
import { AppModals } from "./components/AppModals"
import type { OverviewAction } from "./utils/overviewMenu"
import { MainContent } from "./components/MainContent"
import type { CommandItem } from "./components/CommandPalette"
import {
	RightSidebar,
	type RightSidebarPanel,
	type RightSidebarTab,
} from "./components/RightSidebar"
import {
	closeRightSidebarTab,
	createRightSidebarTabs,
	openRightSidebarTab,
	overviewActionToTab,
	type RightSidebarTabsState,
} from "./utils/rightSidebarTabs"
import {
	defaultRightPanelState,
	recallRightPanel,
	rememberRightPanel,
	type RightPanelState,
} from "./utils/rightPanelMemory"
import { TabBar } from "./components/TabBar"
import type {
	TokenUsage,
	ThreadInfo,
	OMProgressState,
	Message,
	UpdateInfo,
} from "./types/ipc"
import { ExecutionMode, DEFAULT_EXECUTION_MODE } from "./types/ipc"
import type { AttachedFile } from "./types/chat"
import { ensureAudioContext } from "./utils/audio"
import { useChatReducer } from "./hooks/useChatReducer"
import { useAuthManager } from "./hooks/useAuthManager"
import { useDialogManager, type PendingApproval } from "./hooks/useDialogManager"
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
import { useProjectThreads } from "./hooks/useProjectThreads"
import { useMessageQueue } from "./hooks/useMessageQueue"
import { buildCommandItems } from "./utils/commandItems"
import { hasGitRepo } from "./utils/project-list"
import { bootSplashReleaseDelay, hideBootSplash } from "./utils/bootSplash"
import { nextPaint } from "./utils/paint"
import {
	SIDEBAR_DEFAULT_WIDTH,
	restoreSidebarWidth,
} from "./utils/sidebarResize"
import {
	CENTER_MIN_WIDTH,
	CENTER_MIN_WIDTH_NO_SIDEBAR,
	rightPanelLayoutReserve,
} from "./utils/rightSidebarResize"
import { BUILTIN_COMMAND_NAMES } from "./components/SlashCommandAutocomplete"
import type { SessionExportData } from "./components/SessionExportModal"

export function App() {
	// Core hooks
	const [chat, dispatch] = useChatReducer()
	const auth = useAuthManager()
	const dialogs = useDialogManager()

	// Remaining state that's cross-cutting
	const [modeId, setModeId] = useState<string>(DEFAULT_EXECUTION_MODE)
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
	/**
	 * Folder the `threads` list was listed for.
	 *
	 * `listThreads` only ever answers for the open project, and a switch makes the
	 * new project active before that answer arrives. Tagging the list with its
	 * folder lets the sidebar keep it under that folder instead of painting the
	 * previous project's sessions under the new one (which is what made rows pop
	 * in and disappear again).
	 */
	const [threadsPath, setThreadsPath] = useState<string | null>(null)
	/** `initializeApp` has finished, so the project list is populated. */
	const [booted, setBooted] = useState(false)
	const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
	/**
	 * "project / conversation" the title bar should show while a session that
	 * lives in another project is being opened.
	 *
	 * A cross-project switch has to build that project's harness before the new
	 * project info and thread list exist, so the derived title would otherwise
	 * sit on the old conversation for a second. This carries the clicked row's
	 * names until the real state catches up.
	 */
	const [pendingSessionTitle, setPendingSessionTitle] = useState<{
		projectPath: string
		threadId: string
		projectName: string
		conversationName: string
	} | null>(null)
	const currentThreadIdRef = useRef<string | null>(null)
	useEffect(() => {
		currentThreadIdRef.current = currentThreadId
	}, [currentThreadId])
	/** Thread whose transcript request is currently in flight. */
	const inFlightThreadRef = useRef<string | null>(null)
	/** Thread whose transcript is already on screen, so a repeat load is a no-op. */
	const lastLoadedThreadRef = useRef<string | null>(null)
	/** Session switch request currently in flight to prevent race conditions. */
	const inFlightSwitchRef = useRef<string | null>(null)
	const [runningThreadId, setRunningThreadId] = useState<string | null>(null)
	/**
	 * The thread whose run the user stopped, if it happened in this session.
	 *
	 * An aborted run leaves nothing in the thread store — deliberately: reopening
	 * the session (or the app) must show the transcript exactly as it stopped.
	 * So the "interrupted" marker is renderer state that lives and dies with the
	 * window, and only for the thread that was actually running.
	 */
	const [interruptedThreadKey, setInterruptedThreadKey] = useState<
		string | null
	>(null)
	const [revertingTask, setRevertingTask] = useState(false)
	const [revertedTask, setRevertedTask] = useState(false)

	// Switching away from the stopped turn drops the note: coming back later
	// should show the stored transcript, not a marker from another session.
	useEffect(() => {
		setInterruptedThreadKey(null)
		setRevertedTask(false)
	}, [currentThreadId])
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
	// Drag-resizable like the right panel (100–300px). Release below 150px hides it.
	const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
	const [rightSidebarVisible, setRightSidebarVisible] = useState(true)
	// Bumped by ⌘K so the sidebar opens its search modal. The modal lives in
	// Sidebar (it needs the session lists), so the key only pokes a counter.
	const [searchOpenSeq, setSearchOpenSeq] = useState(0)
	const handleOpenSearch = useCallback(() => setSearchOpenSeq((n) => n + 1), [])
	// Maximized: the panel gives up its width and fills the window, so the
	// conversation pane is hidden while this is on.
	const [rightSidebarMaximized, setRightSidebarMaximized] = useState(false)
	// Bumped to hand the keyboard to the terminal whenever a tab, menu row,
	// shortcut or command selects it.
	const [terminalFocusSignal, setTerminalFocusSignal] = useState(0)
	// The sidebar is a tabbed container: Overview is always there, the rest are
	// opened from either Overview menu and stay open until closed.
	const [rightSidebarTabs, setRightSidebarTabs] =
		useState<RightSidebarTabsState>(createRightSidebarTabs)
	// Shortcuts, the command palette and harness events all use the original
	// "set the active tab" API. Keep that signature, but make every destination
	// it points at an actual tab so the strip and the panes never disagree.
	// Every entry point lands here, which is also the one place that can focus
	// the shell when the destination is Terminal.
	const activeTabRef = useRef<RightSidebarTab>("menu")
	activeTabRef.current = rightSidebarTabs.active
	const setRightSidebarTab = useCallback<
		Dispatch<SetStateAction<RightSidebarTab>>
	>((next) => {
		const tab = typeof next === "function" ? next(activeTabRef.current) : next
		if (tab === "terminal") setTerminalFocusSignal((count) => count + 1)
		setRightSidebarTabs((state) => openRightSidebarTab(state, tab))
	}, [])
	const handleCloseRightSidebarTab = useCallback((tab: RightSidebarPanel) => {
		setRightSidebarTabs((state) => closeRightSidebarTab(state, tab))
	}, [])

	// Slide the panel away: the conversation takes its space back. A hidden
	// panel is never maximized, so reopening lands on the normal split.
	const handleHideRightSidebar = useCallback(() => {
		setRightSidebarMaximized(false)
		setRightSidebarVisible(false)
	}, [])

	// Grow the panel over the conversation, or give the space back. Defined
	// this early because the keyboard shortcut needs it.
	const handleToggleRightSidebarMaximized = useCallback(() => {
		setRightSidebarVisible(true)
		setRightSidebarMaximized((maximized) => !maximized)
	}, [])

	// A hidden panel is never maximized, whichever route closed it — the hide
	// button, the ⇧⌘B shortcut or the View menu. Reopening lands on the split.
	useEffect(() => {
		if (!rightSidebarVisible) setRightSidebarMaximized(false)
	}, [rightSidebarVisible])

	// The panel belongs to the conversation, not to the app: a session
	// remembers whether it had a panel open and which tabs were in it. Leave a
	// session → its state is put away; come back → it is put back.
	const rightPanelMemory = useRef(new Map<string, RightPanelState>())
	const rightPanelSnapshot = useRef<RightPanelState>({
		visible: rightSidebarVisible,
		tabs: rightSidebarTabs,
	})
	rightPanelSnapshot.current = {
		visible: rightSidebarVisible,
		tabs: rightSidebarTabs,
	}
	const panelThreadKey = currentThreadId || "default"
	const panelThreadKeyRef = useRef(panelThreadKey)
	// The session the app boots into adopts the default layout instead of
	// restoring "no panel": a fresh launch must not look like a closed panel.
	const adoptedFirstSession = useRef(false)

	useEffect(() => {
		const previous = panelThreadKeyRef.current
		if (previous === panelThreadKey) return
		panelThreadKeyRef.current = panelThreadKey

		if (!adoptedFirstSession.current) {
			adoptedFirstSession.current = true
			rememberRightPanel(
				rightPanelMemory.current,
				panelThreadKey,
				rightPanelSnapshot.current,
			)
			return
		}

		rememberRightPanel(
			rightPanelMemory.current,
			previous,
			rightPanelSnapshot.current,
		)
		// A session that never had a panel gets none: switching to it should
		// reveal its conversation, not a panel it never opened.
		const saved =
			recallRightPanel(rightPanelMemory.current, panelThreadKey) ??
			defaultRightPanelState()
		setRightSidebarTabs(saved.tabs)
		setRightSidebarVisible(saved.visible)
	}, [panelThreadKey])
	// A page another surface asked the sidebar browser to show. `seq` lets the
	// same url be requested twice (two clicks on the same preview card).
	const [browserPanelRequest, setBrowserPanelRequest] = useState<{
		url: string
		seq: number
	} | null>(null)
	const openBrowserPanel = useCallback(
		(url: string) => {
			if (!url) return
			setRightSidebarVisible(true)
			setRightSidebarTab("browser")
			setBrowserPanelRequest((previous) => ({
				url,
				seq: (previous?.seq ?? 0) + 1,
			}))
		},
		[setRightSidebarTab],
	)

	// A collapsing drag leaves a unusable width behind; reopening must not
	// restore that sliver, it starts from the default width again.
	useEffect(() => {
		if (sidebarVisible) setSidebarWidth((w) => restoreSidebarWidth(w))
	}, [sidebarVisible])

	// Tab manager
	const tabs = useTabManager(currentThreadId)

	// Session recording & replay state
	const [recordingThreads, setRecordingThreads] = useState<Set<string>>(
		new Set(),
	)
	const [recordingProjects, setRecordingProjects] = useState<Set<string>>(
		new Set(),
	)
	const [replayingThreads, setReplayingThreads] = useState<Set<string>>(
		new Set(),
	)
	const [replayingProjects, setReplayingProjects] = useState<Set<string>>(
		new Set(),
	)
	const [runningThreads, setRunningThreads] = useState<Set<string>>(new Set())
	const [threadsWithApproval, setThreadsWithApproval] = useState<
		Map<string, PendingApproval>
	>(new Map())
	const [showReplayModal, setShowReplayModal] = useState(false)
	const [sessionExportData, setSessionExportData] =
		useState<SessionExportData | null>(null)
	// Developer logging — controls whether the sidebar exposes the Logging item.
	const [loggingEnabled, setLoggingEnabled] = useState(false)
	const [toast, setToast] = useState<{
		message: string
		type: "info" | "error" | "success"
	} | null>(null)

	const showToast = useCallback(
		(message: string, type: "info" | "error" | "success" = "info") => {
			setToast({ message, type })
			setTimeout(() => {
				setToast((t) => (t?.message === message ? null : t))
			}, 3000)
		},
		[],
	)

	// The toast keeps the active theme surface and font; only this glyph is tinted, so
	// it stays legible on both light and dark skins.
	const toastAccent =
		toast?.type === "error"
			? "var(--error)"
			: toast?.type === "success"
				? "var(--success)"
				: "var(--muted)"
	const toastGlyph =
		toast?.type === "error" ? "⚠" : toast?.type === "success" ? "✓" : "•"
	// Two independent paths load the same thread: the caller that initiated the
	// switch, and the `thread_changed` broadcast the main process emits after
	// it. Without this guard the transcript loads twice, so the user watches
	// loading -> content -> loading -> content. In-flight calls for one thread
	// share the first promise; a repeat for an already-loaded thread is ignored
	// unless the caller explicitly asked for a refresh.
	const loadMessages = useCallback(
		async (threadIdOverride?: string, force = false) => {
			const tid =
				threadIdOverride || currentThreadId || currentThreadIdRef.current
			if (!tid) {
				dispatch({ type: "SET_MESSAGES", messages: [] })
				return
			}
			if (inFlightThreadRef.current === tid) return
			if (!force && lastLoadedThreadRef.current === tid) return
			inFlightThreadRef.current = tid
			// Only a real thread *switch* drops the live transcript state.
			// A forced same-thread reload (e.g. after agent_end) must keep the
			// subagents/tools maps — wiping them here blanked every Agent card
			// the moment a run finished, because the persisted parts carry no
			// live tool state.
			const isSwitch = tid !== currentThreadIdRef.current
			if (isSwitch) {
				// Clear the outgoing transcript and show a wait state before the
				// round-trip, so the switch never looks like a frozen old thread.
				dispatch({ type: "BEGIN_THREAD_LOAD", threadId: tid })
			}
			try {
				const msgs = (await window.api.invoke({
					type: "getMessages",
					threadId: tid,
				})) as Message[]
				if (Array.isArray(msgs)) {
					dispatch({ type: "SET_MESSAGES", messages: msgs, threadId: tid })
				}
				lastLoadedThreadRef.current = tid
			} catch {
				// Thread may not exist yet
				dispatch({ type: "SET_MESSAGES", messages: [], threadId: tid })
			} finally {
				inFlightThreadRef.current = null
				dispatch({ type: "END_THREAD_LOAD", threadId: tid })
			}
		},
		[currentThreadId, dispatch],
	)

	useEffect(() => {
		window.api
			.invoke({ type: "getSessionRecordingStatus" })
			.then((raw) => {
				const res = raw as
					| { recordingThreads?: string[]; recordingProjects?: string[] }
					| undefined
				if (res?.recordingThreads) {
					setRecordingThreads(new Set(res.recordingThreads))
				}
				if (res?.recordingProjects) {
					setRecordingProjects(new Set(res.recordingProjects))
				}
			})
			.catch(() => {})

		window.api
			.invoke({ type: "getRunningThreads" })
			.then((raw) => {
				const res = raw as
					| { runningThreads?: string[]; runningThreadIds?: string[] }
					| undefined
				const list = res?.runningThreads || res?.runningThreadIds
				if (list && Array.isArray(list)) {
					setRunningThreads(new Set(list))
				}
			})
			.catch(() => {})

		window.api
			.invoke({ type: "getPendingApprovals" })
			.then((raw) => {
				const res = raw as { pendingApprovals?: PendingApproval[] } | undefined
				if (res?.pendingApprovals && Array.isArray(res.pendingApprovals)) {
					const map = new Map<string, PendingApproval>()
					for (const item of res.pendingApprovals) {
						if (item.threadId) {
							map.set(item.threadId, item)
						}
					}
					setThreadsWithApproval(map)
				}
			})
			.catch(() => {})
	}, [])

	// Developer logging is persisted in the main process; read it once so the
	// sidebar matches reality on the first render. Retried briefly because the
	// main process registers its IPC handlers right after the window is created.
	useEffect(() => {
		let cancelled = false
		const load = (attempt: number) => {
			window.api
				.invoke({ type: "getLoggingStatus" })
				.then((raw) => {
					const res = raw as { config?: { enabled?: boolean } } | undefined
					if (cancelled) return
					if (typeof res?.config?.enabled === "boolean") {
						setLoggingEnabled(res.config.enabled)
					}
				})
				.catch(() => {
					if (!cancelled && attempt < 3) {
						setTimeout(() => load(attempt + 1), 300)
					}
				})
		}
		load(0)
		return () => {
			cancelled = true
		}
	}, [])

	// App Update state
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
	const [downloadProgress, setDownloadProgress] = useState<{
		percent: number
		downloadedBytes: number
		totalBytes: number
	} | null>(null)

	// Check for updates on startup & when window regains focus
	useEffect(() => {
		const check = () => {
			window.api
				.invoke({ type: "checkForUpdates" })
				.then((raw) => {
					const info = raw as UpdateInfo | null
					if (info?.hasUpdate) {
						setUpdateInfo(info)
					}
				})
				.catch(() => {})
		}

		check()
		const disposeFocus = window.api.onWindowFocus?.(check)
		return () => disposeFocus?.()
	}, [])

	const handleDownloadUpdate = async () => {
		if (!updateInfo?.downloadUrl) return
		try {
			setDownloadProgress({ percent: 1, downloadedBytes: 0, totalBytes: 0 })
			const res = (await window.api.invoke({
				type: "downloadAndInstallUpdate",
				downloadUrl: updateInfo.downloadUrl,
				fileName: updateInfo.fileName,
			})) as { success?: boolean } | undefined
			if (res?.success) {
				setDownloadProgress(null)
			}
		} catch (err) {
			console.error("Failed to download update:", err)
			setDownloadProgress(null)
		}
	}

	// Project manager
	const project = useProjectManager(dispatch, {
		setOpenFiles: tabs.setOpenFiles,
		setActiveTab: tabs.setActiveTab,
		setThreads,
		setTokenUsage,
		setCurrentThreadId,
	})

	// Git surfaces (Git tab, PR button, branch chips) only make sense inside a
	// git repo. A plain folder project hides all of them. While the project info
	// is still loading (null) keep the previous behaviour instead of flashing the
	// tab strip.
	const gitEnabled = project.projectInfo
		? hasGitRepo(project.projectInfo)
		: true

	// Leaving a repo for a plain folder must not strand the sidebar on Git:
	// drop the Review tab entirely instead of leaving a dead entry in the strip.
	// Closing it already moves the selection to a neighbour (or the landing
	// list when it was the last one), so no extra reset is needed here.
	useEffect(() => {
		if (gitEnabled) return
		handleCloseRightSidebarTab("git")
	}, [gitEnabled, handleCloseRightSidebarTab])

	const handleToggleRecording = useCallback(
		async (threadId?: string, projectPath?: string) => {
			const targetThreadId = threadId || currentThreadId || undefined
			const targetProjectPath =
				projectPath || project.projectInfo?.rootPath || undefined
			const isCurrentlyRecording =
				(targetThreadId ? recordingThreads.has(targetThreadId) : false) ||
				(targetProjectPath ? recordingProjects.has(targetProjectPath) : false)

			if (!isCurrentlyRecording && chat.isAgentActive) {
				showToast(
					"Cannot start recording while a task is running in this session",
					"error",
				)
				return
			}

			try {
				const res = (await window.api.invoke({
					type: "toggleSessionRecording",
					threadId: targetThreadId,
					projectPath: targetProjectPath,
				})) as any
				if (res?.recordingThreads) {
					setRecordingThreads(new Set(res.recordingThreads))
				}
				if (res?.recordingProjects) {
					setRecordingProjects(new Set(res.recordingProjects))
				}

				if (res?.error && !res?.isRecording) {
					showToast(res.error, "error")
					return
				}

				if (!res?.isRecording) {
					if (!res?.valid) {
						showToast(res?.error || "record failed", "error")
					} else {
						setSessionExportData({
							threadId: res.threadId || targetThreadId,
							filePath: res.filePath,
							eventCount: res.eventCount || 0,
							size: res.size || 0,
						})
					}
				}
			} catch (e) {
				console.error("Toggle recording error:", e)
				showToast("record failed", "error")
			}
		},
		[
			currentThreadId,
			project.projectInfo?.rootPath,
			recordingThreads,
			recordingProjects,
			chat.isAgentActive,
			showToast,
		],
	)

	const handleStartReplay = useCallback(
		async (filePath?: string) => {
			if (!filePath) {
				setShowReplayModal(true)
				return
			}
			try {
				const res = (await window.api.invoke({
					type: "startSessionReplay",
					threadId: currentThreadId || undefined,
					filePath,
				})) as any
				if (res?.success) {
					const targetThreadId = res.threadId || currentThreadId
					// `finished` means the recording was reconstructed and the replay
					// is already over — lighting the "replaying" badge here would
					// leave it stuck until the user clicked it away.
					const finished = Boolean(res.finished)
					if (targetThreadId) {
						setReplayingThreads((prev) => {
							const s = new Set(prev)
							if (finished) s.delete(targetThreadId)
							else s.add(targetThreadId)
							return s
						})
						// The recording replaced this thread's transcript, so the
						// cached copy no longer matches what is on disk.
						await loadMessages(targetThreadId, true)
					}
					if (project.projectInfo?.rootPath) {
						const rootPath = project.projectInfo.rootPath
						setReplayingProjects((prev) => {
							const s = new Set(prev)
							if (finished) s.delete(rootPath)
							else s.add(rootPath)
							return s
						})
					}
					await loadThreads()
					if (res.error) {
						// The recording parsed but its transcript could not be written;
						// say so instead of toasting a success that shows nothing.
						showToast(`Replay failed: ${res.error}`, "error")
					} else {
						// Playbacks stack, so number them: "Replay #2 finished" makes it
						// obvious the second pass really ran.
						const pass =
							Number(res.playbackIndex) > 1 ? ` #${res.playbackIndex}` : ""
						const label = finished
							? `Replay${pass} finished`
							: `Replay${pass} started`
						showToast(`${label} (${res.stepCount} steps)`, "success")
					}
				}
			} catch (e: any) {
				console.error("Start replay error:", e)
				showToast(e?.message || "Failed to start replay", "error")
			}
		},
		[
			currentThreadId,
			project.projectInfo?.rootPath,
			showToast,
			loadMessages,
			loadThreads,
		],
	)

	const handleStopReplay = useCallback(
		async (threadId?: string, projectPath?: string) => {
			try {
				const targetThreadId = threadId || currentThreadId || undefined
				await window.api.invoke({
					type: "stopSessionReplay",
					threadId: targetThreadId,
				})
				setReplayingThreads((prev) => {
					const s = new Set(prev)
					if (targetThreadId) s.delete(targetThreadId)
					else s.clear()
					return s
				})
				setReplayingProjects((prev) => {
					const s = new Set(prev)
					if (projectPath) s.delete(projectPath)
					else s.clear()
					return s
				})
				await loadThreads()
				showToast("Replay stopped", "info")
			} catch (e) {
				console.error("Stop replay error:", e)
			}
		},
		[currentThreadId, showToast, loadThreads],
	)

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
		onToggleSettings: dialogs.handleToggleSettings,
		onOpenSearch: handleOpenSearch,
		onToggleRightSidebarMaximized: handleToggleRightSidebarMaximized,
	})

	// Initialize app & subscribe to harness events
	async function initializeApp() {
		try {
			const [session, proj] = (await Promise.all([
				window.api.invoke({ type: "getSession" }),
				window.api.invoke({ type: "getProjectInfo" }).catch(() => null),
			])) as [
				{
					currentThreadId: string | null
					currentModeId: string
					threads: ThreadInfo[]
				} | null,
				{
					name: string
					rootPath: string
					gitBranch?: string
					isGitRepo?: boolean
					isWorktree?: boolean
				} | null,
			]
			if (proj) {
				project.setProjectInfo(proj)
				if (proj.rootPath) {
					try {
						localStorage.setItem("myagent-last-project", proj.rootPath)
					} catch {}
				}
			} else {
				project.setProjectInfo(null)
				try {
					localStorage.removeItem("myagent-last-project")
				} catch {}
			}
			let resolvedThreadId: string | null = null
			if (session && proj) {
				setModeId(session.currentModeId)
				setThreads(session.threads)
				setThreadsPath(proj.rootPath ?? null)

				let targetThreadId = session.currentThreadId
				if (!targetThreadId && session.threads && session.threads.length > 0) {
					const root = proj?.rootPath || ""
					const savedThreadId = root
						? localStorage.getItem(`myagent-last-thread-${root}`)
						: null
					if (
						savedThreadId &&
						session.threads.some((t) => t.id === savedThreadId)
					) {
						targetThreadId = savedThreadId
					} else {
						targetThreadId = session.threads[0].id
					}
				}
				resolvedThreadId = targetThreadId
				if (targetThreadId) {
					await window.api
						.invoke({
							type: "switchThread",
							threadId: targetThreadId,
						})
						.catch(() => {})
					currentThreadIdRef.current = targetThreadId
				}

				setCurrentThreadId(targetThreadId)
				if (targetThreadId) {
					tabs.setActiveTab(`thread:${targetThreadId}`)
					if (proj?.rootPath) {
						localStorage.setItem(
							`myagent-last-thread-${proj.rootPath}`,
							targetThreadId,
						)
					}
					const isRunning = runningThreads.has(targetThreadId)
					dispatch({ type: "SET_AGENT_ACTIVE", active: isRunning })
					setRunningThreadId(isRunning ? targetThreadId : null)
					await loadMessages(targetThreadId)

					const targetThread = session.threads?.find(
						(t) => t.id === targetThreadId,
					)
					const tMeta = (targetThread?.metadata || {}) as Record<string, unknown>

					// 1. Model
					const tModel =
						(threadModel.modelsByThread[targetThreadId] || tMeta.modelId) as
							| string
							| undefined
					if (tModel) {
						setModelId(tModel)
						window.api.invoke({
							type: "switchModel",
							modelId: tModel,
							threadId: targetThreadId,
							scope: "thread",
						})
					}

					// 2. Mode
					const tMode =
						threadModel.modesByThread[targetThreadId] ||
						(tMeta.modeId as string) ||
						session.currentModeId ||
						"react"
					if (tMode) {
						setModeId(tMode)
						window.api.invoke({
							type: "switchMode",
							modeId: tMode,
							threadId: targetThreadId,
						})
					}

					// 3. Thinking
					const tThinking =
						threadModel.thinkingByThread[targetThreadId] ||
						(tMeta.thinkingLevel as string) ||
						"off"
					if (tThinking) {
						setThinkingLevel(tThinking)
						window.api.invoke({
							type: "setThinkingLevel",
							level: tThinking,
							threadId: targetThreadId,
						})
					}

					// 4. Permission
					const tPerm =
						threadModel.permissionsByThread[targetThreadId] ||
						(tMeta.permissionMode as PermissionMode) ||
						"default"
					applyPermissionModeIPC(tPerm, targetThreadId)
				} else {
					tabs.setActiveTab("chat")
				}
			} else {
				setCurrentThreadId(null)
				setThreads([])
				setThreadsPath(null)
				tabs.setActiveTab("chat")
				dispatch({ type: "CLEAR" })
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

			if (state?.currentModelId) setModelId(state.currentModelId)
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
					isGitRepo?: boolean
					isWorktree?: boolean
				}
				if (proj) {
					project.setProjectInfo(proj)
					if (proj.rootPath) {
						try {
							localStorage.setItem("myagent-last-project", proj.rootPath)
						} catch {}
					}
				} else {
					project.setProjectInfo(null)
				}
			} catch {
				// ignore
			}

			await project.loadEnrichedProjects()
			auth.setIsAuthenticated(authenticated)
			if (resolvedThreadId) {
				// A thread id is only unique within its project, so the cached
				// transcript belongs to whatever project we just left.
				await loadMessages(resolvedThreadId, true)
				project.loadPRStatus()
			} else if (proj) {
				await loadMessages(undefined, true)
				project.loadPRStatus()
			} else {
				dispatch({ type: "CLEAR" })
			}
		} catch (err) {
			console.error("Failed to initialize:", err)
		} finally {
			// The boot splash is waiting on this; a failed boot still has to
			// reveal the app (and its error surface) instead of the animation.
			setBooted(true)
		}
	}

	/**
	 * Re-list the open project's sessions.
	 *
	 * `path` is the folder the list belongs to; callers that just switched
	 * project know it before the project ref updates (the ref is written in an
	 * effect), so `project_changed` passes it explicitly.
	 */
	async function loadThreads(path?: string): Promise<ThreadInfo[] | undefined> {
		const folderPath = path ?? project.projectInfoRef.current?.rootPath ?? null
		try {
			const list = (await window.api.invoke({
				type: "listThreads",
			})) as ThreadInfo[]
			if (list) {
				setThreads(list)
				setThreadsPath(folderPath)
				threadModel.syncFromThreadMetadata(list)
			}
			return list
		} catch {
			return undefined
		}
	}

	const applyPermissionMode = useCallback(
		async (perm: PermissionMode, targetThreadId?: string) => {
			const tid = targetThreadId || currentThreadId || "default"
			setThreadPermission(tid, perm)
			await applyPermissionModeIPC(
				perm,
				targetThreadId || currentThreadId || undefined,
			)
		},
		[currentThreadId, setThreadPermission],
	)

	const activeThreadKey = currentThreadId || "default"
	const currentThreadModelId =
		modelsByThread[activeThreadKey] ||
		modelId ||
		"anthropic/claude-3-7-sonnet-latest"
	const currentThreadPermission =
		permissionsByThread[activeThreadKey] || "default"
	const currentThreadModeId =
		threadModel.modesByThread[activeThreadKey] || modeId || "react"
	const currentThreadThinkingLevel =
		threadModel.thinkingByThread[activeThreadKey] || thinkingLevel || "off"
	const currentThread = threads.find((t) => t.id === currentThreadId)
	// Sessions of every folder in the sidebar, not just the open project: an
	// expanded group has to keep its rows while another project is active.
	const {
		threadsByPath,
		refresh: refreshProjectThreads,
		loaded: projectThreadsLoaded,
	} = useProjectThreads(
		project.enrichedProjects,
		project.projectInfo?.rootPath ?? null,
		threads,
		threadsPath,
	)

	// The sidebar is the last thing to fill in: the project list comes from
	// `initializeApp`, its session rows from a separate snapshot read. Hold the
	// splash until both are there, so the fade never reveals a half-built tree.
	const sidebarReady =
		booted && (project.enrichedProjects.length === 0 || projectThreadsLoaded)
	useEffect(() => {
		if (!sidebarReady) return
		const delay = bootSplashReleaseDelay(performance.now())
		if (delay === 0) {
			hideBootSplash()
			return
		}
		const timer = setTimeout(hideBootSplash, delay)
		return () => clearTimeout(timer)
	}, [sidebarReady])
	const isCurrentThreadActiveReplay = Boolean(
		currentThreadId && replayingThreads.has(currentThreadId),
	)
	const curThreadMeta = currentThread?.metadata as
		| Record<string, unknown>
		| undefined
	const isCurrentThreadReplaySession = Boolean(
		curThreadMeta?.isReplay || isCurrentThreadActiveReplay,
	)
	const currentThreadReplaySource =
		(curThreadMeta?.replayFile as string | undefined) ||
		(curThreadMeta?.replaySource as string | undefined) ||
		undefined

	const handleSelectThreadModel = useCallback(
		async (newModelId: string) => {
			if (chat.isAgentActive) {
				return
			}
			const tid = currentThreadId || "default"
			setThreadModel(tid, newModelId)
			setModelId(newModelId)
			await window.api.invoke({
				type: "switchModel",
				modelId: newModelId,
				threadId: currentThreadId || undefined,
				scope: "thread",
			})
		},
		[currentThreadId, setThreadModel, chat.isAgentActive],
	)

	const handleSelectThreadPermission = useCallback(
		async (newPerm: PermissionMode) => {
			await applyPermissionMode(newPerm, currentThreadId || undefined)
		},
		[currentThreadId, applyPermissionMode],
	)

	const handleNewThread = useCallback(async () => {
		const targetModel = currentThreadModelId
		const targetMode = currentThreadModeId
		const targetPerm = currentThreadPermission
		const targetThinking = currentThreadThinkingLevel

		const thread = (await window.api.invoke({
			type: "createThread",
			metadata: {
				modelId: targetModel,
				modeId: targetMode,
				permissionMode: targetPerm,
				thinkingLevel: targetThinking,
			},
		})) as { id: string } | undefined
		dispatch({ type: "CLEAR" })
		if (thread?.id) {
			const newThreadId = thread.id
			setThreadModel(newThreadId, targetModel)
			setThreadPermission(newThreadId, targetPerm)
			threadModel.setThreadMode(newThreadId, targetMode)
			threadModel.setThreadThinking(newThreadId, targetThinking)
			setCurrentThreadId(newThreadId)
			tabs.setActiveTab(`thread:${newThreadId}`)
			await window.api.invoke({
				type: "switchModel",
				modelId: targetModel,
				threadId: newThreadId,
				scope: "thread",
			})
			await window.api.invoke({
				type: "switchMode",
				modeId: targetMode,
				threadId: newThreadId,
			})
			await window.api.invoke({
				type: "setThinkingLevel",
				level: targetThinking,
				threadId: newThreadId,
			})
			await applyPermissionMode(targetPerm, newThreadId)
		}
	}, [
		currentThreadModelId,
		currentThreadModeId,
		currentThreadPermission,
		currentThreadThinkingLevel,
		tabs,
		applyPermissionMode,
		setThreadModel,
		setThreadPermission,
		threadModel,
	])

	// "New session" from a project row: sessions live in the project's session,
	// so when the row belongs to another project we switch first and create the
	// session once that project is active.
	const pendingNewThreadProject = useRef<string | null>(null)
	const handleNewThreadRef = useRef(handleNewThread)
	useEffect(() => {
		handleNewThreadRef.current = handleNewThread
	}, [handleNewThread])

	const handleNewThreadInProject = useCallback(
		(projectPath?: string) => {
			if (!projectPath || projectPath === project.projectInfo?.rootPath) {
				void handleNewThread()
				return
			}
			pendingNewThreadProject.current = projectPath
			void project.handleSwitchProject(projectPath)
		},
		[
			project.projectInfo?.rootPath,
			project.handleSwitchProject,
			handleNewThread,
		],
	)

	// Deliberately not cancelled on re-render: the pending creation must survive
	// the identity churn of handleNewThread that the project switch triggers.
	useEffect(() => {
		const pending = pendingNewThreadProject.current
		if (!pending || pending !== project.projectInfo?.rootPath) return
		pendingNewThreadProject.current = null
		// Let the project_changed handler finish restoring threads/tabs first.
		setTimeout(() => {
			void handleNewThreadRef.current()
		}, 250)
	}, [project.projectInfo?.rootPath])

	// Harness events
	useHarnessEvents({
		dispatch,
		setModeId,
		setModelId,
		setThreadModel: threadModel.setThreadModel,
		setThreadMode: threadModel.setThreadMode,
		setThreadPermission: threadModel.setThreadPermission,
		setThreadThinking: threadModel.setThreadThinking,
		setThinkingLevel,
		setCurrentThreadId,
		setRunningThreadId,
		setTokenUsage,
		setOMProgress,
		setOMModelIds,
		setThreads,
		setActiveTab: tabs.setActiveTab,
		setTasks,
		setPendingApproval: dialogs.setPendingApproval,
		setPendingQuestion: dialogs.setPendingQuestion,
		setPendingPlan: dialogs.setPendingPlan,
		setActiveGraphNode: dialogs.setActiveGraphNode,
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
		setRecordingThreads,
		setRecordingProjects,
		setReplayingThreads,
		setReplayingProjects,
		setRunningThreads,
		setThreadsWithApproval,
		runningThreads,
		threadsWithApproval,
		setLoggingEnabled,
		projectInfoRef: project.projectInfoRef,
		notificationPrefRef: project.notificationPrefRef,
		loadMessages,
		getLastAssistantMessageId: () => {
			for (let i = chat.messages.length - 1; i >= 0; i--) {
				if (chat.messages[i].role === "assistant") return chat.messages[i].id
			}
			return null
		},
		getAgentDurationMs: () => {
			return chat.agentStartedAt ? Date.now() - chat.agentStartedAt : undefined
		},
		currentThreadId,
		loadThreads,
		loadPRStatus: project.loadPRStatus,
		loadEnrichedProjects: project.loadEnrichedProjects,
		handleNewThread,
		handleOpenFolder: project.handleOpenFolder,
		handleBrowserOpenRef: tabs.handleBrowserOpenRef,
		initializeApp,
		setShowCommandPalette: dialogs.setShowCommandPalette,
		setUpdateInfo,
		setDownloadProgress,
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
					// Not a custom command. Known builtins are handled by the
					// composer; anything else (including a removed /model) is
					// dropped instead of being sent to the agent as text.
					if (!BUILTIN_COMMAND_NAMES.has(commandName)) {
						finalContent = ""
					}
				}
			}

			// Separate images from non-image files
			const imageFiles = files?.filter((f) => f.type === "image")
			const textFiles = files?.filter((f) => f.type === "file")

			// Inline non-image file contents into the message text
			if (textFiles && textFiles.length > 0) {
				const fileBlocks = textFiles
					.map((f) => {
						const pathAttr =
							f.relativePath || f.path
								? ` path="${f.relativePath || f.path}"`
								: ""
						return `<file name="${f.name}"${pathAttr}>\n${f.data}\n</file>`
					})
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
						path: f.path,
						relativePath: f.relativePath,
					})
				}
			}
			// Show the user's own bubble first, then start the run. `flushSync`
			// commits it in this task — the composer clears at the same time — and
			// the painted frame below keeps the IPC round trip and the agent's
			// opening events from arriving before the message is on screen.
			// A new send also means the previous turn is no longer the last thing
			// on screen, so any "interrupted" note goes with it.
			setInterruptedThreadKey(null)
			setRevertedTask(false)
			flushSync(() => {
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
			})
			const activeTid =
				currentThreadId || currentThreadIdRef.current || undefined
			setRunningThreadId(activeTid ?? null)
			if (activeTid) {
				setRunningThreads((prev) => new Set(prev).add(activeTid))
			}
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
				await nextPaint()
				await window.api.invoke({
					type: "sendMessage",
					threadId: activeTid,
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
		[currentThreadId],
	)

	const handleAbort = useCallback(async () => {
		ensureAudioContext()
		dispatch({ type: "SET_QUEUE_PAUSED", paused: true })
		// Mark the turn as stopped before the IPC round trip, so the closing note
		// is on screen the moment the stop button is pressed.
		setInterruptedThreadKey(runningThreadId ?? currentThreadId ?? "default")
		setRunningThreadId(null)
		await window.api.invoke({
			type: "abort",
			threadId: currentThreadId ?? undefined,
		})
	}, [runningThreadId, currentThreadId])

	const handleAbortThread = useCallback(
		async (targetThreadId?: string) => {
			if (!targetThreadId || targetThreadId === currentThreadId) {
				await handleAbort()
				return
			}
			ensureAudioContext()
			setInterruptedThreadKey(targetThreadId)
			setRunningThreads((prev) => {
				const next = new Set(prev)
				next.delete(targetThreadId)
				return next
			})
			await window.api.invoke({
				type: "abort",
				threadId: targetThreadId,
			})
		},
		[currentThreadId, handleAbort],
	)

	const handleRevertTask = useCallback(async () => {
		if (!currentThreadId) return
		setRevertingTask(true)
		try {
			const res = (await window.api.invoke({
				type: "revertTaskChanges",
				threadId: currentThreadId,
			})) as { success: boolean; revertedFiles?: string[]; error?: string }
			if (res?.success) {
				setRevertedTask(true)
				showToast(
					`Reverted changes in ${res.revertedFiles?.length ?? 0} file(s)`,
					"success",
				)
			} else {
				showToast(res?.error || "Rollback failed", "error")
			}
		} catch (err: any) {
			showToast(`Rollback failed: ${err?.message || String(err)}`, "error")
		} finally {
			setRevertingTask(false)
		}
	}, [currentThreadId, showToast])

	// Reconcile running threads and agent status periodically to heal any dropped
	// agent_end events or IPC race conditions.
	useEffect(() => {
		if (runningThreads.size === 0 && !chat.isAgentActive && !runningThreadId) {
			return
		}
		let cancelled = false
		let idleReads = 0
		const reconcile = async () => {
			try {
				const res = (await window.api.invoke({
					type: "getRunningThreads",
				})) as
					| { runningThreads?: string[]; runningThreadIds?: string[] }
					| undefined
				if (cancelled) return
				const runningList: string[] =
					res?.runningThreads || res?.runningThreadIds || []
				const activeSet = new Set(runningList)

				setRunningThreads((prev) => {
					if (prev.size === activeSet.size) {
						let same = true
						for (const id of activeSet) {
							if (!prev.has(id)) {
								same = false
								break
							}
						}
						if (same) return prev
					}
					return activeSet
				})

				const curThread = currentThreadId || ""
				if (!activeSet.has(curThread)) {
					if (runningThreadId === curThread) {
						setRunningThreadId(null)
					}
					if (chat.isAgentActive) {
						idleReads += 1
						if (idleReads >= 2) {
							dispatch({ type: "SET_AGENT_ACTIVE", active: false })
						}
					}
				} else {
					idleReads = 0
					if (!chat.isAgentActive) {
						dispatch({ type: "SET_AGENT_ACTIVE", active: true })
					}
					if (runningThreadId !== curThread) {
						setRunningThreadId(curThread)
					}
				}

				const approvalRes = (await window.api.invoke({
					type: "getPendingApprovals",
				})) as { pendingApprovals?: PendingApproval[] } | undefined
				if (!cancelled && approvalRes?.pendingApprovals) {
					const map = new Map<string, PendingApproval>()
					for (const item of approvalRes.pendingApprovals) {
						if (item.threadId) {
							map.set(item.threadId, item)
						}
					}
					setThreadsWithApproval(map)
					if (curThread && map.has(curThread)) {
						const pending = map.get(curThread)
						if (pending) {
							dialogs.setPendingApproval(pending)
						}
					}
				}
			} catch {}
		}
		const interval = setInterval(reconcile, 3000)
		return () => {
			cancelled = true
			clearInterval(interval)
		}
	}, [
		runningThreads.size,
		chat.isAgentActive,
		runningThreadId,
		currentThreadId,
		dispatch,
		dialogs.setPendingApproval,
	])

	// Keep document / window title synced to "projectName / conversationName".
	// While a cross-project session is opening, the clicked row's names win —
	// otherwise the title keeps naming the conversation the user just left.
	useEffect(() => {
		if (pendingSessionTitle) {
			document.title = `${pendingSessionTitle.projectName} / ${pendingSessionTitle.conversationName}`
			return
		}
		const projName =
			project.projectInfo?.name ||
			(project.projectInfo?.rootPath
				? project.projectInfo.rootPath.split("/").filter(Boolean).pop()
				: "") ||
			""
		const currentThread = threads.find((t) => t.id === currentThreadId)
		const conversationName = currentThread?.title || "New Thread"
		const title = projName
			? `${projName} / ${conversationName}`
			: conversationName
		document.title = title
	}, [
		pendingSessionTitle,
		project.projectInfo?.name,
		project.projectInfo?.rootPath,
		threads,
		currentThreadId,
	])

	// Drop the optimistic title once the real project and thread are in place
	// (or after a grace period, so a failed switch cannot pin it forever).
	useEffect(() => {
		if (!pendingSessionTitle) return
		const rootPath = project.projectInfo?.rootPath
		const arrived =
			rootPath === pendingSessionTitle.projectPath &&
			threads.some((t) => t.id === pendingSessionTitle.threadId)
		if (arrived) {
			setPendingSessionTitle(null)
			return
		}
		const timer = setTimeout(() => setPendingSessionTitle(null), 10_000)
		return () => clearTimeout(timer)
	}, [pendingSessionTitle, project.projectInfo?.rootPath, threads])

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
		modeId: currentThreadModeId,
		setModeId,
		thinkingLevel: currentThreadThinkingLevel,
		modelsByThread,
		permissionsByThread,
		modesByThread: threadModel.modesByThread,
		thinkingByThread: threadModel.thinkingByThread,
		threadModel,
		setCurrentThreadId,
		setModelId,
		setThinkingLevel,
		setThreads,
		tabs,
		dialogs,
		applyPermissionMode,
		loadThreads,
		loadMessages,
		runningThreads,
		threadsWithApproval,
		setPendingApproval: dialogs.setPendingApproval,
		setRunningThreadId,
		projectRootPath: project.projectInfo?.rootPath,
		isAgentActive: chat.isAgentActive,
		handleToggleRecording,
		handleStartReplay,
	})
	const {
		handleSwitchThread,
		handleDeleteThread,
		handleRenameThread,
		handleToggleThinking,
		handleSelectThinkingLevel,
		handleSelectMode,
		handleBuiltinCommand,
	} = threadActions

	/**
	 * Open a session from the sidebar. Sessions of other projects are listed too
	 * (their groups stay expanded), so switch project first when the thread
	 * belongs to one that isn't open.
	 */
	const handleOpenSession = useCallback(
		async (projectPath: string, threadId: string) => {
			const switchKey = `${projectPath}:${threadId}`
			if (inFlightSwitchRef.current === switchKey) return

			if (projectPath && projectPath !== project.projectInfo?.rootPath) {
				inFlightSwitchRef.current = switchKey
				// Optimistically update the UI to avoid lag/freeze:
				// Highlight thread, show loading state, and update title immediately
				setCurrentThreadId(threadId)
				tabs.setActiveTab(`thread:${threadId}`)
				dispatch({ type: "BEGIN_THREAD_LOAD", threadId })

				// Name the target session now: building that project's harness
				// takes a moment, and the title bar must not keep showing the
				// project/conversation the user just left.
				const pendingProject = project.enrichedProjects.find(
					(p) => p.rootPath === projectPath,
				)
				setPendingSessionTitle({
					projectPath,
					threadId,
					projectName:
						pendingProject?.name ||
						projectPath.split("/").filter(Boolean).pop() ||
						"",
					conversationName:
						threadsByPath[projectPath]?.find((t) => t.id === threadId)?.title ||
						"New Thread",
				})

				try {
					await project.handleSwitchProject(projectPath, threadId)
				} catch (err) {
					console.error("Failed to switch project session:", err)
					dispatch({ type: "END_THREAD_LOAD", threadId })
				} finally {
					inFlightSwitchRef.current = null
				}
				return
			}

			if (threadId === currentThreadId) return
			await handleSwitchThread(threadId)
		},
		[
			project.projectInfo?.rootPath,
			project.enrichedProjects,
			project.handleSwitchProject,
			threadsByPath,
			currentThreadId,
			tabs.setActiveTab,
			handleSwitchThread,
		],
	)

	const handleRespondApproval = useCallback(
		async (opts: {
			decision: "approve" | "decline"
			scope: "once" | "conversation" | "project" | "global"
			toolCallId: string
			threadId?: string
			toolName?: string
			category?: string | null
			args?: unknown
		}) => {
			const targetThreadId = opts.threadId || currentThreadId || undefined
			if (targetThreadId) {
				setThreadsWithApproval((prev) => {
					if (!prev.has(targetThreadId)) return prev
					const next = new Map(prev)
					next.delete(targetThreadId)
					return next
				})
			}
			await dialogs.handleRespondToApproval({
				...opts,
				threadId: targetThreadId,
			})
		},
		[currentThreadId, dialogs],
	)

	/**
	 * Rename or delete a session of a project that isn't open.
	 *
	 * The active harness can't reach those threads, so the main process writes
	 * the threads table directly and the sidebar snapshots are re-read.
	 */
	const handleMutateForeignThread = useCallback(
		async (
			projectPath: string,
			threadId: string,
			action: "rename" | "delete",
			title?: string,
		) => {
			try {
				const res = (await window.api.invoke({
					type: "mutateProjectThread",
					projectPath,
					threadId,
					action,
					title,
				})) as { ok?: boolean } | null
				if (!res?.ok) {
					showToast(
						action === "rename" ? "Rename failed" : "Delete failed",
						"error",
					)
					return
				}
				refreshProjectThreads()
			} catch {
				showToast(
					action === "rename" ? "Rename failed" : "Delete failed",
					"error",
				)
			}
		},
		[refreshProjectThreads, showToast],
	)

	/**
	 * Rename a worktree from the sidebar. Its row is labelled by the branch the
	 * worktree has checked out, so this renames the branch itself (see the
	 * `renameWorktree` handler) instead of a display alias that only the sidebar
	 * would know about.
	 *
	 * The patch below shows the new label immediately; the reload that follows
	 * re-reads git, so a failed rename pops back to the branch that still exists.
	 */
	const handleRenameWorktree = useCallback(
		async (worktreePath: string, newName: string) => {
			const branch = newName.trim()
			if (!branch) return
			const current =
				project.enrichedProjects
					.flatMap((p) => p.worktrees ?? [])
					.find((wt) => wt.path === worktreePath)?.branch ??
				project.enrichedProjects.find((p) => p.rootPath === worktreePath)
					?.gitBranch
			if (current === branch) return

			try {
				const res = (await window.api.invoke({
					type: "renameWorktree",
					worktreePath,
					newName: branch,
				})) as { success?: boolean; error?: string } | null
				if (!res?.success) {
					showToast(res?.error || "Rename failed", "error")
					return
				}
				project.setEnrichedProjects((prev) =>
					prev.map((p) => {
						const isRenamedFolder = p.isWorktree && p.rootPath === worktreePath
						const worktrees = p.worktrees?.map((wt) =>
							wt.path === worktreePath ? { ...wt, branch } : wt,
						)
						if (!isRenamedFolder && !worktrees) return p
						return {
							...p,
							...(isRenamedFolder ? { gitBranch: branch } : {}),
							...(worktrees ? { worktrees } : {}),
						}
					}),
				)
				project.setProjectInfo((prev) =>
					prev && prev.rootPath === worktreePath
						? { ...prev, gitBranch: branch }
						: prev,
				)
			} catch {
				showToast("Rename failed", "error")
			} finally {
				await project.loadEnrichedProjects()
			}
		},
		[
			project.enrichedProjects,
			project.loadEnrichedProjects,
			project.setEnrichedProjects,
			project.setProjectInfo,
			showToast,
		],
	)

	// Command palette items
	const commandPaletteItems = useMemo((): CommandItem[] => {
		return buildCommandItems({
			close: () => dialogs.setShowCommandPalette(false),
			currentThreadId,
			openFiles: tabs.openFiles,
			threads,
			enrichedProjects: project.enrichedProjects,
			hasGitRepo: gitEnabled,
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
			onOpenSearch: handleOpenSearch,
			handleBrowserOpen: tabs.handleBrowserOpen,
			handleToggleThinking,
			handleSelectMode,
			handleOpenGraphViewer: dialogs.handleOpenGraphViewer,
			handleOpenSettings: dialogs.handleOpenSettings,
			handleOpenAgents: dialogs.handleOpenAgents,
			handleSwitchProject: project.handleSwitchProject,
			isRecording: currentThreadId
				? recordingThreads.has(currentThreadId)
				: project.projectInfo?.rootPath
					? recordingProjects.has(project.projectInfo.rootPath)
					: false,
			handleToggleRecording,
			handleStartReplay,
		})
	}, [
		currentThreadId,
		tabs.openFiles,
		threads,
		project.enrichedProjects,
		gitEnabled,
		setRightSidebarTab,
		modeId,
		thinkingLevel,
		currentThreadId,
		recordingThreads,
		recordingProjects,
		handleToggleRecording,
		handleStartReplay,
		handleNewThread,
		handleToggleThinking,
		handleSelectMode,
		handleOpenSearch,
	])

	// The chat column keeps its minimum: the right splitter stops as soon as it
	// would squeeze it, instead of dragging the panel over the chat content.
	const centerMinWidth = sidebarVisible
		? CENTER_MIN_WIDTH
		: CENTER_MIN_WIDTH_NO_SIDEBAR
	// Maximized only counts while the panel is actually on screen.
	const rightPanelMaximized = rightSidebarVisible && rightSidebarMaximized

	// A file/diff/browser tab opens in the center column, which the maximized
	// panel is covering. Opening one means "show me this", so the panel gives
	// the space back instead of hiding what was just asked for.
	useEffect(() => {
		if (!rightSidebarMaximized) return
		const tab = tabs.activeTab
		if (tab === "chat" || tab.startsWith("thread:")) return
		setRightSidebarMaximized(false)
	}, [tabs.activeTab, rightSidebarMaximized])
	const rightLayoutReserve = rightPanelLayoutReserve(
		sidebarVisible,
		sidebarWidth,
	)

	// Both Overview menus hand their rows to the shell: Terminal (like any
	// other destination) becomes its own tab in the right sidebar.
	const handleOverviewSelect = useCallback(
		(action: OverviewAction) => {
			setRightSidebarVisible(true)
			setRightSidebarTab(overviewActionToTab(action))
		},
		[setRightSidebarTab],
	)

	// Opening brings back whatever was last open; with nothing opened yet that
	// is the landing list. Closing only hides it, so nothing is lost.
	const handleToggleRightSidebar = useCallback(() => {
		setRightSidebarMaximized(false)
		setRightSidebarVisible((visible) => !visible)
	}, [])

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				overflow: "hidden",
				position: "relative",
			}}
		>
			{/* Left sidebar */}
			<Sidebar
				threads={threads}
				threadsByPath={threadsByPath}
				threadsPath={threadsPath}
				currentThreadId={currentThreadId}
				runningThreadId={runningThreadId}
				queuesByThread={chat.queuesByThread}
				loggedInProviders={auth.loggedInProviders}
				projectName={project.projectInfo?.name ?? ""}
				sidebarVisible={sidebarVisible}
				width={sidebarWidth}
				onWidthChange={setSidebarWidth}
				onCollapse={() => setSidebarVisible(false)}
				onToggleSidebar={() => setSidebarVisible((v) => !v)}
				searchOpenSeq={searchOpenSeq}
				enrichedProjects={project.enrichedProjects}
				activeProjectPath={project.projectInfo?.rootPath ?? null}
				isAgentActive={chat.isAgentActive}
				recordingThreads={recordingThreads}
				recordingProjects={recordingProjects}
				replayingThreads={replayingThreads}
				replayingProjects={replayingProjects}
				runningThreads={runningThreads}
				threadsWithApproval={threadsWithApproval}
				onToggleRecording={handleToggleRecording}
				onStopReplay={handleStopReplay}
				onAbort={handleAbortThread}
				activeWorktrees={project.activeWorktrees}
				unreadWorktrees={project.unreadWorktrees}
				worktreeStatuses={project.worktreeStatuses}
				linkedIssues={project.linkedIssues}
				onSwitchThread={handleSwitchThread}
				onOpenSession={handleOpenSession}
				onMutateForeignThread={handleMutateForeignThread}
				onNewThread={handleNewThreadInProject}
				onDeleteThread={handleDeleteThread}
				onRenameThread={handleRenameThread}
				onLogin={auth.handleLogin}
				onSwitchProject={project.handleSwitchProject}
				onOpenFolder={project.handleOpenFolder}
				onCloneRepo={project.handleShowCloneModal}
				onRemoveProject={project.handleRemoveProject}
				onRenameProject={project.handleRenameProject}
				onRenameWorktree={handleRenameWorktree}
				onCreateWorktree={project.handleCreateWorktree}
				onDeleteWorktree={project.handleDeleteWorktree}
				onOpenSettings={() => dialogs.handleOpenSettings()}
				onOpenAccounts={() => {
					dialogs.handleOpenSettings("accounts")
				}}
				onOpenAgents={() => dialogs.handleToggleAgents()}
				onOpenLibrary={() => dialogs.handleToggleLibrary()}
				loggingEnabled={loggingEnabled}
				isLoggingActive={dialogs.showLogConsole}
				onOpenLogging={() => dialogs.handleToggleLogConsole()}
				isSettingsActive={dialogs.showSettings}
				isAgentsActive={dialogs.showAgents}
				isLibraryActive={dialogs.showLibrary}
				activeAgentCount={project.activeWorktrees.size}

				updateInfo={updateInfo}
				downloadProgress={downloadProgress}
				onDownloadUpdate={handleDownloadUpdate}
			/>

			{/* Center panel (middle chat box + editors). Maximizing the right
			    panel takes this column's space: it stops growing and yields to
			    a panel that grows into it, so "fill the window" stays a layout
			    fact rather than a width calculation — and it animates, exactly
			    like the panel sliding in and out. */}
			<div
				data-testid="center-panel"
				// A zero-width column is still focusable: without this, typing
				// after maximizing would land in a composer nobody can see.
				inert={rightPanelMaximized}
				aria-hidden={rightPanelMaximized}
				style={{
					flexGrow: rightPanelMaximized ? 0 : 1,
					flexShrink: 1,
					flexBasis: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					// The column may go all the way to zero; the wrapper inside
					// keeps its own floor and simply gets clipped, so the
					// transcript never reflows mid-animation.
					minWidth: 0,
					transition: "flex-grow 0.22s ease",
				}}
			>
				<div
					style={{
						flex: 1,
						minWidth: centerMinWidth,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					{/* Tab bar */}
					<TabBar
						activeTab={tabs.activeTab}
						currentThreadId={currentThreadId}
						openFiles={tabs.openFiles}
						dirtyFiles={tabs.dirtyFiles}
						threads={threads}
						sidebarVisible={sidebarVisible}
						rightSidebarVisible={rightSidebarVisible}
						gitBranch={project.projectInfo?.gitBranch ?? undefined}
						hasGitRepo={gitEnabled}
						prStatus={project.prStatus}
						isAgentActive={chat.isAgentActive}
						onSelectTab={tabs.setActiveTab}
						onCloseTab={tabs.handleCloseTab}
						onSwitchThread={handleSwitchThread}
						onToggleSidebar={() => setSidebarVisible((v) => !v)}
						onToggleRightSidebar={handleToggleRightSidebar}
						onOverviewSelect={handleOverviewSelect}
						onCreatePR={() =>
							handleSend(
								"Create a pull request for this branch. Push if needed first.",
							)
						}
						projectRootPath={project.projectInfo?.rootPath ?? null}
						projectName={project.projectInfo?.name}
						titleOverride={
							pendingSessionTitle
								? {
										projectName: pendingSessionTitle.projectName,
										conversationName: pendingSessionTitle.conversationName,
									}
								: undefined
						}
						replayingThreads={replayingThreads}
					/>

					<MainContent
						auth={auth}
						project={project}
						tabs={tabs}
						chat={chat}
						tasks={tasks}
						activeThreadKey={currentThreadId || "default"}
						currentModelId={currentThreadModelId}
						thinkingLevel={currentThreadThinkingLevel}
						onSelectThinkingLevel={handleSelectThinkingLevel}
						modeId={currentThreadModeId}
						onSelectMode={handleSelectMode}
						onOpenGraphViewer={dialogs.handleOpenGraphViewer}
						onOpenModelSelector={dialogs.handleOpenModelSelector}
						onOpenBrowserPanel={openBrowserPanel}
						permissionMode={currentThreadPermission}
						isRecording={
							currentThreadId
								? recordingThreads.has(currentThreadId)
								: project.projectInfo?.rootPath
									? recordingProjects.has(project.projectInfo.rootPath)
									: false
						}
						onToggleRecording={handleToggleRecording}
						isReplaying={
							currentThreadId
								? replayingThreads.has(currentThreadId)
								: project.projectInfo?.rootPath
									? replayingProjects.has(project.projectInfo.rootPath)
									: false
						}
						onStopReplay={handleStopReplay}
						isReplaySession={isCurrentThreadReplaySession}
						replaySource={currentThreadReplaySource}
						interrupted={
							interruptedThreadKey === (currentThreadId || "default")
						}
						onRevert={handleRevertTask}
						reverting={revertingTask}
						reverted={revertedTask}
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
						threadsWithApproval={threadsWithApproval}
						pendingApproval={dialogs.pendingApproval}
						onRespondApproval={handleRespondApproval}
					/>
				</div>
			</div>

			{/* Right sidebar. Mounted only while a project is open; hiding it
			    inside the component slides it out rather than unmounting. */}
			{project.enrichedProjects.length > 0 && (
				<RightSidebar
					visible={rightSidebarVisible}
					onCollapse={handleHideRightSidebar}
					maximized={rightPanelMaximized}
					onToggleMaximize={handleToggleRightSidebarMaximized}
					layoutReserve={rightLayoutReserve}
					activeTab={rightSidebarTabs.active}
					openTabs={rightSidebarTabs.open}
					onTabChange={setRightSidebarTab}
					onCloseTab={handleCloseRightSidebarTab}
					projectName={project.projectInfo?.name ?? ""}
					projectPath={project.projectInfo?.rootPath ?? null}
					gitBranch={project.projectInfo?.gitBranch}
					hasGitRepo={gitEnabled}
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
					browserOpenRequest={browserPanelRequest}
					onSelectMenuItem={handleOverviewSelect}
					terminalFocusSignal={terminalFocusSignal}
					currentThreadId={currentThreadId}
					threadTitle={
						threads.find((t) => t.id === currentThreadId)?.title ||
						(currentThreadId
							? `Thread #${currentThreadId.slice(0, 8)}`
							: "Current Session")
					}
					currentThreadModelId={currentThreadModelId}
					currentThreadPermission={currentThreadPermission}
					modeId={currentThreadModeId}
					tokenUsage={tokenUsage}
					messages={chat.messages}
					tools={chat.tools}
					openFiles={tabs.openFiles}
					tasks={tasks}
				/>
			)}

			<AppModals
				dialogs={dialogs}
				auth={auth}
				tabs={tabs}
				project={project}
				currentModelId={currentThreadModelId}
				currentModeId={currentThreadModeId}
				isAgentActive={chat.isAgentActive}
				onSelectModel={handleSelectThreadModel}
				onSelectMode={handleSelectMode}
				commandPaletteItems={commandPaletteItems}
				sessionExportData={sessionExportData}
				onCloseExport={() => setSessionExportData(null)}
				onExportSuccess={(savedPath) =>
					showToast(`Exported to ${savedPath}`, "success")
				}
				onExportError={(msg) => showToast(msg, "error")}
				showReplayModal={showReplayModal}
				onCloseReplay={() => setShowReplayModal(false)}
				onStartReplay={(filePath) => handleStartReplay(filePath)}
				onReplayError={(msg) => showToast(msg, "error")}
				currentThreadId={currentThreadId}
				showToast={showToast}
			/>

			{/* Floating Toast Notification */}
			{toast && (
				<div
					role="status"
					aria-live="polite"
					style={{
						position: "fixed",
						top: 24,
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: 99999,
						maxWidth: "min(560px, calc(100vw - 48px))",
						padding: "8px 14px",
						borderRadius: 8,
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						boxShadow: "var(--shadow-popover)",
						color: "var(--text)",
						fontFamily: "inherit",
						fontSize: 12,
						fontWeight: 500,
						lineHeight: 1.5,
						letterSpacing: "0.2px",
						display: "flex",
						alignItems: "flex-start",
						gap: 8,
						pointerEvents: "none",
					}}
				>
					<span
						style={{ color: toastAccent, fontWeight: 700, flex: "0 0 auto" }}
					>
						{toastGlyph}
					</span>
					<span style={{ minWidth: 0, wordBreak: "break-word" }}>
						{toast.message}
					</span>
				</div>
			)}
		</div>
	)
}
