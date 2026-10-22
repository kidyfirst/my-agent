import { useEffect, useState } from "react"
import { DiffView } from "./DiffView"

function FileDiff({ path, isLive }: { path: string; isLive: boolean }) {
	const [diff, setDiff] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		setDiff(null)
		window.api
			.invoke({ type: "getTaskFileDiff", path })
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
	}, [path, isLive])

	if (diff === null) {
		return (
			<div style={{ padding: "8px 10px", color: "var(--dim)" }}>
				Loading diff...
			</div>
		)
	}
	if (!diff) {
		return (
			<div style={{ padding: "8px 10px", color: "var(--dim)" }}>
				No diff available
			</div>
		)
	}
	return <DiffView diff={diff} fileName={path} />
}

export interface ChangedFile {
	path: string
	added: number
	deleted: number
	status: "added" | "modified" | "deleted"
}

interface FilesChangedBarProps {
	files: ChangedFile[]
	/** True while the task is still running, so the diff can keep changing. */
	isLive: boolean
	/** Open the file's full diff (e.g. as a tab) instead of expanding inline. */
	onOpenDiff?: (path: string) => void
}

function dirname(path: string): string {
	const idx = path.lastIndexOf("/")
	return idx < 0 ? "" : path.slice(0, idx)
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1)
}

function Chevron({ open, size }: { open: boolean; size: number }) {
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				flexShrink: 0,
				color: "var(--dim)",
			}}
		>
			<svg
				width={size}
				height={size}
				viewBox="0 0 10 10"
				fill="none"
				style={{
					transform: open ? "rotate(90deg)" : "none",
					transition: "transform 0.15s ease",
				}}
			>
				<path
					d="M3.5 2L6.5 5L3.5 8"
					stroke="currentColor"
					strokeWidth="1.3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	)
}

export function FilesChangedBar({
	files,
	isLive,
	onOpenDiff,
}: FilesChangedBarProps) {
	const [expanded, setExpanded] = useState(false)
	const [openFile, setOpenFile] = useState<string | null>(null)

	if (files.length === 0) return null

	const added = files.reduce((n, f) => n + f.added, 0)
	const deleted = files.reduce((n, f) => n + f.deleted, 0)

	return (
		<div style={{ margin: "4px 0 12px 0", fontSize: 12 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
				<button
					onClick={() => setExpanded(!expanded)}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						padding: 0,
						background: "none",
						border: "none",
						cursor: "pointer",
						fontSize: 12,
						fontFamily: "inherit",
						color: "var(--muted)",
						lineHeight: 1.4,
					}}
				>
					<span style={{ color: "var(--text)" }}>
						{files.length} file{files.length === 1 ? "" : "s"} changed
					</span>
					<span style={{ color: "var(--success, #22c55e)" }}>+{added}</span>
					<span style={{ color: "var(--error, #ef4444)" }}>-{deleted}</span>
					<Chevron open={expanded} size={10} />
				</button>
				{onOpenDiff && (
					<button
						onClick={() => onOpenDiff(files[0].path)}
						title="Review all changes"
						style={{
							marginLeft: "auto",
							padding: "1px 8px",
							fontSize: 11,
							fontFamily: "inherit",
							color: "var(--error, #ef4444)",
							background: "transparent",
							border: "1px solid var(--error, #ef4444)",
							borderRadius: 5,
							cursor: "pointer",
							flexShrink: 0,
						}}
					>
						Review
					</button>
				)}
			</div>

			{expanded && (
				<div style={{ marginTop: 6 }}>
					{files.map((file) => {
						const isOpen = openFile === file.path
						return (
							<div key={file.path}>
								<div
									onClick={() => setOpenFile(isOpen ? null : file.path)}
									title={file.path}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										padding: "3px 0",
										cursor: "pointer",
										userSelect: "none",
										maxWidth: "100%",
									}}
								>
									<span
										style={{
											color: "var(--text)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{basename(file.path)}
									</span>
									{dirname(file.path) && (
										<span
											style={{
												color: "var(--dim)",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{dirname(file.path)}
										</span>
									)}
									<span style={{ color: "var(--success, #22c55e)" }}>
										+{file.added}
									</span>
									<span style={{ color: "var(--error, #ef4444)" }}>
										-{file.deleted}
									</span>
								</div>
								{isOpen && (
									<div
										style={{
											maxHeight: 360,
											overflow: "auto",
											border: "1px solid var(--border-muted)",
											borderRadius: 6,
											marginBottom: 6,
										}}
									>
										<FileDiff path={file.path} isLive={isLive} />
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
