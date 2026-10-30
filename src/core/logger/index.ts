import * as fs from "node:fs"
import * as path from "node:path"

/**
 * Application-wide logger.
 *
 * It exists so a user can report a problem with an actual trail: the app had no
 * central place to see which step failed, only scattered `console.*` calls that
 * ended up in a file nobody could reach from the UI.
 *
 * Design notes:
 * - Pure Node, no Electron import, so the renderer only sees the *types* and the
 *   main process owns the real instance.
 * - Writes a plain-text log file (easy to attach to a bug report) and keeps a
 *   bounded in-memory ring buffer for the live console modal.
 * - `level: "off"` (the default) makes every call a cheap no-op.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error"
export type LogLevelSetting = LogLevel | "off"

export const LOG_LEVELS: readonly LogLevel[] = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
] as const

export const LOG_LEVEL_SETTINGS: readonly LogLevelSetting[] = [
	"off",
	"error",
	"warn",
	"info",
	"debug",
	"trace",
] as const

const LEVEL_RANK: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
}

/** One line of log output, shared by the file writer and the live console. */
export interface LogEntry {
	/** Monotonic id, lets the renderer de-duplicate entries it already has. */
	seq: number
	/** Epoch milliseconds — the renderer formats this in the user's timezone. */
	ts: number
	level: LogLevel
	scope: string
	message: string
	/** Structured payload, already sanitized (no cycles, no huge strings). */
	data?: unknown
}

export interface LoggingConfig {
	/** Master switch: when false the logger is fully disabled (`level: "off"`). */
	enabled: boolean
	level: LogLevelSetting
	/** Echo captured console output to the terminal that started the app. */
	consoleEcho: boolean
	/** Rotate the file once it grows past this size. */
	maxFileSizeMB: number
	/** Keep at most this many entries in memory for the live console. */
	maxEntries: number
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
	enabled: false,
	level: "info",
	consoleEcho: false,
	maxFileSizeMB: 20,
	maxEntries: 4000,
}

export function isLevelEnabled(
	level: LogLevel,
	setting: LogLevelSetting,
): boolean {
	if (setting === "off") return false
	return LEVEL_RANK[level] >= LEVEL_RANK[setting]
}

/** Normalize whatever a config file or UI gave us into a valid config. */
export function normalizeLoggingConfig(
	input: Partial<LoggingConfig> | null | undefined,
): LoggingConfig {
	const raw = input ?? {}
	const level: LogLevelSetting = LOG_LEVEL_SETTINGS.includes(
		raw.level as LogLevelSetting,
	)
		? (raw.level as LogLevelSetting)
		: DEFAULT_LOGGING_CONFIG.level
	const enabled =
		typeof raw.enabled === "boolean"
			? raw.enabled
			: DEFAULT_LOGGING_CONFIG.enabled
	const maxFileSizeMB =
		typeof raw.maxFileSizeMB === "number" && raw.maxFileSizeMB > 0
			? Math.min(raw.maxFileSizeMB, 512)
			: DEFAULT_LOGGING_CONFIG.maxFileSizeMB
	const maxEntries =
		typeof raw.maxEntries === "number" && raw.maxEntries > 0
			? Math.min(raw.maxEntries, 50_000)
			: DEFAULT_LOGGING_CONFIG.maxEntries
	return {
		enabled,
		// An enabled logger with level "off" would silently drop everything,
		// which is exactly the confusing state this feature is meant to remove.
		level: enabled && level === "off" ? "info" : level,
		consoleEcho:
			typeof raw.consoleEcho === "boolean"
				? raw.consoleEcho
				: DEFAULT_LOGGING_CONFIG.consoleEcho,
		maxFileSizeMB,
		maxEntries,
	}
}

// ---------------------------------------------------------------------------
// Value sanitizing — a debug log must never crash the app or grow unbounded
// ---------------------------------------------------------------------------

const MAX_STRING = 4000
const MAX_ARRAY = 40
const MAX_DEPTH = 5
const MAX_KEYS = 40

function truncate(value: string, max = MAX_STRING): string {
	return value.length > max
		? `${value.slice(0, max)}… (+${value.length - max})`
		: value
}

