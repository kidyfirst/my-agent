import * as fs from "node:fs"
import * as path from "node:path"
import type { BrowserWindow } from "electron"
import { app } from "electron"
import {
	logger,
	installConsoleCapture,
	normalizeLoggingConfig,
	type LogEntry,
	type LoggingConfig,
} from "../core/logger/index.js"
import { getAppDataDir } from "../utils/project.js"
import { safeSend } from "./helpers.js"

/**
 * Main-process wiring for the developer logger: config persistence, the log
 * file, live streaming to the Logging modal, and export helpers.
 *
 * The renderer never touches the filesystem — it asks for the log entries and
 * receives them as `log_entries` events on the existing `harness:event` channel.
 */

const CONFIG_FILE = "logging.json"
const LOG_FILE = "app.log"
const FLUSH_INTERVAL_MS = 200
const MAX_BATCH = 250

let config: LoggingConfig = normalizeLoggingConfig(undefined)
let logFilePath = ""
let logStreamingActive = false
let getWindow: () => BrowserWindow | null = () => null
let pending: LogEntry[] = []
let flushTimer: NodeJS.Timeout | null = null
let uninstallConsoleCapture: (() => void) | null = null
let interceptorsInstalled = false

export function getLogDir(): string {
	return path.join(getAppDataDir(), "logs")
}

function getConfigPath(): string {
	return path.join(getAppDataDir(), CONFIG_FILE)
}

export function getLogFilePath(): string {
	return logFilePath
}

export function getLoggingConfig(): LoggingConfig {
	return { ...config }
}

function readConfigFile(): LoggingConfig {
	try {
		const raw = fs.readFileSync(getConfigPath(), "utf8")
		return normalizeLoggingConfig(JSON.parse(raw))
	} catch {
		return normalizeLoggingConfig(undefined)
	}
}

function writeConfigFile(next: LoggingConfig): void {
	try {
		fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true })
		fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), "utf8")
	} catch (e) {
		logger.warn("logging", "failed to persist logging config", { error: e })
	}
}

function applyConfig(
	next: LoggingConfig,
	options?: { silent?: boolean },
): void {
	config = next
	// `enabled` is the master switch; the chosen level is remembered while it is
	// off so turning the feature back on restores what the user picked.
	const effectiveLevel = next.enabled ? next.level : "off"
	logger.configure({ ...next, level: effectiveLevel })
	logger.setFilePath(logFilePath)
	if (effectiveLevel !== "off" && logFilePath) {
		try {
			fs.mkdirSync(path.dirname(logFilePath), { recursive: true })
			const maxBytes = next.maxFileSizeMB * 1024 * 1024
			try {
				if (fs.statSync(logFilePath).size > maxBytes) {
					fs.renameSync(logFilePath, `${logFilePath}.1`)
				}
			} catch {}
			logger.openFile(logFilePath)
		} catch {}
	}
	if (!options?.silent) {
		logger.info("logging", "config applied", {
			enabled: next.enabled,
			level: effectiveLevel,
			consoleEcho: next.consoleEcho,
			file: logFilePath,
		})
	}
}

/** Install `console.*` capture once; the logger filters by level afterwards. */
export function installConsoleHooks(): void {
	if (interceptorsInstalled) return
	interceptorsInstalled = true
	// In a dev build the terminal is the primary window into the app, so keep
	// printing there; a packaged build only echoes when the user asked for it.
	uninstallConsoleCapture = installConsoleCapture(logger, {
		echo: () => config.consoleEcho || !app.isPackaged,
	})

	process.on("uncaughtException", (err) => {
		const message = err?.message ?? ""
		// Window teardown races are expected during quit; do not page the user.
		if (
			message.includes("Object has been destroyed") ||
			message.includes("Render frame was disposed")
		) {
			logger.warn("process", "suppressed ipc send to destroyed window", {
				error: message,
			})
			return
		}
		logger.error("process", "uncaught exception", { error: err })
	})

	process.on("unhandledRejection", (reason) => {
		logger.error("process", "unhandled promise rejection", { reason })
	})
}

export interface InitLoggingOptions {
	/** Called with the window that should receive live log batches. */
	getWindow: () => BrowserWindow | null
}

/**
 * Load the persisted config, open the log file and start streaming.
 * Safe to call before the window exists.
 */
export function initLogging(options: InitLoggingOptions): LoggingConfig {
	getWindow = options.getWindow
	logFilePath = path.join(getLogDir(), LOG_FILE)
	installConsoleHooks()
	config = readConfigFile()
	applyConfig(config, { silent: true })
	startLogStreaming()
	logger.info("logging", "logger initialised", {
		level: config.level,
		enabled: config.enabled,
		file: logFilePath,
		pid: process.pid,
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
		platform: `${process.platform} ${process.arch}`,
	})
	return getLoggingConfig()
}

