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
import { getAppDataDir } from "../utils/project.js"
import { getToolCategory, TOOL_CATEGORIES } from "../permissions.js"
import type { ToolCategory } from "../permissions.js"

import { AuthStorage } from "../auth/storage.js"
import { PlaywrightBrowserManager } from "../browser/playwright-manager.js"

// Extracted modules
import { ElectronStateManager } from "./electron-state.js"
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

// Suppress benign AI SDK warning banners
;(globalThis as any).AI_SDK_LOG_WARNINGS = false

process.on("uncaughtException", (err) => {
	if (
		err?.message?.includes("Object has been destroyed") ||
		err?.message?.includes("Render frame was disposed")
	) {
		console.warn(
			"[main] Suppressed IPC send to destroyed window/webContents:",
			err.message,
		)
		return
	}
	console.error("[main] Uncaught exception:", err)
})

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

function getActiveSession(): WorktreeSession {
	return sessions.get(activeSessionPath)!
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
		const handler = handlers[command.type]
		if (!handler) {
			console.warn("Unknown IPC command:", command.type)
			return null
		}
		return handler(command, {
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
	})
}

// =============================================================================
// Bridge Harness events to renderer (all sessions, tagged with worktreePath)
// =============================================================================
function bridgeAllEvents(window: BrowserWindow) {
	for (const [sessionPath, session] of sessions) {
		if (session.unsubscribe) {
			session.unsubscribe()
			session.unsubscribe = null
		}
		session.unsubscribe = session.harness.subscribe((event) => {
			if (window.isDestroyed()) return

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
		backgroundColor: "#ffffff",
		icon: appIcon,
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.cjs"),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
		},
	})

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

	// Prevent links in the renderer from navigating the main window away from the app.
	const rendererOrigin = process.env.ELECTRON_RENDERER_URL || ""
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (rendererOrigin && url.startsWith(rendererOrigin)) return
		event.preventDefault()
		safeSend(mainWindow, "open-url", url)
	})

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		safeSend(mainWindow, "open-url", url)
		return { action: "deny" }
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

	let projectPath: string
	if (cliArg) {
		projectPath = path.resolve(cliArg)
	} else {
		const recentProjects = loadRecentProjects().filter(
			(p) => p.rootPath && p.rootPath !== "/" && fs.existsSync(p.rootPath),
		)
		if (recentProjects.length > 0) {
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
	}
	activeSessionPath = projectPath

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

	// Initialize harness
	await initialSession.harness.init()
	await ensureAuthenticatedModel(
		initialSession.harness,
		initialSession.authStorage,
	)

	// Load OM progress for the current thread
	await initialSession.harness.loadOMProgress?.().catch(() => {})

	// Init MCP
	if (initialSession.mcpManager?.hasServers()) {
		await initialSession.mcpManager.init()
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

	// Redirect console noise to log file
	const logFile = path.join(getAppDataDir(), "debug.log")
	const logStream = fs.createWriteStream(logFile, { flags: "a" })
	const fmt = (a: unknown): string => {
		if (typeof a === "string") return a
		if (a instanceof Error) return `${a.name}: ${a.message}`
		try {
			return JSON.stringify(a)
		} catch {
			return String(a)
		}
	}
	console.error = (...args: unknown[]) => {
		logStream.write(
			`[ERROR] ${new Date().toISOString()} ${args.map(fmt).join(" ")}\n`,
		)
	}
	console.warn = (...args: unknown[]) => {
		logStream.write(
			`[WARN] ${new Date().toISOString()} ${args.map(fmt).join(" ")}\n`,
		)
	}
	console.info = (...args: unknown[]) => {
		logStream.write(
			`[INFO] ${new Date().toISOString()} ${args.map(fmt).join(" ")}\n`,
		)
	}

	// Filter benign macOS system-level IMK/TSM Mach port stderr noise
	const origStderrWrite = process.stderr.write.bind(process.stderr)
	process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
		const str = typeof chunk === "string" ? chunk : chunk?.toString() || ""
		if (
			str.includes("IMKCFRunLoopWakeUpReliable") ||
			str.includes("TSM AdjustCapsLockLEDForKeyTransitionHandling") ||
			str.includes("AI_SDK_LOG_WARNINGS") ||
			str.includes("MachPortRendezvousServer")
		) {
			logStream.write(`[STDERR-FILTERED] ${new Date().toISOString()} ${str}\n`)
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
	setMainWindowRef(null)
	for (const sessionPath of [...sessions.keys()]) {
		cleanupSession(sessionPath)
	}
})

app.on("window-all-closed", async () => {
	setMainWindowRef(null)
	for (const sessionPath of [...sessions.keys()]) {
		cleanupSession(sessionPath)
	}
	app.quit()
})