function sanitize(
	value: unknown,
	depth = 0,
	seen = new WeakSet<object>(),
): unknown {
	if (value == null) return value
	const t = typeof value
	if (t === "string") return truncate(value as string)
	if (t === "number" || t === "boolean") return value
	if (t === "bigint") return `${value as bigint}n`
	if (t === "function") return "[function]"
	if (t === "symbol") return String(value)
	if (value instanceof Error) {
		return {
			name: value.name,
			message: truncate(value.message),
			stack: value.stack ? truncate(value.stack) : undefined,
			cause: (value as { cause?: unknown }).cause
				? sanitize((value as { cause?: unknown }).cause, depth + 1, seen)
				: undefined,
		}
	}
	if (value instanceof Date) return value.toISOString()
	if (depth >= MAX_DEPTH) return "[depth limit]"
	if (typeof value === "object") {
		const obj = value as object
		if (seen.has(obj)) return "[circular]"
		seen.add(obj)
		if (Array.isArray(value)) {
			const out = value
				.slice(0, MAX_ARRAY)
				.map((v) => sanitize(v, depth + 1, seen))
			if (value.length > MAX_ARRAY) out.push(`… (+${value.length - MAX_ARRAY})`)
			return out
		}
		if (value instanceof Map) {
			return sanitize(
				Object.fromEntries(value as Map<unknown, unknown>),
				depth + 1,
				seen,
			)
		}
		if (value instanceof Set) {
			return sanitize([...(value as Set<unknown>)], depth + 1, seen)
		}
		const entries = Object.entries(value as Record<string, unknown>)
		const out: Record<string, unknown> = {}
		for (const [key, val] of entries.slice(0, MAX_KEYS)) {
			out[key] = sanitize(val, depth + 1, seen)
		}
		if (entries.length > MAX_KEYS) {
			out[`…`] = `+( ${entries.length - MAX_KEYS} more keys)`
		}
		return out
	}
	return String(value)
}

export function sanitizeLogData(value: unknown): unknown {
	try {
		return sanitize(value)
	} catch {
		return "[unserializable]"
	}
}

function serializeData(data: unknown): string {
	if (data === undefined) return ""
	try {
		const json = JSON.stringify(data)
		return json && json !== "null" ? ` ${json}` : ""
	} catch {
		return " [unserializable]"
	}
}

