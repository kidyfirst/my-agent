// Silence Node.js experimental warnings (e.g. node:sqlite)
{
	const origEmitWarning = process.emitWarning
	process.emitWarning = function (warning: any, ...args: any[]) {
		if (typeof warning === "string" && warning.includes("SQLite")) return
		if (
			warning &&
			typeof warning === "object" &&
			warning.message &&
			warning.message.includes("SQLite")
		) {
			return
		}
		return (origEmitWarning as any).apply(process, [warning, ...args])
	}
}

import {
	app,
	BrowserWindow,
	ipcMain,
	shell,
	Notification,
	Menu,
	dialog,
	nativeImage,
	nativeTheme,
	session,
} from "electron"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"

import { fileURLToPath } from "url"
import * as pty from "node-pty"

import { createMyAgent } from "../harness/index.js"

import {
	createNavigateBrowserTool,
	createComputerUseTool,
} from "../tools/index.js"
import { getToolCategory, TOOL_CATEGORIES } from "../permissions.js"
import type { ToolCategory } from "../permissions.js"

import { AuthStorage } from "../auth/storage.js"
import { PlaywrightBrowserManager } from "../browser/playwright-manager.js"

// Extracted modules
import { ElectronStateManager } from "./electron-state.js"
import { parseExternalUrl } from "./external-links.js"
import type { WorktreeSession, AgentTiming } from "./ipc/types.js"
import { getAllHandlers } from "./ipc/index.js"
import { checkForUpdates } from "./updater/updater.js"
import {
	saveRecentProject,
	loadRecentProjects,
} from "../utils/recent-projects.js"
import { sendDesktopNotification } from "./notifications.js"
import {
	ensureAuthenticatedModel,
	generateThreadTitle,
	deleteThread,
	setMainWindowRef,
	safeSend,
} from "./helpers.js"
import { initLogging, setLogStreaming, shutdownLogging } from "./logging.js"
import { logger } from "../core/logger/index.js"

// Suppress benign AI SDK warning banners
;(globalThis as any).AI_SDK_LOG_WARNINGS = false

// Scoped logging helpers: `log.info("<scope>", "message", data)`.
const log = logger

// =============================================================================
// Resolve __dirname for ESM
// =============================================================================
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve app name from package.json
const packageJsonPath = path.join(__dirname, "../../package.json")
let appName = "My Agent"
try {
	const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
	appName = pkg.build?.productName || pkg.productName || pkg.name || "My Agent"
} catch {}
app.name = appName
app.setName(appName)
if (process.platform === "darwin") {
	process.title = appName
}

// =============================================================================
// App state
// =============================================================================
let mainWindow: BrowserWindow | null = null

const sessions = new Map<string, WorktreeSession>()
let activeSessionPath: string = process.cwd()

// =============================================================================
// Developer logging — loaded before anything else so startup problems are
// captured. Disabled by default (`logging.json` in the app data directory).
// =============================================================================
initLogging({ getWindow: () => mainWindow })
log.info("boot", "main process starting", {
	execPath: process.execPath,
	cwd: process.cwd(),
	argv: process.argv.slice(1),
	versions: process.versions,
})

function getActiveSession(): WorktreeSession {
	if (activeSessionPath && sessions.has(activeSessionPath)) {
		return sessions.get(activeSessionPath)!
	}
	const first = sessions.values().next().value
	if (first) return first
	throw new Error("No active session available")
}

// Per-session agent timing and token tracking for the Agent Dashboard
const sessionTimings = new Map<string, AgentTiming>()

// =============================================================================
// Helpers
// =============================================================================

