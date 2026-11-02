import { useState, useEffect, useCallback, useRef } from "react"
import {
	hasRecordingExtension,
	resolveDroppedFilePath,
} from "../utils/droppedFile"

interface SessionReplayModalProps {
	currentThreadId?: string | null
	onClose: () => void
	onStartReplay: (filePath: string) => void
	onError?: (msg: string) => void
}

interface RecordingItem {
	filePath: string
	threadId: string
	runId: string
	size: number
	mtime: number
}

export function SessionReplayModal({
	currentThreadId,
	onClose,
	onStartReplay,
	onError,
}: SessionReplayModalProps) {
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
	const [recentRecordings, setRecentRecordings] = useState<RecordingItem[]>([])
	const [loading, setLoading] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	// dragenter/dragleave fire for every child element, so track nesting depth
	// instead of toggling the highlight on each event (it used to flicker).
	const dragDepth = useRef(0)

	// Dropping a file anywhere outside a handled drop target makes Electron navigate the
	// window to the file:// URL. While this modal is open, swallow those defaults.
	useEffect(() => {
		const swallow = (e: DragEvent) => {
			e.preventDefault()
		}
		window.addEventListener("dragover", swallow)
		window.addEventListener("drop", swallow)
		return () => {
			window.removeEventListener("dragover", swallow)
			window.removeEventListener("drop", swallow)
		}
	}, [])

	// Load recent recordings from sessions directory
	useEffect(() => {
		let isMounted = true
		async function fetchRecs() {
			try {
				const recs = (await window.api.invoke({
					type: "listSessionRecordings",
					threadId: currentThreadId || undefined,
				})) as RecordingItem[]
				if (isMounted && Array.isArray(recs)) {
					setRecentRecordings(recs.slice(0, 5))
				}
			} catch (e) {
				console.error("Failed to list recordings:", e)
			}
		}
		fetchRecs()
		return () => {
			isMounted = false
		}
	}, [currentThreadId])

	// Electron native file chooser
	const handleSelectFile = useCallback(async () => {
		try {
			const res = (await window.api.invoke({
				type: "selectRecordingFile",
			})) as any
			if (!res?.canceled && res?.filePath) {
				setSelectedPath(res.filePath)
				setSelectedFileName(res.fileName || res.filePath.split(/[\\/]/).pop())
			}
		} catch (err: any) {
			onError?.(err?.message || "File selection failed")
		}
	}, [onError])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			dragDepth.current = 0
			setIsDragging(false)

			const dataTransfer = e.dataTransfer
			const files = Array.from(dataTransfer?.files || [])
			if (files.length === 0) {
				onError?.(
					"That drop didn't include a file. Drag a .json / .jsonl recording over this box.",
				)
				return
			}

			const file = files[0]
			const filePath = resolveDroppedFilePath(file, dataTransfer)
			if (!filePath) {
				onError?.(
					`Couldn't read the path of "${file.name}". Use browse to pick the file instead.`,
				)
				return
			}

			if (
				!hasRecordingExtension(filePath) &&
				!hasRecordingExtension(file.name)
			) {
				onError?.("Please select a .json or .jsonl session recording file.")
				return
			}

			setSelectedPath(filePath)
			setSelectedFileName(
				file.name || filePath.split(/[\\/]/).pop() || filePath,
			)
		},
		[onError],
	)

	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		if (!e.dataTransfer?.types?.includes("Files")) return
		dragDepth.current += 1
		setIsDragging(true)
	}, [])

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			// Required so the cursor shows "copy" instead of the browser's "no-drop".
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
			if (e.dataTransfer?.types?.includes("Files") && !isDragging)
				setIsDragging(true)
		},
		[isDragging],
	)

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		dragDepth.current = Math.max(0, dragDepth.current - 1)
		if (dragDepth.current === 0) setIsDragging(false)
	}, [])

	const handleConfirmReplay = useCallback(() => {
		if (!selectedPath) return
		setLoading(true)
		try {
			onStartReplay(selectedPath)
			onClose()
		} catch (err: any) {
			onError?.(err?.message || "Failed to start replay")
		} finally {
			setLoading(false)
		}
	}, [selectedPath, onStartReplay, onClose, onError])

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	const formatDate = (ms: number) => {
		return new Date(ms).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		})
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
					maxWidth: 480,
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
								background: "var(--replay)",
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
							Upload & Replay Recording
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
							margin: "0 0 14px",
							fontSize: 12,
							color: "var(--dim)",
							lineHeight: 1.5,
						}}
					>
						Select or upload a previously recorded session file (.json or
						.jsonl) to replay its execution offline with zero API calls.
					</p>

					{/* File drop zone / picker */}
					<div
						onDragEnter={handleDragEnter}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						onClick={handleSelectFile}
						style={{
							border: `2px dashed ${
								isDragging
									? "var(--accent)"
									: selectedPath
										? "var(--replay)"
										: "var(--border)"
							}`,
							background: isDragging
								? "color-mix(in srgb, var(--replay) 8%, transparent)"
								: selectedPath
									? "color-mix(in srgb, var(--replay) 5%, transparent)"
									: "var(--bg-elevated)",
							borderRadius: 10,
							padding: "24px 16px",
							textAlign: "center",
							cursor: "pointer",
							transition: "all 0.15s ease",
							marginBottom: 16,
						}}
					>
						{selectedPath ? (
							<div>
								<div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
								<div
									style={{
										fontSize: 13,
										fontWeight: 600,
										color: "var(--text)",
										wordBreak: "break-all",
									}}
								>
									{selectedFileName}
								</div>
								<div
									style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}
								>
									Click or drop another file to change
								</div>
							</div>
						) : (
							<div>
								<div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
								<div
									style={{
										fontSize: 13,
										fontWeight: 500,
										color: "var(--text)",
									}}
								>
									Drop recording file here, or{" "}
									<span style={{ color: "var(--replay)", fontWeight: 600 }}>
										browse
									</span>
								</div>
								<div
									style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}
								>
									Supports .json and .jsonl files
								</div>
							</div>
						)}
					</div>

					{/* Recent recordings list */}
					{recentRecordings.length > 0 && (
						<div>
							<div
								style={{
									fontSize: 11,
									fontWeight: 600,
									color: "var(--muted)",
									marginBottom: 8,
									textTransform: "uppercase",
									letterSpacing: "0.5px",
								}}
							>
								Recent Session Recordings
							</div>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 6,
									maxHeight: 140,
									overflowY: "auto",
								}}
							>
								{recentRecordings.map((rec) => {
									const isSelected = selectedPath === rec.filePath
									return (
										<div
											key={rec.filePath}
											onClick={() => {
												setSelectedPath(rec.filePath)
												setSelectedFileName(
													rec.filePath.split(/[\\/]/).pop() || "",
												)
											}}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												padding: "6px 10px",
												borderRadius: 6,
												fontSize: 12,
												background: isSelected
													? "color-mix(in srgb, var(--replay) 15%, transparent)"
													: "var(--bg-surface)",
												border: `1px solid ${
													isSelected ? "var(--replay)" : "var(--border-muted)"
												}`,
												cursor: "pointer",
											}}
										>
											<div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
												<div
													style={{
														fontSize: 11,
														fontWeight: 500,
														color: "var(--text)",
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
													}}
												>
													{rec.runId}.jsonl
												</div>
												<div style={{ fontSize: 10, color: "var(--muted)" }}>
													{formatDate(rec.mtime)}
												</div>
											</div>
											<span style={{ fontSize: 10, color: "var(--dim)" }}>
												{formatSize(rec.size)}
											</span>
										</div>
									)
								})}
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "12px 20px",
						background: "var(--bg-elevated)",
						borderTop: "1px solid var(--border)",
						display: "flex",
						justifyContent: "flex-end",
						gap: 10,
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
						Cancel
					</button>
					<button
						type="button"
						disabled={!selectedPath || loading}
						onClick={handleConfirmReplay}
						style={{
							background: "var(--replay)",
							border: "none",
							borderRadius: 6,
							padding: "6px 16px",
							fontSize: 12,
							fontWeight: 600,
							color: "var(--on-accent)",
							cursor: selectedPath && !loading ? "pointer" : "not-allowed",
							opacity: selectedPath && !loading ? 1 : 0.5,
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						<span>▶</span>
						{loading ? "Starting…" : "Start Replay"}
					</button>
				</div>
			</div>
		</div>
	)
}
