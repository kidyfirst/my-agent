import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { LogIcon } from "./LogIcon"

/**
 * Live developer log console.
 *
 * Opened from the sidebar item that appears once logging is enabled in
 * Settings → Developer. Entries arrive as `log_entries` batches on the main
 * event channel; the modal also asks for the recent history on open so the
 * screen is never empty.
 */

type LogLevel = "trace" | "debug" | "info" | "warn" | "error"

interface LogEntry {
	seq: number
	ts: number
	level: LogLevel
	scope: string
	message: string
	data?: unknown
}

const LEVEL_ORDER: LogLevel[] = ["trace", "debug", "info", "warn", "error"]

/** Level colors come from the theme, so light/dark stay legible. */
const LEVEL_STYLE: Record<LogLevel, { color: string; label: string }> = {
	trace: { color: "var(--dim)", label: "TRACE" },
	debug: { color: "var(--muted)", label: "DEBUG" },
	info: { color: "var(--text)", label: "INFO" },
	warn: { color: "var(--warning)", label: "WARN" },
	error: { color: "var(--error)", label: "ERROR" },
}

/** Keep the DOM small: older entries stay in state but are not rendered. */
const MAX_RENDERED = 1200

function formatTime(ts: number): string {
	const d = new Date(ts)
	const pad = (n: number, w = 2) => String(n).padStart(w, "0")
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function stringifyData(data: unknown): string {
	try {
		return JSON.stringify(data)
	} catch {
		return String(data)
	}
}

interface LogConsoleModalProps {
	onClose: () => void
}

export function LogConsoleModal({ onClose }: LogConsoleModalProps) {
	const [entries, setEntries] = useState<LogEntry[]>([])
	const [levels, setLevels] = useState<Set<LogLevel>>(new Set(LEVEL_ORDER))
	const [query, setQuery] = useState("")
	const [follow, setFollow] = useState(true)
	const [expanded, setExpanded] = useState<number | null>(null)
	const [status, setStatus] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [filePath, setFilePath] = useState("")
	const [levelSetting, setLevelSetting] = useState<string>("off")
	const listRef = useRef<HTMLDivElement | null>(null)
	const lastSeqRef = useRef(0)
	const onCloseRef = useRef(onClose)
	onCloseRef.current = onClose

	// Load history + subscribe to live batches.
	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const [status, history] = await Promise.all([
					window.api.invoke({ type: "getLoggingStatus" }) as Promise<any>,
					window.api.invoke({
						type: "getLogEntries",
						limit: 1500,
					}) as Promise<any>,
				])
				if (cancelled) return
				if (status?.filePath) setFilePath(status.filePath)
				if (status?.config?.level) setLevelSetting(status.config.level)
				const list = (history?.entries ?? []) as LogEntry[]
				setEntries(list)
				if (list.length > 0) lastSeqRef.current = list[list.length - 1].seq
			} catch {
				// Status is decoration here.
			}
			try {
				await window.api.invoke({ type: "setLogStream", active: true })
			} catch {}
		})()

		const unsubscribe = window.api.onEvent((raw: unknown) => {
			const event = raw as any
			if (event?.type === "logging_config_changed") {
				if (event.config?.level) setLevelSetting(event.config.level)
				// Turning logging off removes the sidebar entry; the console has
				// nothing left to show, so close it instead of going stale.
				if (event.config && event.config.enabled === false) {
					onCloseRef.current()
				}
				return
			}
			if (event?.type !== "log_entries") return
			const batch = (event.entries ?? []) as LogEntry[]
			if (batch.length === 0) return
			lastSeqRef.current = batch[batch.length - 1].seq
			setEntries((prev) => {
				const next = prev.concat(batch)
				// Bound memory in the renderer as well — the modal can stay open
				// for a whole workday.
				return next.length > 5000 ? next.slice(next.length - 5000) : next
			})
		})

		return () => {
			cancelled = true
			unsubscribe()
			window.api.invoke({ type: "setLogStream", active: false }).catch(() => {})
		}
	}, [])

	// Escape closes; matches every other modal in the app.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [onClose])

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		return entries.filter((entry) => {
			if (!levels.has(entry.level)) return false
			if (!q) return true
			return (
				entry.message.toLowerCase().includes(q) ||
				entry.scope.toLowerCase().includes(q) ||
				(entry.data !== undefined &&
					stringifyData(entry.data).toLowerCase().includes(q))
			)
		})
	}, [entries, levels, query])

	const rendered = useMemo(
		() =>
			filtered.length > MAX_RENDERED
				? filtered.slice(filtered.length - MAX_RENDERED)
				: filtered,
		[filtered],
	)

	// Follow the tail unless the user scrolled away or paused.
	useEffect(() => {
		if (!follow) return
		const el = listRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [rendered.length, follow])

	const toggleLevel = useCallback((level: LogLevel) => {
		setLevels((prev) => {
			const next = new Set(prev)
			if (next.has(level)) next.delete(level)
			else next.add(level)
			// Never end up with an empty filter: that reads as "no logs".
			return next.size === 0 ? new Set(LEVEL_ORDER) : next
		})
	}, [])

	const handleClear = useCallback(async () => {
		setBusy(true)
		try {
			await window.api.invoke({ type: "clearLogs" })
			setEntries([])
			setExpanded(null)
			setStatus("Cleared")
		} catch (e) {
			setStatus(`Clear failed: ${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setBusy(false)
			setTimeout(() => setStatus(null), 2500)
		}
	}, [])

	const handleDownload = useCallback(async () => {
		setBusy(true)
		try {
			const res = (await window.api.invoke({ type: "exportLogs" })) as any
			if (res?.canceled) setStatus(null)
			else if (res?.error) setStatus(`Export failed: ${res.error}`)
			else setStatus(`Saved to ${res?.filePath ?? "file"}`)
		} catch (e) {
			setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setBusy(false)
			setTimeout(() => setStatus(null), 5000)
		}
	}, [])

	const handleReveal = useCallback(async () => {
		try {
			await window.api.invoke({ type: "openLogFolder" })
		} catch {}
	}, [])

	const errorCount = useMemo(
		() => entries.reduce((n, e) => (e.level === "error" ? n + 1 : n), 0),
		[entries],
	)

	const buttonStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: 5,
		padding: "5px 10px",
		fontSize: 11,
		fontWeight: 500,
		borderRadius: 6,
		border: "1px solid var(--border)",
		background: "var(--bg-elevated)",
		color: "var(--text)",
		cursor: "pointer",
		fontFamily: "inherit",
		whiteSpace: "nowrap",
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--scrim)",
				backdropFilter: "blur(3px)",
				zIndex: 1000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 20,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					width: "min(1080px, 96vw)",
					height: "min(760px, 88vh)",
					display: "flex",
					flexDirection: "column",
					background: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					overflow: "hidden",
					boxShadow: "var(--shadow-modal)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "8px 12px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
						flexShrink: 0,
					}}
				>
					{/* Title tile — same shape as the Settings dialog's, with the
					    glyph the sidebar's Logging row uses. */}
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<div
							style={{
								width: 22,
								height: 22,
								borderRadius: 5,
								background:
									"linear-gradient(135deg, var(--accent), var(--accent-2))",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--on-accent)",
								fontSize: 12,
								fontWeight: "bold",
							}}
						>
							<LogIcon size={13} strokeWidth={2.2} />
						</div>
						<span
							style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
						>
							Logging
						</span>
					</div>
					<span
						style={{
							fontSize: 9,
							fontWeight: 600,
							padding: "1px 6px",
							borderRadius: 999,
							border: "1px solid var(--border-accent)",
							color: "var(--accent)",
							background: "var(--selected-bg)",
							letterSpacing: "0.3px",
						}}
					>
						{levelSetting === "off" ? "OFF" : levelSetting.toUpperCase()}
					</span>
					{errorCount > 0 && (
						<span
							style={{
								fontSize: 9,
								fontWeight: 600,
								padding: "1px 6px",
								borderRadius: 999,
								color: "var(--error)",
								background: "color-mix(in srgb, var(--error) 12%, transparent)",
							}}
						>
							{errorCount} error{errorCount > 1 ? "s" : ""}
						</span>
					)}

					<div style={{ flex: 1 }} />

					<button
						type="button"
						onClick={() => setFollow((v) => !v)}
						style={{
							...buttonStyle,
							color: follow ? "var(--accent)" : "var(--muted)",
							borderColor: follow ? "var(--border-accent)" : "var(--border)",
						}}
						title={follow ? "Following new entries" : "Paused"}
					>
						{follow ? "◉ Live" : "❙❙ Paused"}
					</button>
					<button
						type="button"
						onClick={handleClear}
						disabled={busy}
						style={buttonStyle}
						title="Clear the log buffer and truncate the log file"
					>
						Clear
					</button>
					<button
						type="button"
						onClick={handleDownload}
						disabled={busy}
						style={buttonStyle}
						title="Save the log file somewhere you can attach it"
					>
						Download
					</button>
					<button
						type="button"
						onClick={handleReveal}
						style={buttonStyle}
						title="Show the log file in Finder / Explorer"
					>
						Reveal
					</button>
					<button
						type="button"
						onClick={onClose}
						title="Close (Esc)"
						style={{
							...buttonStyle,
							padding: 5,
							background: "transparent",
							border: "1px solid transparent",
							color: "var(--muted)",
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Filter bar */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "6px 12px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg)",
						flexShrink: 0,
					}}
				>
					{(["error", "warn", "info", "debug", "trace"] as LogLevel[]).map(
						(level) => {
							const active = levels.has(level)
							return (
								<button
									key={level}
									type="button"
									onClick={() => toggleLevel(level)}
									style={{
										fontSize: 9,
										fontWeight: 700,
										letterSpacing: "0.3px",
										padding: "3px 8px",
										borderRadius: 999,
										cursor: "pointer",
										fontFamily: "inherit",
										border: `1px solid ${active ? LEVEL_STYLE[level].color : "var(--border)"}`,
										color: active ? LEVEL_STYLE[level].color : "var(--dim)",
										background: active ? "transparent" : "var(--bg-surface)",
										opacity: active ? 1 : 0.55,
									}}
								>
									{LEVEL_STYLE[level].label}
								</button>
							)
						},
					)}
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Filter by text, scope or data…"
						style={{
							flex: 1,
							minWidth: 0,
							marginLeft: 6,
							padding: "5px 10px",
							fontSize: 11,
							fontFamily: "inherit",
							color: "var(--text)",
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							outline: "none",
						}}
					/>
					<span
						style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap" }}
					>
						{filtered.length} / {entries.length}
					</span>
				</div>

				{/* Entries */}
				<div
					ref={listRef}
					onScroll={(e) => {
						const el = e.currentTarget
						const atBottom =
							el.scrollHeight - el.scrollTop - el.clientHeight < 24
						if (!atBottom && follow) setFollow(false)
					}}
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
						fontSize: 11,
						lineHeight: 1.55,
						background: "var(--bg)",
					}}
				>
					{rendered.length === 0 ? (
						<div
							style={{
								padding: 28,
								textAlign: "center",
								color: "var(--dim)",
								fontSize: 12,
							}}
						>
							{entries.length === 0
								? "No log entries yet. Use the app and they will stream in here."
								: "No entries match the current filter."}
						</div>
					) : (
						rendered.map((entry) => {
							const style = LEVEL_STYLE[entry.level] ?? LEVEL_STYLE.info
							const isOpen = expanded === entry.seq
							const hasData = entry.data !== undefined
							return (
								<div key={entry.seq}>
									<div
										onClick={() =>
											hasData && setExpanded(isOpen ? null : entry.seq)
										}
										style={{
											display: "flex",
											gap: 8,
											alignItems: "baseline",
											padding: "1px 12px",
											cursor: hasData ? "pointer" : "default",
											borderLeft: `2px solid ${
												entry.level === "error"
													? "var(--error)"
													: entry.level === "warn"
														? "var(--warning)"
														: "transparent"
											}`,
											background: isOpen ? "var(--bg-surface)" : "transparent",
										}}
									>
										<span
											style={{
												color: "var(--dim)",
												flexShrink: 0,
												fontVariantNumeric: "tabular-nums",
											}}
										>
											{formatTime(entry.ts)}
										</span>
										<span
											style={{
												color: style.color,
												flexShrink: 0,
												width: 42,
												fontWeight: 700,
												fontSize: 10,
											}}
										>
											{style.label}
										</span>
										<span
											style={{
												color: "var(--muted)",
												flexShrink: 0,
												maxWidth: 190,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
											title={entry.scope}
										>
											{entry.scope}
										</span>
										<span
											style={{
												color:
													entry.level === "error"
														? "var(--error)"
														: entry.level === "warn"
															? "var(--warning)"
															: "var(--text)",
												wordBreak: "break-word",
												whiteSpace: "pre-wrap",
												flex: 1,
												minWidth: 0,
											}}
										>
											{entry.message}
											{hasData && !isOpen && (
												<span style={{ color: "var(--dim)" }}>
													{"  "}
													{stringifyData(entry.data).slice(0, 220)}
													{stringifyData(entry.data).length > 220 ? "…" : ""}
												</span>
											)}
										</span>
									</div>
									{isOpen && hasData && (
										<pre
											style={{
												margin: 0,
												padding: "6px 12px 10px 60px",
												color: "var(--muted)",
												background: "var(--bg-surface)",
												whiteSpace: "pre-wrap",
												wordBreak: "break-word",
												fontSize: 10.5,
												borderBottom: "1px solid var(--border-muted)",
											}}
										>
											{JSON.stringify(entry.data, null, 2)}
										</pre>
									)}
								</div>
							)
						})
					)}
					{filtered.length > MAX_RENDERED && (
						<div
							style={{
								padding: "6px 12px",
								fontSize: 10,
								color: "var(--dim)",
								borderTop: "1px solid var(--border-muted)",
							}}
						>
							Showing the last {MAX_RENDERED} of {filtered.length} matching
							entries — narrow the filter to see older ones.
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "5px 12px",
						borderTop: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
						fontSize: 10,
						color: "var(--dim)",
						flexShrink: 0,
					}}
				>
					<span
						style={{
							flex: 1,
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							fontFamily:
								"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
						}}
						title={filePath}
					>
						{filePath || "log file not initialised"}
					</span>
					{status && (
						<span style={{ color: "var(--text)", whiteSpace: "nowrap" }}>
							{status}
						</span>
					)}
				</div>
			</div>
		</div>
	)
}