// =============================================================================
// Create Harness via createMyAgent
// =============================================================================
async function createHarness(projectPath: string) {
	const startedAt = Date.now()
	log.info("session", "creating harness", { project: projectPath })
	const browserManager = new PlaywrightBrowserManager()
	const navigateBrowserTool = createNavigateBrowserTool(browserManager)
	const computerUseTool = createComputerUseTool(browserManager)

	const { harness, mcpManager, hookManager, resolveModel, storageWarning } =
		await createMyAgent({
			cwd: projectPath,
			extraTools: {
				"navigate-browser": navigateBrowserTool,
				computer: computerUseTool,
			},
		})
	log.info("session", "harness ready", {
		project: projectPath,
		ms: Date.now() - startedAt,
		model: (harness as any).getCurrentModelId?.(),
		mode: (harness as any).getCurrentModeId?.(),
		mcpServers: mcpManager?.hasServers?.() ?? false,
	})

	if (storageWarning) {
		console.warn("[storage]", storageWarning)
	}

	// Use our local AuthStorage which has getDefaultModelForProvider, model
	// tracking, and other methods the previous package's version lacks.
	// Both read/write the same auth.json file so credentials stay in sync.
	const authStorage = new AuthStorage()
	const electronState = new ElectronStateManager()

	// Hook manager session tracking + OM progress loading
	harness.subscribe((event) => {
		if (event.type === "thread_changed") {
			// Close browser when switching threads — browser state is conversation-specific
			browserManager.close().catch(() => {})
			hookManager?.setSessionId(event.threadId)
			harness.loadOMProgress?.().catch(() => {})
		} else if (event.type === "thread_created") {
			hookManager?.setSessionId(event.thread.id)
			harness.loadOMProgress?.().catch(() => {})
		} else if (event.type === "thread_deleted") {
			browserManager.close().catch(() => {})
			hookManager?.setSessionId("")
		} else if (event.type === "agent_end") {
			harness.loadOMProgress?.().catch(() => {})
		}
	})

	return {
		harness,
		mcpManager,
		browserManager,
		resolveModel,
		authStorage,
		electronState,
	}
}

// =============================================================================
// IPC Handlers — thin dispatcher using handler registry
// =============================================================================
function registerIpcHandlers() {
	const handlers = getAllHandlers()

	ipcMain.handle("harness:command", async (_event, command) => {
		const type = String(command?.type ?? "unknown")
		const handler = handlers[type]
		if (!handler) {
			log.warn("ipc", "unknown command", { type })
			return null
		}
		const startedAt = Date.now()
		// Building the summary costs a little; skip it unless the level wants it.
		const detailWanted =
			log.getConfig().level === "debug" || log.getConfig().level === "trace"
		if (detailWanted) {
			log.debug("ipc", `→ ${type}`, { args: summarizeCommand(command) })
		}
		try {
			const result = await handler(command, {
				getActiveSession,
				mainWindow,
				sessions,
				activeSessionPath,
				setActiveSessionPath: (p: string) => {
					activeSessionPath = p
				},
				sessionTimings,
				cleanupSession,
				bridgeAllEvents,
				createHarness,
				ensureAuthenticatedModel,
				generateThreadTitle,
				deleteThread,
			})
			if (detailWanted) {
				log.debug("ipc", `← ${type}`, {
					ms: Date.now() - startedAt,
					result: summarizeResult(result),
				})
			}
			return result
		} catch (error) {
			// The UI shows the failure; the log has to carry the stack and inputs
			// so a report can be reproduced.
			log.error("ipc", `✖ ${type}`, {
				ms: Date.now() - startedAt,
				args: summarizeCommand(command),
				error,
			})
			throw error
		}
	})
}

const REDACTED_KEYS = /token|key|secret|password|authorization/i

/** Keep IPC logs readable: trim long payloads, drop credentials, cap depth. */
function summarizeCommand(command: any): unknown {
	if (!command || typeof command !== "object") return command
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(command)) {
		if (key === "type") continue
		if (REDACTED_KEYS.test(key)) {
			out[key] = "[redacted]"
			continue
		}
		if (typeof value === "string" && value.length > 300) {
			out[key] = `${value.slice(0, 300)}… (+${value.length - 300} chars)`
			continue
		}
		if (Array.isArray(value) && value.length > 12) {
			out[key] = `[${value.length} items]`
			continue
		}
		out[key] = value
	}
	return out
}

