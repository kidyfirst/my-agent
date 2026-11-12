import { useState } from "react"
import type { ThreadInfo } from "../../types/ipc"
import { ContextMenu } from "../ContextMenu"
import { ConfirmDialog } from "../ConfirmDialog"
import { RowActions, rowMenuAnchor, rowTextFade } from "../RowActions"
import { formatRelativeTime } from "../../utils/relativeTime"
import { ShieldAlertIcon, StopCircleIcon, SpinnerIcon, PencilIcon, TrashIcon } from "../icons"

/** A session awaiting tool approval: amber shield-alert icon matching running icon style & dimensions. */
function SessionApprovalBadge({
	onClick,
}: {
	onClick: (e: React.MouseEvent) => void
}) {
	const [hovered, setHovered] = useState(false)
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title="Waiting for tool approval — click to review"
			aria-label="Waiting for tool approval"
			style={{
				width: 20,
				height: 20,
				borderRadius: 4,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				background: hovered ? "var(--bg-hover)" : "transparent",
				color: "var(--warning)",
				border: "none",
				flexShrink: 0,
				cursor: "pointer",
				padding: 0,
				transition: "background-color 0.15s, color 0.15s",
			}}
		>
			<ShieldAlertIcon size={14} strokeWidth={2} />
		</button>
	)
}

/** Recording a session: red pulsing dot, turns into ■ on hover (stop + export). */
function SessionRecordButton({
	onClick,
}: {
	onClick: (e: React.MouseEvent) => void
}) {
	const [hovered, setHovered] = useState(false)
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title="Click to stop recording & export"
			aria-label="Stop recording and export"
			style={{
				color: "var(--error)",
				background: hovered
					? "color-mix(in srgb, var(--error) 28%, transparent)"
					: "color-mix(in srgb, var(--error) 15%, transparent)",
				padding: "2px 4px",
				borderRadius: 4,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				border: "none",
				cursor: "pointer",
				transition: "background-color 0.15s, opacity 0.15s",
			}}
		>
			{hovered ? (
				<span style={{ fontSize: 9, lineHeight: 1 }}>■</span>
			) : (
				<span
					style={{
						width: 6,
						height: 6,
						borderRadius: "50%",
						background: "var(--error)",
						boxShadow: "0 0 5px var(--error)",
						animation: "sidebar-rec-pulse 1.2s infinite ease-in-out",
					}}
				/>
			)}
		</button>
	)
}

/** Replaying a session: indigo ▶ badge, turns into ■ on hover. */
function SessionReplayButton({
	onClick,
}: {
	onClick: (e: React.MouseEvent) => void
}) {
	const [hovered, setHovered] = useState(false)
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title="Click to stop replay"
			aria-label="Stop replay"
			style={{
				color: "var(--replay)",
				background: hovered
					? "color-mix(in srgb, var(--replay) 28%, transparent)"
					: "color-mix(in srgb, var(--replay) 15%, transparent)",
				padding: "2px 4px",
				borderRadius: 4,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				border: "none",
				cursor: "pointer",
				transition: "background-color 0.15s, opacity 0.15s",
			}}
		>
			{hovered ? (
				<span style={{ fontSize: 9, lineHeight: 1 }}>■</span>
			) : (
				<span style={{ fontSize: 9, lineHeight: 1 }}>▶</span>
			)}
		</button>
	)
}

/** A running session: spinner when idle, stop button while hovered. */
function SessionRunningStopButton({
	onClick,
}: {
	onClick: (e: React.MouseEvent) => void
}) {
	const [hovered, setHovered] = useState(false)
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title="Stop task"
			aria-label="Stop task"
			style={{
				width: 20,
				height: 20,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				borderRadius: 4,
				background: hovered
					? "color-mix(in srgb, var(--error) 12%, transparent)"
					: "var(--bg-hover)",
				border: "none",
				cursor: "pointer",
				flexShrink: 0,
				color: hovered ? "var(--error)" : "var(--text)",
				padding: 0,
				transition: "background-color 0.15s, color 0.15s",
			}}
		>
			<StopCircleIcon size={14} strokeWidth={2} />
		</button>
	)
}

function SessionRunningSpinner() {
	return (
		<div
			title="Running task..."
			aria-label="Running task"
			style={{
				width: 20,
				height: 20,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				color: "var(--muted)",
			}}
		>
			<SpinnerIcon size={14} strokeWidth={2.5} />
		</div>
	)
}

export interface ProjectSessionRowProps {
	thread: ThreadInfo
	/** True for the session currently open in the chat panel. */
	active: boolean
	/** It is this session that currently has a run in flight. */
	running: boolean
	needsApproval?: boolean
	recording: boolean
	replayActive: boolean
	/** Session is a replay (recorded run), live or not. */
	isReplay: boolean
	queuedCount: number
	/**
	 * Whether the row can manage its session (hover ⋯ menu + double-click
	 * rename). False only when nothing can reach the thread — a session of a
	 * project that isn't open and has no cross-project handler behind it. Such a
	 * row stays selectable and keeps its timestamp instead of actions.
	 */
	manageable?: boolean
	onSelect: () => void
	onRename: (title: string) => void
	onDelete: () => void
	onStopReplay?: () => void
	onToggleRecording?: () => void
	onAbort?: () => void
}

/**
 * One session row inside a project group: title, relative time, hover-revealed
 * actions and the live status icons (queued / replay / recording / running).
 */
