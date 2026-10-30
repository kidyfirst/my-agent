import { useCallback, useEffect, useState } from "react"
import { SectionHeader, SettingRow, Select, Toggle } from "./shared"

/**
 * Settings → Developer.
 *
 * The only thing here is the logging switch. It is intentionally tucked into a
 * Developer section: it is a diagnostic tool, not a feature, but it must be
 * reachable by the person filing the bug report.
 */

interface LoggingConfig {
	enabled: boolean
	level: "off" | "trace" | "debug" | "info" | "warn" | "error"
	consoleEcho: boolean
	maxFileSizeMB: number
}

const LEVEL_OPTIONS = [
	{ value: "error", label: "Error only" },
	{ value: "warn", label: "Warning + errors" },
	{ value: "info", label: "Info (recommended)" },
	{ value: "debug", label: "Debug (verbose)" },
	{ value: "trace", label: "Trace (everything)" },
]

export function DeveloperSection() {
	const [config, setConfig] = useState<LoggingConfig | null>(null)
	const [filePath, setFilePath] = useState("")
	const [fileSize, setFileSize] = useState(0)
	const [busy, setBusy] = useState(false)
	const [note, setNote] = useState<string | null>(null)

	const refresh = useCallback(async () => {
		try {
			const status = (await window.api.invoke({
				type: "getLoggingStatus",
			})) as any
			if (status?.config) setConfig(status.config as LoggingConfig)
			if (status?.filePath) setFilePath(status.filePath as string)
			if (typeof status?.fileSizeBytes === "number")
				setFileSize(status.fileSizeBytes as number)
		} catch {
			// Non-fatal: the section still renders the toggle.
		}
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	const patch = useCallback(
		async (next: Partial<LoggingConfig>) => {
			setBusy(true)
			try {
				const res = (await window.api.invoke({
					type: "setLoggingConfig",
					patch: next,
				})) as any
				if (res?.config) setConfig(res.config as LoggingConfig)
				await refresh()
			} catch (e) {
				setNote(`Failed: ${e instanceof Error ? e.message : String(e)}`)
			} finally {
				setBusy(false)
			}
		},
		[refresh],
	)

	const handleClear = useCallback(async () => {
		setBusy(true)
		try {
			await window.api.invoke({ type: "clearLogs" })
			await refresh()
			setNote("Log file cleared")
		} catch (e) {
			setNote(`Failed: ${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setBusy(false)
			setTimeout(() => setNote(null), 3000)
		}
	}, [refresh])

	const handleReveal = useCallback(async () => {
		try {
			await window.api.invoke({ type: "openLogFolder" })
		} catch {}
	}, [])

	const enabled = config?.enabled ?? false

	return (
		<>
			<SectionHeader title="Developer" />
			<SettingRow
				label="Developer logging"
				description="Record a detailed log of what the app is doing. When enabled, a Logging item appears under Agents in the sidebar so you can watch it live, clear it, or download it for a bug report."
			>
				<Toggle checked={enabled} onChange={(v) => patch({ enabled: v })} />
			</SettingRow>

			<SettingRow
				label="Log level"
				description="Higher levels record more detail. Debug is a good default when reproducing a problem; Trace includes every internal step and gets noisy."
			>
				<div style={{ opacity: enabled ? 1 : 0.5 }}>
					<Select
						value={
							config?.level && config.level !== "off" ? config.level : "info"
						}
						options={LEVEL_OPTIONS}
						onChange={(v) => {
							if (!enabled) return
							patch({ level: v as LoggingConfig["level"] })
						}}
					/>
				</div>
			</SettingRow>

			<SettingRow
				label="Echo to terminal"
				description="Also print captured console output to the terminal. Useful when the app is started from a shell; off by default to keep startup quiet."
			>
				<div style={{ opacity: enabled ? 1 : 0.5 }}>
					<Toggle
						checked={config?.consoleEcho ?? false}
						onChange={(v) => {
							if (!enabled) return
							patch({ consoleEcho: v })
						}}
					/>
				</div>
			</SettingRow>

			<SectionHeader title="Log file" />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					padding: "10px 0",
				}}
			>
				<div
					style={{
						fontSize: 11,
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
						color: "var(--muted)",
						wordBreak: "break-all",
					}}
				>
					{filePath || "—"}
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span style={{ fontSize: 11, color: "var(--dim)" }}>
						{(fileSize / 1024).toFixed(1)} KB
						{note ? ` · ${note}` : ""}
					</span>
					<div style={{ flex: 1 }} />
					<button
						type="button"
						onClick={handleReveal}
						style={{
							fontSize: 11,
							padding: "4px 10px",
							borderRadius: 6,
							border: "1px solid var(--border)",
							background: "var(--bg-elevated)",
							color: "var(--text)",
							cursor: "pointer",
							fontFamily: "inherit",
						}}
					>
						Show in folder
					</button>
					<button
						type="button"
						onClick={handleClear}
						disabled={busy}
						style={{
							fontSize: 11,
							padding: "4px 10px",
							borderRadius: 6,
							border: "1px solid var(--border)",
							background: "transparent",
							color: "var(--muted)",
							cursor: busy ? "not-allowed" : "pointer",
							fontFamily: "inherit",
						}}
					>
						Clear
					</button>
				</div>
				<div style={{ fontSize: 10, color: "var(--dim)", lineHeight: 1.5 }}>
					Logs stay on this machine. They contain prompts, tool calls and error
					stack traces — review the file before sharing it.
				</div>
			</div>
		</>
	)
}