function summarizeResult(result: unknown): unknown {
	if (result == null) return result
	if (typeof result === "string") {
		return result.length > 200 ? `${result.slice(0, 200)}…` : result
	}
	if (Array.isArray(result)) return `[${result.length} items]`
	if (typeof result === "object") {
		const keys = Object.keys(result as Record<string, unknown>)
		return keys.length > 8 ? `{${keys.slice(0, 8).join(",")},…}` : result
	}
	return result
}

// =============================================================================
// Bridge Harness events to renderer (all sessions, tagged with worktreePath)
// =============================================================================

/**
 * Turn a harness event into a log line. These are the steps a support report
 * usually needs ("it stopped after the second tool call"), so they are recorded
 * even when the renderer decides not to show them.
 */
function logHarnessEvent(sessionPath: string, event: any): void {
	const project = path.basename(sessionPath || "") || sessionPath
	const threadId = event?.threadId as string | undefined
	const base = { project, threadId }
	switch (event?.type) {
		case "agent_start":
			log.info("agent", "run started", {
				...base,
				modelId: event.modelId,
				modeId: event.modeId,
			})
			break
		case "agent_end":
			if (event.error) {
				log.error("agent", "run failed", { ...base, error: event.error })
			} else {
				log.info("agent", "run finished", {
					...base,
					durationMs: event.durationMs,
				})
			}
			break
		case "tool_start":
			log.info("tool", `▶ ${event.toolName}`, {
				...base,
				toolCallId: event.toolCallId,
				args: event.args,
			})
			break
		case "tool_end":
			if (event.isError) {
				log.error("tool", `✖ ${event.toolName}`, {
					...base,
					toolCallId: event.toolCallId,
					result: event.result,
				})
			} else {
				log.debug("tool", `✔ ${event.toolName}`, {
					...base,
					toolCallId: event.toolCallId,
					result: event.result,
				})
			}
			break
		case "tool_approval_required":
			log.info("permission", "approval required", {
				...base,
				toolName: event.toolName,
				args: event.args,
			})
			break
		case "error":
			log.error("agent", "error event", { ...base, error: event.error })
			break
		case "message_start":
			log.debug("agent", "message start", {
				...base,
				messageId: event.messageId,
			})
			break
		case "message_end":
			log.debug("agent", "message end", { ...base, messageId: event.messageId })
			break
		case "mode_changed":
			log.info("runtime", "mode changed", { ...base, modeId: event.modeId })
			break
		case "model_changed":
			log.info("runtime", "model changed", { ...base, modelId: event.modelId })
			break
		case "permission_mode_changed":
			log.info("runtime", "permission mode changed", {
				...base,
				permissionMode: event.permissionMode,
			})
			break
		case "thread_created":
		case "thread_changed":
		case "thread_deleted":
		case "thread_title_updated":
			log.info("thread", event.type, {
				...base,
				threadId: event.threadId ?? event.thread?.id,
			})
			break
		case "session_replay_started":
		case "session_replay_stopped":
		case "session_recording_changed":
		case "session_recording_exported":
			log.info("replay", event.type, {
				...base,
				file: event.filePath ?? event.replayFile,
			})
			break
		default:
			log.trace("event", String(event?.type ?? "unknown"), base)
	}
}

