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
		<div
			style={{
				margin: "10px 0 6px 0",
				background: "var(--bg-surface)",
				border: "1px solid var(--border-muted)",
				borderRadius: 8,
				padding: "7px 12px",
				fontSize: 12,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
				}}
			>
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: 0,
						background: "none",
						border: "none",
						cursor: "pointer",
						fontSize: 12,
						fontFamily: "inherit",
						color: "var(--text)",
						lineHeight: 1.4,
						userSelect: "none",
					}}
				>
					<span style={{ fontWeight: 500 }}>
						{files.length} file{files.length === 1 ? "" : "s"} changed
					</span>
					<span style={{ color: "var(--success, #22c55e)", fontWeight: 500 }}>
						+{added}
					</span>
					<span style={{ color: "var(--error, #ef4444)", fontWeight: 500 }}>
						-{deleted}
					</span>
					<Chevron open={expanded} size={10} />
				</button>

				{onOpenDiff && (
					<button
						type="button"
						onClick={() => onOpenDiff(files[0]?.path || "")}
						title="Review all changes"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 5,
							padding: "3px 9px",
							fontSize: 11,
							fontWeight: 500,
							fontFamily: "inherit",
							color: "var(--text)",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							cursor: "pointer",
							flexShrink: 0,
							transition: "background 0.15s, border-color 0.15s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--bg-hover)"
							e.currentTarget.style.borderColor = "var(--border)"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--bg-elevated)"
							e.currentTarget.style.borderColor = "var(--border-muted)"
						}}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ opacity: 0.8 }}
						>
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
							<line x1="12" y1="18" x2="12" y2="12" />
							<line x1="9" y1="15" x2="15" y2="15" />
						</svg>
						Review
					</button>
				)}
			</div>

			{expanded && (
				<div
					style={{
						marginTop: 8,
						paddingTop: 8,
						borderTop: "1px solid var(--border-muted)",
					}}
				>
					{files.map((file) => {
						const isOpen = openFile === file.path
						return (
							<div key={file.path}>
								<div
									onClick={() => setOpenFile(isOpen ? null : file.path)}
									title={file.path}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 6,
										padding: "4px 6px",
										borderRadius: 4,
										cursor: "pointer",
										userSelect: "none",
										transition: "background 0.1s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "var(--bg-hover)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent"
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											minWidth: 0,
										}}
									>
										<span
											style={{
												color: "var(--text)",
												fontWeight: 500,
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
													fontSize: 11,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{dirname(file.path)}
											</span>
										)}
									</div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											flexShrink: 0,
											fontSize: 11,
										}}
									>
										<span style={{ color: "var(--success, #22c55e)" }}>
											+{file.added}
										</span>
										<span style={{ color: "var(--error, #ef4444)" }}>
											-{file.deleted}
										</span>
										{onOpenDiff && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation()
													onOpenDiff(file.path)
												}}
												title="Open in diff editor"
												style={{
													background: "none",
													border: "none",
													cursor: "pointer",
													color: "var(--dim)",
													padding: "1px 4px",
													fontSize: 11,
													display: "inline-flex",
													alignItems: "center",
												}}
											>
												↗
											</button>
										)}
									</div>
								</div>
								{isOpen && (
									<div
										style={{
											maxHeight: 360,
											overflow: "auto",
											border: "1px solid var(--border-muted)",
											borderRadius: 6,
											margin: "6px 0",
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
