import { useEffect, useState } from "react"
import { DiffView } from "./DiffView"
import { getFileIcon } from "../utils/fileIcons"

export interface ChangedFile {
	path: string
	added: number
	deleted: number
	status: "added" | "modified" | "deleted"
}

interface FilesChangedBarProps {
	/** Git revision to diff against; null renders nothing. */
	rev: string
}

function dirname(path: string): string {
	const idx = path.lastIndexOf("/")
	return idx < 0 ? "" : path.slice(0, idx)
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1)
}

export function FilesChangedBar({ rev }: FilesChangedBarProps) {
	const [files, setFiles] = useState<ChangedFile[]>([])
	const [expanded, setExpanded] = useState(false)
	const [openFile, setOpenFile] = useState<string | null>(null)
	const [diff, setDiff] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		window.api
			.invoke({ type: "diffSince", rev })
			.then((result: unknown) => {
				if (cancelled) return
				const res = result as { files?: ChangedFile[] }
				setFiles(Array.isArray(res?.files) ? res.files : [])
			})
			.catch(() => {
				if (!cancelled) setFiles([])
			})
		return () => {
			cancelled = true
		}
	}, [rev])

	useEffect(() => {
		if (!openFile) {
			setDiff(null)
			return
		}
		let cancelled = false
		setDiff(null)
		window.api
			.invoke({ type: "diffFileSince", rev, path: openFile })
			.then((result: unknown) => {
				if (cancelled) return
				const res = result as { diff?: string }
				setDiff(res?.diff || "")
			})
			.catch(() => {
				if (!cancelled) setDiff("")
			})
		return () => {
			cancelled = true
		}
	}, [rev, openFile])

	if (!rev || files.length === 0) return null

	const added = files.reduce((n, f) => n + f.added, 0)
	const deleted = files.reduce((n, f) => n + f.deleted, 0)

	return (
		<div
			style={{
				margin: "6px 0 14px 0",
				border: "1px solid var(--border-muted)",
				borderRadius: 8,
				background: "var(--bg-surface)",
				overflow: "hidden",
				fontSize: 12,
				maxWidth: "100%",
			}}
		>
			<div
				onClick={() => setExpanded(!expanded)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 10px",
					cursor: "pointer",
					userSelect: "none",
					color: "var(--muted)",
				}}
				title={expanded ? "Click to collapse" : "Click to expand"}
			>
				<span style={{ color: "var(--text)", fontWeight: 500 }}>
					{files.length} file{files.length === 1 ? "" : "s"} changed
				</span>
				<span style={{ color: "var(--success, #22c55e)" }}>+{added}</span>
				<span style={{ color: "var(--error, #ef4444)" }}>-{deleted}</span>
				<span style={{ color: "var(--dim)", marginLeft: "auto" }}>
					{expanded ? "˅" : "›"}
				</span>
			</div>

			{expanded && (
				<div style={{ borderTop: "1px solid var(--border-muted)" }}>
					{files.map((file) => {
						const isOpen = openFile === file.path
						return (
							<div key={file.path}>
								<div
									onClick={() => setOpenFile(isOpen ? null : file.path)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "4px 10px",
										cursor: "pointer",
										userSelect: "none",
										background: isOpen ? "var(--selected-bg)" : "transparent",
									}}
									title={file.path}
								>
									<span
										style={{
											width: 14,
											flexShrink: 0,
											color: "var(--dim)",
											fontSize: 10,
										}}
									>
										{isOpen ? "▾" : "▸"}
									</span>
									<img
										src={getFileIcon(basename(file.path))}
										alt=""
										style={{ width: 13, height: 13, flexShrink: 0 }}
									/>
									<span style={{ color: "var(--text)" }}>
										{basename(file.path)}
									</span>
									<span
										style={{
											color: "var(--dim)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											minWidth: 0,
										}}
									>
										{dirname(file.path)}
									</span>
									<span
										style={{
											marginLeft: "auto",
											display: "flex",
											gap: 6,
											flexShrink: 0,
										}}
									>
										<span style={{ color: "var(--success, #22c55e)" }}>
											+{file.added}
										</span>
										<span style={{ color: "var(--error, #ef4444)" }}>
											-{file.deleted}
										</span>
									</span>
								</div>
								{isOpen && (
									<div
										style={{
											maxHeight: 360,
											overflow: "auto",
											borderTop: "1px solid var(--border-muted)",
										}}
									>
										{diff === null ? (
											<div
												style={{
													padding: "8px 10px",
													color: "var(--dim)",
												}}
											>
												Loading diff...
											</div>
										) : diff ? (
											<DiffView diff={diff} fileName={file.path} />
										) : (
											<div
												style={{
													padding: "8px 10px",
													color: "var(--dim)",
												}}
											>
												No diff available
											</div>
										)}
									</div>
								)}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
