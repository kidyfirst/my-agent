import {
	clearLogs,
	exportLogFile,
	getLogEntries,
	getLogFilePath,
	getLoggingStatus,
	setLogStreaming,
	updateLoggingConfig,
} from "../logging.js"
import { logger } from "../../core/logger/index.js"
import type { IpcCommandHandler } from "./types.js"

/**
 * Developer logging IPC surface.
 *
 * These commands are what the Logging modal and the Developer settings section
 * talk to. Everything is best-effort: a logging failure must never surface as an
 * app error.
 */
export function getLoggingHandlers(): Record<string, IpcCommandHandler> {
	const log = logger
	return {
		getLoggingStatus: async () => getLoggingStatus(),

		setLoggingConfig: async (command) => {
			const patch = (command.patch ?? {}) as Record<string, unknown>
			const config = updateLoggingConfig({
				enabled: typeof patch.enabled === "boolean" ? patch.enabled : undefined,
				level: patch.level as any,
				consoleEcho:
					typeof patch.consoleEcho === "boolean"
						? patch.consoleEcho
						: undefined,
			})
			return { config, filePath: getLogFilePath() }
		},

		getLogEntries: async (command) => {
			const since = Number(command.since) || 0
			const limit = Number(command.limit) || undefined
			return getLogEntries({ since, limit })
		},

		clearLogs: async () => clearLogs(),

		exportLogs: async (_command, ctx) => {
			return exportLogFile(ctx.mainWindow)
		},

		openLogFolder: async (_command, ctx) => {
			try {
				const { shell } = await import("electron")
				const file = getLogFilePath()
				log.info("logging", "open log folder", { file })
				// Selecting the file is more useful than opening the folder: the user
				// usually wants to attach *that* file to a report.
				shell.showItemInFolder(file)
				return { success: true, filePath: file }
			} catch (e) {
				log.warn("logging", "open log folder failed", { error: e })
				return { success: false }
			}
		},

		setLogStream: async (command) => {
			const active = Boolean(command.active)
			setLogStreaming(active)
			return { active }
		},

		/**
		 * Renderer-side console/error forwarding. Batched by the renderer so this
		 * stays cheap; the entries keep their own scope so they are easy to tell
		 * apart from main-process lines.
		 */
		logFromRenderer: async (command) => {
			const entries = Array.isArray(command.entries) ? command.entries : []
			for (const raw of entries) {
				const entry = raw as {
					level?: string
					scope?: string
					message?: string
					data?: unknown
				}
				const level = entry.level
				const scope = entry.scope || "renderer"
				const message = entry.message || ""
				if (level === "error")
					log.error(`renderer:${scope}`, message, entry.data)
				else if (level === "warn")
					log.warn(`renderer:${scope}`, message, entry.data)
				else if (level === "info")
					log.info(`renderer:${scope}`, message, entry.data)
				else if (level === "trace")
					log.trace(`renderer:${scope}`, message, entry.data)
				else log.debug(`renderer:${scope}`, message, entry.data)
			}
			return { accepted: entries.length }
		},
	}
}