function bridgeAllEvents(window: BrowserWindow) {
	for (const [sessionPath, session] of sessions) {
		if (session.unsubscribe) {
			session.unsubscribe()
			session.unsubscribe = null
		}
		session.unsubscribe = session.harness.subscribe((event) => {
			if (window.isDestroyed()) return

			// Every harness event is a step the user might need to inspect later,
			// so record it before the UI gets a chance to swallow it.
			logHarnessEvent(sessionPath, event)

			const serialized = { ...event } as Record<string, unknown>
			if (event.type === "error" && event.error instanceof Error) {
				serialized.error = {
					message: event.error.message,
					name: event.error.name,
					stack: event.error.stack,
				}
			}

			serialized.worktreePath = sessionPath

			// A failed run carries `error`; tag it as such so the renderer does not
			// reload messages from storage and wipe the error bubble.
			if (event.type === "agent_end" && (event as { error?: string }).error) {
				serialized.reason = "error"
			}

			// Track agent timing for the Agent Dashboard
			if (event.type === "agent_start") {
				const timing = sessionTimings.get(sessionPath) ?? {
					startedAt: null,
					totalDurationMs: 0,
					currentModelId: null,
				}
				timing.startedAt = Date.now()
				sessionTimings.set(sessionPath, timing)
			} else if (event.type === "agent_end") {
				const timing = sessionTimings.get(sessionPath)
				if (timing?.startedAt) {
					timing.totalDurationMs += Date.now() - timing.startedAt
					timing.startedAt = null
				}
			} else if (event.type === "model_changed") {
				const timing = sessionTimings.get(sessionPath) ?? {
					startedAt: null,
					totalDurationMs: 0,
					currentModelId: null,
				}
				timing.currentModelId = event.modelId as string
				sessionTimings.set(sessionPath, timing)
			}

			// Attach category info to tool approval events for the UI
			if (event.type === "tool_approval_required") {
				const category = getToolCategory(event.toolName)
				serialized.category = category
				serialized.categoryLabel = category
					? TOOL_CATEGORIES[category]?.label
					: null
			}

			// Desktop notifications for key events (only when window not focused)
			if (!window.isFocused()) {
				switch (event.type) {
					case "agent_end": {
						sendDesktopNotification(
							"Agent finished",
							"Your task is complete",
							sessions,
							activeSessionPath,
						)
						// Auto-transition linked Linear issue to "done" state
						;(async () => {
							try {
								const eState = session.electronState.getState()
								const linkedIssueId = eState.linkedLinearIssueId
								const doneStateId = eState.linkedLinearDoneStateId
								const apiKey = eState.linearApiKey
								if (linkedIssueId && doneStateId && apiKey) {
									await fetch("https://api.linear.app/graphql", {
										method: "POST",
										headers: {
											"Content-Type": "application/json",
											Authorization: apiKey,
										},
										body: JSON.stringify({
											query: `mutation($id: String!, $stateId: String!) {
												issueUpdate(id: $id, input: { stateId: $stateId }) {
													success
												}
											}`,
											variables: { id: linkedIssueId, stateId: doneStateId },
										}),
									})
								}
							} catch (e: any) {
								console.warn("Failed to auto-update Linear issue:", e.message)
							}
						})()
						break
					}
					case "tool_approval_required":
						sendDesktopNotification(
							"Approval needed",
							`Tool: ${event.toolName}`,
							sessions,
							activeSessionPath,
						)
						break
					case "ask_question":
						sendDesktopNotification(
							"Question from agent",
							event.question ?? "",
							sessions,
							activeSessionPath,
						)
						break
					case "plan_approval_required":
						sendDesktopNotification(
							"Plan review",
							event.title ?? "",
							sessions,
							activeSessionPath,
						)
						break
					case "error":
						sendDesktopNotification(
							"Agent error",
							event.error?.message ?? "An error occurred",
							sessions,
							activeSessionPath,
						)
						break
				}
			}

			safeSend(window, "harness:event", serialized)
		})
	}
}

// =============================================================================
// Session cleanup
// =============================================================================
function cleanupSession(sessionPath: string) {
	const session = sessions.get(sessionPath)
	if (!session) return
	log.info("session", "cleaning up session", { project: sessionPath })
	if (session.unsubscribe) {
		try {
			session.unsubscribe()
		} catch {}
		session.unsubscribe = null
	}
	for (const [, ptySession] of session.ptySessions) {
		try {
			ptySession.kill()
		} catch {}
	}
	session.ptySessions.clear()
	session.mcpManager?.disconnect().catch(() => {})
	session.browserManager?.close().catch(() => {})
	sessions.delete(sessionPath)
	sessionTimings.delete(sessionPath)
}