/** Text line written to the log file. Stable, greppable, one entry per line. */
export function formatLogLine(entry: LogEntry): string {
	const level = entry.level.toUpperCase().padEnd(5)
	const iso = new Date(entry.ts).toISOString()
	return `${iso} ${level} [${entry.scope}] ${entry.message}${serializeData(entry.data)}`
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export type LogListener = (entry: LogEntry) => void

export class Logger {
	private config: LoggingConfig = { ...DEFAULT_LOGGING_CONFIG }
	private buffer: LogEntry[] = []
	private listeners = new Set<LogListener>()
	private seq = 0
	private streamPath: string | null = null
	private fileBroken = false
	private pending: string[] = []
	private flushTimer: NodeJS.Timeout | null = null

	configure(config: Partial<LoggingConfig>): LoggingConfig {
		this.config = normalizeLoggingConfig({ ...this.config, ...config })
		return this.config
	}

	getConfig(): LoggingConfig {
		return { ...this.config }
	}

	isEnabled(): boolean {
		return this.config.level !== "off"
	}

	setFilePath(filePath: string | null): void {
		if (this.streamPath === filePath) return
		this.flushFile()
		this.streamPath = filePath
		this.fileBroken = false
	}

	getFilePath(): string | null {
		return this.streamPath
	}

	/** Attach the file sink, creating the directory and rotating a fat file. */
	openFile(filePath: string): void {
		this.setFilePath(filePath)
		try {
			fs.mkdirSync(path.dirname(filePath), { recursive: true })
			const maxBytes = this.config.maxFileSizeMB * 1024 * 1024
			try {
				const stat = fs.statSync(filePath)
				if (stat.size > maxBytes) {
					fs.renameSync(filePath, `${filePath}.1`)
				}
			} catch {
				// Missing file is the normal case.
			}
			// Create eagerly: the console shows a path as soon as logging starts,
			// so the file it points at should exist.
			fs.appendFileSync(filePath, "")
			this.fileBroken = false
		} catch {
			this.fileBroken = true
		}
	}

	/**
	 * Append synchronously. Logging is a diagnostic path — losing the last lines
	 * of a crash because a stream had not flushed yet is exactly the failure this
	 * feature exists to prevent.
	 */
	private flushFile(): void {
		if (!this.streamPath || this.pending.length === 0) return
		const chunk = this.pending.join("\n") + "\n"
		this.pending = []
		try {
			fs.appendFileSync(this.streamPath, chunk)
			this.fileBroken = false
		} catch {
			this.fileBroken = true
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null
			this.flushFile()
		}, 250)
		// Never keep the process alive just to flush logs.
		this.flushTimer.unref?.()
	}

	log(
		level: LogLevel,
		scope: string,
		message: string,
		data?: unknown,
	): LogEntry | null {
		if (!isLevelEnabled(level, this.config.level)) return null
		const entry: LogEntry = {
			seq: ++this.seq,
			ts: Date.now(),
			level,
			scope,
			message: truncate(message, 8000),
			data: data === undefined ? undefined : sanitizeLogData(data),
		}

		this.buffer.push(entry)
		if (this.buffer.length > this.config.maxEntries) {
			this.buffer.splice(0, this.buffer.length - this.config.maxEntries)
		}

		if (this.streamPath && !this.fileBroken) {
			this.pending.push(formatLogLine(entry))
			this.scheduleFlush()
		}

		for (const listener of this.listeners) {
			try {
				listener(entry)
			} catch {
				// A broken subscriber must not break logging.
			}
		}
		return entry
	}

	trace(scope: string, message: string, data?: unknown) {
		return this.log("trace", scope, message, data)
	}
	debug(scope: string, message: string, data?: unknown) {
		return this.log("debug", scope, message, data)
	}
	info(scope: string, message: string, data?: unknown) {
		return this.log("info", scope, message, data)
	}
	warn(scope: string, message: string, data?: unknown) {
		return this.log("warn", scope, message, data)
	}
	error(scope: string, message: string, data?: unknown) {
		return this.log("error", scope, message, data)
	}

	/** Pre-bound helpers: `const log = logger.child("ipc")`. */
	child(scope: string) {
		return {
			trace: (message: string, data?: unknown) =>
				this.log("trace", scope, message, data),
			debug: (message: string, data?: unknown) =>
				this.log("debug", scope, message, data),
			info: (message: string, data?: unknown) =>
				this.log("info", scope, message, data),
			warn: (message: string, data?: unknown) =>
				this.log("warn", scope, message, data),
			error: (message: string, data?: unknown) =>
				this.log("error", scope, message, data),
		}
	}

	subscribe(listener: LogListener): () => void {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	/** Ring buffer snapshot, oldest first. */
	getEntries(options?: { since?: number; limit?: number }): LogEntry[] {
		const since = options?.since ?? 0
		const limit = options?.limit ?? this.buffer.length
		const filtered =
			since > 0 ? this.buffer.filter((e) => e.seq > since) : this.buffer
		return limit >= filtered.length
			? [...filtered]
			: filtered.slice(filtered.length - limit)
	}

	getEntryCount(): number {
		return this.seq
	}

	/** Drop the in-memory buffer and truncate the log file. */
	clear(): void {
		this.buffer = []
		this.pending = []
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		if (this.streamPath) {
			try {
				fs.truncateSync(this.streamPath, 0)
			} catch {}
		}
	}

	/** Force pending file lines out now (used before exporting the log). */
	flushNow(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		this.flushFile()
	}

	/** Flush and detach — call before the process exits. */
	close(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		this.flushFile()
		this.streamPath = null
		this.listeners.clear()
	}
}

export const logger = new Logger()

/**
 * Route `console.*` through the logger so existing call sites (there are many,
 * all over `src/core`) become detailed log lines without touching each one.
 *
 * `console.log` is only captured at `debug`: it is the noisiest channel and the
 * default level should stay readable.
 */
export function installConsoleCapture(
	target: Logger = logger,
	options?: { echo?: boolean | (() => boolean) },
): () => void {
	const original = {
		log: console.log.bind(console),
		info: console.info.bind(console),
		debug: console.debug?.bind(console) ?? console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	}

	const emit = (
		level: LogLevel,
		fallbackScope: string,
		args: unknown[],
		originalFn: (...a: unknown[]) => void,
		alwaysEcho = false,
	) => {
		const resolveEcho = () => {
			const setting = options?.echo
			if (typeof setting === "function") {
				try {
					return setting()
				} catch {
					return false
				}
			}
			return setting ?? target.getConfig().consoleEcho
		}
		const shouldEcho = alwaysEcho || resolveEcho()
		if (shouldEcho) originalFn(...args)
		if (!target.isEnabled()) return
		const [first, ...rest] = args
		const message =
			typeof first === "string"
				? first
				: first instanceof Error
					? `${first.name}: ${first.message}`
					: `[${typeof first}]`
		const data =
			rest.length === 0
				? first instanceof Error
					? { error: first }
					: undefined
				: { args: rest }
		target.log(level, fallbackScope, message, data)
	}

	// `console.log` / `console.debug` keep printing to the terminal: that is what
	// they did before logging existed, and developers rely on it. The other
	// channels are only echoed when the user opts in.
	console.log = (...args: unknown[]) =>
		emit("debug", "console", args, original.log, true)
	console.info = (...args: unknown[]) =>
		emit("info", "console", args, original.info)
	console.debug = (...args: unknown[]) =>
		emit("debug", "console", args, original.debug, true)
	console.warn = (...args: unknown[]) =>
		emit("warn", "console", args, original.warn)
	console.error = (...args: unknown[]) =>
		emit("error", "console", args, original.error)

	return () => {
		console.log = original.log
		console.info = original.info
		console.debug = original.debug
		console.warn = original.warn
		console.error = original.error
	}
}
