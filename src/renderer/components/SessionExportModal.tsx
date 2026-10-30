import { useState, useCallback } from "react"

export interface SessionExportData {
	threadId?: string
	filePath: string
	eventCount: number
	size: number
}

interface SessionExportModalProps {
	data: SessionExportData
	onClose: () => void
	onExported?: (savedPath: string) => void
	onError?: (err: string) => void
}

export function SessionExportModal({
	data,
	onClose,
	onExported,
	onError,
}: SessionExportModalProps) {
	const [exporting, setExporting] = useState<"json" | "jsonl" | null>(null)

	const handleExport = useCallback(
		async (format: "json" | "jsonl") => {
			setExporting(format)
			try {
				const res = (await window.api.invoke({
					type: "exportSessionRecording",
					threadId: data.threadId,
					filePath: data.filePath,
					format,
				})) as any

				if (res?.success && res.filePath) {
					onExported?.(res.filePath)
					onClose()
				} else if (res?.error) {
					onError?.(res.error)
				}
			} catch (err: any) {
				onError?.(err?.message || "Export failed")
			} finally {
				setExporting(null)
			}
		},
		[data.threadId, data.filePath, onClose, onExported, onError],
	)

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 10000,
				background: "var(--scrim)",
				backdropFilter: "blur(4px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 20,
			}}
			onClick={onClose}
		>
			<div
				style={{
					background: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 440,
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						padding: "16px 20px 14px",
						borderBottom: "1px solid var(--border)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: "50%",
								background: "var(--error)",
							}}
						/>
						<h3
							style={{
								margin: 0,
								fontSize: 15,
								fontWeight: 600,
								color: "var(--text)",
							}}
						>
							Export Session Recording
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							color: "var(--muted)",
							cursor: "pointer",
							padding: 4,
							fontSize: 16,
							lineHeight: 1,
							borderRadius: 4,
						}}
					>
						✕
					</button>
				</div>

				{/* Content */}
				<div style={{ padding: "18px 20px" }}>
					<p
						style={{
							margin: "0 0 16px",
							fontSize: 12,
							color: "var(--dim)",
							lineHeight: 1.5,
						}}
					>
						Session recording captured successfully. Choose a format to export
						and save the data.
					</p>

					<div
						style={{
							background: "var(--bg-elevated)",
							borderRadius: 8,
							padding: "10px 14px",
							marginBottom: 16,
							display: "flex",
							justifyContent: "space-between",
							fontSize: 12,
							border: "1px solid var(--border)",
						}}
					>
						<span style={{ color: "var(--muted)" }}>Captured Events:</span>
						<span style={{ fontWeight: 600, color: "var(--text)" }}>
							{data.eventCount} events ({formatSize(data.size)})
						</span>
					</div>

					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{/* JSON button */}
						<button
							type="button"
							disabled={Boolean(exporting)}
							onClick={() => handleExport("json")}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "12px 14px",
								background: "var(--bg-surface)",
								border: "1px solid var(--border)",
								borderRadius: 8,
								cursor: exporting ? "not-allowed" : "pointer",
								textAlign: "left",
								transition: "all 0.15s ease",
							}}
							onMouseEnter={(e) => {
								if (!exporting) {
									e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									e.currentTarget.style.borderColor = "var(--accent)"
								}
							}}
							onMouseLeave={(e) => {
								if (!exporting) {
									e.currentTarget.style.backgroundColor = "var(--bg-surface)"
									e.currentTarget.style.borderColor = "var(--border)"
								}
							}}
						>
							<div>
								<div
									style={{
										fontSize: 13,
										fontWeight: 600,
										color: "var(--text)",
										marginBottom: 2,
									}}
								>
									📄 Export as JSON (.json)
								</div>
								<div style={{ fontSize: 11, color: "var(--muted)" }}>
									Formatted, structured JSON array. Best for bug reports and
									inspection.
								</div>
							</div>
							{exporting === "json" ? (
								<span style={{ fontSize: 12, color: "var(--accent)" }}>
									Saving…
								</span>
							) : (
								<span style={{ fontSize: 14, color: "var(--dim)" }}>→</span>
							)}
						</button>

						{/* JSONL button */}
						<button
							type="button"
							disabled={Boolean(exporting)}
							onClick={() => handleExport("jsonl")}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "12px 14px",
								background: "var(--bg-surface)",
								border: "1px solid var(--border)",
								borderRadius: 8,
								cursor: exporting ? "not-allowed" : "pointer",
								textAlign: "left",
								transition: "all 0.15s ease",
							}}
							onMouseEnter={(e) => {
								if (!exporting) {
									e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									e.currentTarget.style.borderColor = "var(--accent)"
								}
							}}
							onMouseLeave={(e) => {
								if (!exporting) {
									e.currentTarget.style.backgroundColor = "var(--bg-surface)"
									e.currentTarget.style.borderColor = "var(--border)"
								}
							}}
						>
							<div>
								<div
									style={{
										fontSize: 13,
										fontWeight: 600,
										color: "var(--text)",
										marginBottom: 2,
									}}
								>
									📝 Export as JSON Lines (.jsonl)
								</div>
								<div style={{ fontSize: 11, color: "var(--muted)" }}>
									Raw line-delimited events stream. Best for offline replay and
									pipelines.
								</div>
							</div>
							{exporting === "jsonl" ? (
								<span style={{ fontSize: 12, color: "var(--accent)" }}>
									Saving…
								</span>
							) : (
								<span style={{ fontSize: 14, color: "var(--dim)" }}>→</span>
							)}
						</button>
					</div>
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "12px 20px",
						background: "var(--bg-elevated)",
						borderTop: "1px solid var(--border)",
						display: "flex",
						justifyContent: "flex-end",
					}}
				>
					<button
						type="button"
						onClick={onClose}
						style={{
							background: "none",
							border: "1px solid var(--border)",
							borderRadius: 6,
							padding: "6px 14px",
							fontSize: 12,
							color: "var(--text)",
							cursor: "pointer",
						}}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