// =============================================================================
// Create Window
// =============================================================================
function createWindow() {
	log.info("boot", "creating main window")
	const iconPath = path.join(__dirname, "../../resources/icon.png")
	const appIcon = nativeImage.createFromPath(iconPath)

	mainWindow = new BrowserWindow({
		title: appName,
		width: 1200,
		height: 800,
		minWidth: 900,
		minHeight: 400,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: 12 },
		// Fallback only: the renderer paints the splash before this is ever
		// visible. Match the OS skin so even the fallback frame is not white.
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090b" : "#ffffff",
		// The renderer paints the boot splash itself, so wait for that first
		// frame: showing the window earlier is exactly the empty box the splash
		// exists to hide.
		show: false,
		icon: appIcon,
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.cjs"),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
		},
	})

	const win = mainWindow
	win.once("ready-to-show", () => {
		log.info("boot", "window ready-to-show")
		win.show()
	})
	// A renderer that never paints (dev server down, failed load) must not
	// leave the app running without a window.
	const revealTimer = setTimeout(() => {
		if (!win.isVisible()) {
			log.warn("boot", "window reveal fallback")
			win.show()
		}
	}, 4000)
	win.once("closed", () => clearTimeout(revealTimer))

	mainWindow.on("focus", () => {
		safeSend(mainWindow, "window-focus")
	})

	// Update mainWindowRef for helpers
	setMainWindowRef(mainWindow)

	if (process.platform === "darwin" && app.dock) {
		app.dock.setIcon(appIcon)
		app.dock.setBadge("")
	}

	// Dock badge count (macOS)
	ipcMain.on("set-badge-count", (_event, count: number) => {
		if (process.platform === "darwin" && app.dock) {
			app.dock.setBadge(count > 0 ? String(count) : "")
		}
	})

	// Links must never navigate the app window away from itself. Ordinary web
	// links go to the user's own browser — that is what clicking a link in an
	// answer or in Settings means; only non-web schemes still fall back to the
	// in-app handler.
	const rendererOrigin = process.env.ELECTRON_RENDERER_URL || ""
	const openLink = (url: string) => {
		const external = parseExternalUrl(url)
		if (external) {
			void shell.openExternal(external)
			return
		}
		safeSend(mainWindow, "open-url", url)
	}

	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (rendererOrigin && url.startsWith(rendererOrigin)) return
		event.preventDefault()
		openLink(url)
	})

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		openLink(url)
		return { action: "deny" }
	})

	// Renderer console output never reaches the main process on its own. Record
	// it here so a UI-side exception shows up in the same log file as the run
	// that caused it.
	mainWindow.webContents.on("console-message", (details) => {
		const { level, message, lineNumber, sourceId } = details
		const scope = `renderer${sourceId ? `:${path.basename(sourceId)}` : ""}`
		const data = { line: lineNumber, source: sourceId }
		if (level === "error") log.error(scope, message, data)
		else if (level === "warning") log.warn(scope, message, data)
		else if (level === "info") log.info(scope, message, data)
		else log.debug(scope, message, data)
	})

	mainWindow.webContents.on("render-process-gone", (_event, details) => {
		log.error("renderer", "render process gone", details)
	})

	mainWindow.webContents.on("unresponsive", () => {
		log.warn("renderer", "window unresponsive")
	})

	mainWindow.webContents.on("did-finish-load", () => {
		// A reloaded renderer has no open log modal, so stop pushing batches at a
		// window that would silently drop them.
		setLogStreaming(false)
		log.info("boot", "renderer loaded", {
			url: mainWindow?.webContents.getURL(),
		})
	})

	mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
		log.error("boot", "renderer failed to load", { code, desc, url })
	})

	// Dev or production
	if (process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
	} else {
		mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"))
	}

	mainWindow.on("close", () => {
		setMainWindowRef(null)
		for (const session of sessions.values()) {
			if (session.unsubscribe) {
				try {
					session.unsubscribe()
				} catch {}
				session.unsubscribe = null
			}
			for (const [, ptyProcess] of session.ptySessions) {
				try {
					ptyProcess.kill()
				} catch {}
			}
			session.ptySessions.clear()
		}
	})

	mainWindow.on("closed", () => {
		mainWindow = null
		setMainWindowRef(null)
	})
}