/** Coalesce bursts (agent streaming produces a lot of debug lines). */
function scheduleFlush(): void {
	if (flushTimer) return
	flushTimer = setTimeout(() => {
		flushTimer = null
		flush()
	}, FLUSH_INTERVAL_MS)
	flushTimer.unref?.()
}

function flush(): void {
	if (!logStreamingActive) {
		pending = []
		return
	}
	if (pending.length === 0) return
	const win = getWindow()
	const batch = pending
	pending = []
	if (!win) return
	for (let i = 0; i < batch.length; i += MAX_BATCH) {
		safeSend(win, "harness:event", {
			type: "log_entries",
			entries: batch.slice(i, i + MAX_BATCH),
		})
	}
}

function startLogStreaming(): void {
	logger.subscribe((entry) => {
		if (!logStreamingActive) return
		pending.push(entry)
		scheduleFlush()
	})
}

/**
 * The renderer asks for a stream only while the Logging modal is open; the ring
 * buffer still accumulates history in the meantime.
 */
export function setLogStreaming(active: boolean): void {
	logStreamingActive = active
	if (!active) pending = []
}

export interface LoggingStatus {
	config: LoggingConfig
	filePath: string
	logDir: string
	fileExists: boolean
	fileSizeBytes: number
	entryCount: number
}

export function getLoggingStatus(): LoggingStatus {
	let size = 0
	let exists = false
	try {
		const stat = fs.statSync(logFilePath)
		size = stat.size
		exists = true
	} catch {}
	return {
		config: getLoggingConfig(),
		filePath: logFilePath,
		logDir: getLogDir(),
		fileExists: exists,
		fileSizeBytes: size,
		entryCount: logger.getEntryCount(),
	}
}

/** Patch the config, persist it, apply it, and tell the renderer. */
export function updateLoggingConfig(
	patch: Partial<LoggingConfig>,
): LoggingConfig {
	const merged = normalizeLoggingConfig({ ...config, ...patch })
	// Selecting a concrete level obviously means "log something", so treat it as
	// enabling the feature. Otherwise the sidebar item could stay hidden while
	// the logger is silently active.
	if (patch.level && patch.level !== "off" && patch.enabled === undefined) {
		merged.enabled = true
	}
	if (merged.enabled && merged.level === "off") merged.level = "info"

	writeConfigFile(merged)
	applyConfig(merged)

	safeSend(getWindow(), "harness:event", {
		type: "logging_config_changed",
		config: getLoggingConfig(),
	})
	return getLoggingConfig()
}

export function getLogEntries(options?: { since?: number; limit?: number }): {
	entries: LogEntry[]
	lastSeq: number
	total: number
} {
	const entries = logger.getEntries(options)
	return {
		entries,
		lastSeq:
			entries.length > 0
				? entries[entries.length - 1].seq
				: (options?.since ?? 0),
		total: logger.getEntryCount(),
	}
}

/** Clear both the in-memory view and the on-disk file. */
export function clearLogs(): { cleared: boolean } {
	logger.clear()
	logger.info("logging", "log cleared by user")
	return { cleared: true }
}

/** Copy the current log file to a location the user picks. */
export async function exportLogFile(
	parent: BrowserWindow | null,
): Promise<{ canceled: boolean; filePath?: string; error?: string }> {
	try {
		const { dialog } = await import("electron")
		logger.info("logging", "export requested")
		// Flush pending lines so the exported file contains what is on screen.
		logger.flushNow()
		const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
		const options = {
			title: "Save log file",
			defaultPath: path.join(getAppDataDir(), `myagent-log-${stamp}.log`),
			filters: [{ name: "Log file", extensions: ["log", "txt"] }],
		}
		const result = parent
			? await dialog.showSaveDialog(parent, options)
			: await dialog.showSaveDialog(options)
		if (result.canceled || !result.filePath) {
			return { canceled: true }
		}
		fs.copyFileSync(logFilePath, result.filePath)
		logger.info("logging", "log exported", { to: result.filePath })
		return { canceled: false, filePath: result.filePath }
	} catch (e) {
		logger.error("logging", "log export failed", { error: e })
		return {
			canceled: false,
			error: e instanceof Error ? e.message : String(e),
		}
	}
}

export function shutdownLogging(): void {
	try {
		logger.info("logging", "shutting down")
	} catch {}
	try {
		logger.close()
		uninstallConsoleCapture?.()
	} catch {}
}