export function ProjectSessionRow({
	thread,
	active,
	running,
	needsApproval,
	recording,
	replayActive,
	isReplay,
	queuedCount,
	manageable = true,
	onSelect,
	onRename,
	onDelete,
	onStopReplay,
	onToggleRecording,
	onAbort,
}: ProjectSessionRowProps) {
	const [hovered, setHovered] = useState(false)
	const [editing, setEditing] = useState(false)
	const [draftTitle, setDraftTitle] = useState("")
	const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(
		null,
	)
	const [confirmDelete, setConfirmDelete] = useState(false)

	const title = thread.title || "New session"
	const when = formatRelativeTime(thread.updatedAt || thread.createdAt)

	const commit = () => {
		const next = draftTitle.trim()
		if (next && next !== title) onRename(next)
		setEditing(false)
	}

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: "flex",
				alignItems: "center",
				borderLeft: active
					? isReplay
						? "3px solid var(--replay)"
						: "3px solid var(--accent)"
					: isReplay
						? "3px solid color-mix(in srgb, var(--replay) 35%, transparent)"
						: "3px solid transparent",
				background: active
					? "var(--selected-bg)"
					: hovered
						? "var(--bg-hover)"
						: "transparent",
			}}
		>
			{editing ? (
				<div style={{ flex: 1, minWidth: 0, padding: "3px 8px 3px 46px" }}>
					<input
						autoFocus
						onFocus={(e) => e.currentTarget.select()}
						value={draftTitle}
						onChange={(e) => setDraftTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") commit()
							else if (e.key === "Escape") setEditing(false)
						}}
						onBlur={commit}
						onClick={(e) => e.stopPropagation()}
						style={{
							width: "100%",
							fontSize: 11.5,
							color: "var(--text)",
							background: "var(--bg)",
							border: "1px solid var(--accent)",
							borderRadius: 3,
							padding: "2px 6px",
							outline: "none",
							boxSizing: "border-box",
						}}
					/>
				</div>
			) : (
				<button
					type="button"
					onClick={onSelect}
					onDoubleClick={
						manageable
							? (e) => {
									e.stopPropagation()
									setEditing(true)
									setDraftTitle(title)
								}
							: undefined
					}
					title={title}
					style={{
						flex: 1,
						minWidth: 0,
						padding: "6px 0 6px 46px",
						background: "transparent",
						textAlign: "left",
						cursor: "pointer",
						border: "none",
						borderRadius: 0,
						...rowTextFade(hovered),
					}}
				>
					<span
						style={{
							display: "block",
							fontSize: 11.5,
							lineHeight: "16px",
							color: active ? "var(--text)" : "var(--muted)",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{title}
					</span>
				</button>
			)}
			{!editing && !manageable && when && (
				// A session of a closed project: the row is read-only, so it keeps
				// the timestamp but exposes no actions menu.
				<span
					style={{
						fontSize: 10,
						color: "var(--dim)",
						flexShrink: 0,
						paddingRight: 8,
						fontVariantNumeric: "tabular-nums",
					}}
				>
					{when}
				</span>
			)}
			{!editing && manageable && (
				<RowActions
					hovered={hovered}
					menuLabel="Session actions"
					onOpenMenu={(rect) => setMenuAnchor(rowMenuAnchor(rect))}
                >
                    {queuedCount > 0 && (
						<span
							title={`${queuedCount} queued message${queuedCount > 1 ? "s" : ""}`}
							style={{
								fontSize: 9,
								color: "var(--accent)",
								background:
									"color-mix(in srgb, var(--accent) 15%, transparent)",
								padding: "1px 5px",
								borderRadius: 8,
								fontWeight: 600,
								flexShrink: 0,
							}}
						>
							⏳ {queuedCount}
						</span>
					)}
					{needsApproval ? (
						<SessionApprovalBadge
							onClick={(e) => {
								e.stopPropagation()
								onSelect()
							}}
						/>
					) : replayActive || isReplay ? (
						<SessionReplayButton
							onClick={(e) => {
								e.stopPropagation()
								onStopReplay?.()
							}}
						/>
					) : recording ? (
						<SessionRecordButton
							onClick={(e) => {
								e.stopPropagation()
								onToggleRecording?.()
							}}
						/>
					) : running ? (
						hovered ? (
							<SessionRunningStopButton
								onClick={(e) => {
									e.stopPropagation()
									onAbort?.()
								}}
							/>
						) : (
							<SessionRunningSpinner />
						)
                    ) : null}
                </RowActions>
            )}

            {!editing && manageable && when && (
                // Pinned to the row's far right, outside RowActions: the hover
                // actions occupy a fixed slot inside it, which would otherwise
                // push the timestamp between the ⋯ trigger and the status icons.
                <span
                    style={{
                        fontSize: 10,
                        color: "var(--dim)",
                        flexShrink: 0,
                        paddingRight: 8,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {when}
                </span>
            )}

            {menuAnchor && (
				<ContextMenu
					x={menuAnchor.x}
					y={menuAnchor.y}
					onClose={() => setMenuAnchor(null)}
					items={[
						{
							label: "Rename",
							icon: <PencilIcon size={13} strokeWidth={2} />,
							onClick: () => {
								setEditing(true)
								setDraftTitle(title)
							},
						},
						{
							label: "Delete",
							danger: true,
							icon: <TrashIcon size={13} strokeWidth={2} />,
							onClick: () => setConfirmDelete(true),
						},
					]}
				/>
			)}

			{confirmDelete && (
				<ConfirmDialog
					title="Delete session?"
					description={`"${title}" will be permanently deleted.`}
					confirmLabel="Delete"
					onConfirm={() => {
						onDelete()
						setConfirmDelete(false)
					}}
					onCancel={() => setConfirmDelete(false)}
				/>
			)}
		</div>
	)
}