// =============================================================================
// App Menu
// =============================================================================
function setupMenu() {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "File",
			submenu: [
				{
					label: "New Thread",
					accelerator: "CmdOrCtrl+N",
					click: () => {
						safeSend(mainWindow, "harness:event", {
							type: "shortcut",
							action: "new_thread",
						})
					},
				},
				{
					label: "Open Project...",
					accelerator: "CmdOrCtrl+O",
					click: () => {
						safeSend(mainWindow, "harness:event", {
							type: "shortcut",
							action: "open_project",
						})
					},
				},
				{ type: "separator" },
				{ role: "close" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
				{ type: "separator" },
				{
					label: "Toggle Sidebar",
					accelerator: "CmdOrCtrl+B",
					click: () => {
						safeSend(mainWindow, "harness:event", {
							type: "shortcut",
							action: "toggle_sidebar",
						})
					},
				},
				{
					label: "Toggle Terminal",
					accelerator: "CmdOrCtrl+`",
					click: () => {
						safeSend(mainWindow, "harness:event", {
							type: "shortcut",
							action: "toggle_terminal",
						})
					},
				},
				{
					label: "Toggle Explorer",
					accelerator: "CmdOrCtrl+Shift+E",
					click: () => {
						safeSend(mainWindow, "harness:event", {
							type: "shortcut",
							action: "toggle_right_sidebar",
						})
					},
				},
				{
					label: "Git Changes",
					accelerator: "CmdOrCtrl+Shift+G",
					click: () => {
						safeSend(mainWindow, "harness:event", {
							type: "shortcut",
							action: "focus_git",
						})
					},
				},
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "front" },
			],
		},
	]
	Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// =============================================================================
// App Lifecycle & Proxy Configuration
// =============================================================================
const systemProxy =
	process.env.HTTPS_PROXY ||
	process.env.HTTP_PROXY ||
	process.env.https_proxy ||
	process.env.http_proxy
if (systemProxy) {
	app.commandLine.appendSwitch("proxy-server", systemProxy)
}
app.commandLine.appendSwitch("log-level", "3")

app.whenReady().then(async () => {
	app.setName(appName)
	if (systemProxy) {
		session.defaultSession.setProxy({ proxyRules: systemProxy }).catch(() => {})
	}

	// Determine project path:
	// 1. Explicit CLI argument (if provided, exists on disk, and is not "/")
	// 2. Most recent valid project from recent-projects.json (if exists on disk and is not "/")
	// 3. Current working directory (if running from terminal in a non-root folder)
	// 4. Safe fallback: os.homedir()
	const cliArg = process.argv.find(
		(a) =>
			!a.startsWith("-") &&
			a !== process.argv[0] &&
			a !== process.argv[1] &&
			fs.existsSync(a) &&
			path.resolve(a) !== "/",
	)

	const recentProjects = loadRecentProjects().filter(
		(p) => p.rootPath && p.rootPath !== "/" && fs.existsSync(p.rootPath),
	)

	const hasActiveProject = Boolean(cliArg || recentProjects.length > 0)

	let projectPath: string
	if (cliArg) {
		projectPath = path.resolve(cliArg)
	} else if (recentProjects.length > 0) {
		projectPath = recentProjects[0].rootPath
	} else if (
		process.cwd() &&
		process.cwd() !== "/" &&
		fs.existsSync(process.cwd())
	) {
		projectPath = process.cwd()
	} else {
		projectPath = os.homedir()
	}
	activeSessionPath = hasActiveProject ? projectPath : ""

	// Create window and menu
	createWindow()
	setupMenu()

	// Create initial session
	const result = await createHarness(projectPath)
	const initialSession: WorktreeSession = {
		harness: result.harness,
		get session() {
			return result.harness.activeSession
		},
		mcpManager: result.mcpManager,
		browserManager: result.browserManager,
		resolveModel: result.resolveModel,
		authStorage: result.authStorage,
		electronState: result.electronState,
		projectRoot: projectPath,
		unsubscribe: null,
		ptySessions: new Map(),
	}
	sessions.set(projectPath, initialSession)

	// Register IPC and bridge events
	registerIpcHandlers()
	if (mainWindow) bridgeAllEvents(mainWindow)

	// Initialize harness if there is an active project
	if (hasActiveProject) {
		await initialSession.harness.init()
		await ensureAuthenticatedModel(
			initialSession.harness,
			initialSession.authStorage,
		)

		// Persist active project and thread to recent projects if launched explicitly or had recent projects
		const initThreadId = initialSession.harness.getCurrentThreadId()
		const initProjectName =
			(initialSession.harness.getState?.() as any)?.projectName ||
			path.basename(projectPath)
		saveRecentProject(projectPath, initProjectName, initThreadId || undefined)

		// Load OM progress for the current thread
		await initialSession.harness.loadOMProgress?.().catch(() => {})

		// Init MCP
		if (initialSession.mcpManager?.hasServers()) {
			await initialSession.mcpManager.init()
		}
	}

	// Check for application updates on startup
	setTimeout(async () => {
		try {
			const updateInfo = await checkForUpdates()
			if (updateInfo?.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
				safeSend(mainWindow, "harness:event", {
					type: "update_available",
					updateInfo,
				})
			}
		} catch {
			// Non-blocking update check failure
		}
	}, 2000)

	// Filter benign macOS system-level IMK/TSM Mach port stderr noise, but keep
	// everything else flowing so a crash still reaches the terminal.
	const origStderrWrite = process.stderr.write.bind(process.stderr)
	process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
		const str = typeof chunk === "string" ? chunk : chunk?.toString() || ""
		if (
			str.includes("IMKCFRunLoopWakeUpReliable") ||
			str.includes("TSM AdjustCapsLockLEDForKeyTransitionHandling") ||
			str.includes("AI_SDK_LOG_WARNINGS") ||
			str.includes("MachPortRendezvousServer")
		) {
			log.trace("stderr", "filtered system noise", { text: str.trim() })
			if (typeof encoding === "function") encoding()
			else if (typeof cb === "function") cb()
			return true
		}
		return origStderrWrite(chunk, encoding, cb)
	}) as typeof process.stderr.write

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		} else if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore()
			mainWindow.show()
			mainWindow.focus()
			safeSend(mainWindow, "window-focus")
		}
	})
})

app.on("before-quit", () => {
	log.info("boot", "app quitting")
	shutdownLogging()
	setMainWindowRef(null)
	const recent = loadRecentProjects()
	if (
		activeSessionPath &&
		sessions.has(activeSessionPath) &&
		recent.some(
			(r) =>
				path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase() ===
				path.resolve(activeSessionPath).replace(/\/+$/, "").toLowerCase(),
		)
	) {
		const s = sessions.get(activeSessionPath)!
		const curThread = s.harness?.getCurrentThreadId()
		const projName =
			(s.harness?.getState?.() as any)?.projectName ||
			path.basename(activeSessionPath)
		saveRecentProject(activeSessionPath, projName, curThread || undefined)
	}
	for (const sessionPath of [...sessions.keys()]) {
		cleanupSession(sessionPath)
	}
})

app.on("window-all-closed", async () => {
	setMainWindowRef(null)
	const recent = loadRecentProjects()
	if (
		activeSessionPath &&
		sessions.has(activeSessionPath) &&
		recent.some(
			(r) =>
				path.resolve(r.rootPath).replace(/\/+$/, "").toLowerCase() ===
				path.resolve(activeSessionPath).replace(/\/+$/, "").toLowerCase(),
		)
	) {
		const s = sessions.get(activeSessionPath)!
		const curThread = s.harness?.getCurrentThreadId()
		const projName =
			(s.harness?.getState?.() as any)?.projectName ||
			path.basename(activeSessionPath)
		saveRecentProject(activeSessionPath, projName, curThread || undefined)
	}
	for (const sessionPath of [...sessions.keys()]) {
		cleanupSession(sessionPath)
	}
	app.quit()
})
