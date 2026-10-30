import { useCallback, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ProjectList } from "./ProjectList"
import { GlobalSearchModal } from "./GlobalSearchModal"
import { WindowToggleIcon } from "./WindowToggleIcon"
import { LogIcon } from "./LogIcon"
import { CommunityBanner } from "./sidebar/CommunityBanner"
import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_RESIZE_HANDLE_WIDTH,
	clampSidebarWidth,
	shouldCollapseSidebar,
} from "../utils/sidebarResize"
import type { EnrichedProject } from "../types/project-list"
import type { ThreadInfo, UpdateInfo } from "../types/ipc"
import type { WorktreeStatus } from "../types/project"
import type { QueuedMessage } from "../types/chat"

interface SidebarProps {
	threads: ThreadInfo[]
	/** Sessions per folder (project root or worktree path) for expanded groups. */
	threadsByPath?: Record<string, ThreadInfo[]>
	/** Folder path `threads` was listed for, so it renders under that folder only. */
	threadsPath?: string | null
	currentThreadId: string | null
	runningThreadId?: string | null
	queuesByThread?: Record<string, QueuedMessage[]>
	loggedInProviders: Set<string>
	projectName: string
	sidebarVisible: boolean
	/** Current sidebar width; owned by App so it survives panel toggles. */
	width?: number
	onWidthChange?: (width: number) => void
	/** Called on release when the drag ended below the usable width. */
	onCollapse?: () => void
	enrichedProjects: EnrichedProject[]
	activeProjectPath: string | null
	isAgentActive: boolean
	onAbort?: () => void
	activeWorktrees: Set<string>
	unreadWorktrees: Set<string>
	worktreeStatuses: Map<string, WorktreeStatus>
	recordingThreads?: Set<string>
	recordingProjects?: Set<string>
	replayingThreads?: Set<string>
	replayingProjects?: Set<string>
	onToggleRecording?: (threadId?: string, projectPath?: string) => void
	onStopReplay?: (threadId?: string, projectPath?: string) => void
	linkedIssues?: Record<
		string,
		{ issueId: string; issueIdentifier: string; provider?: string }
	>
	onSwitchThread: (threadId: string) => void
	/** Open a session that may live in another project (switch project first). */
	onOpenSession?: (projectPath: string, threadId: string) => void
	/**
	 * Rename or delete a session of a project that isn't open. Those threads are
	 * not reachable through the active harness, so the main process writes them
	 * directly.
	 */
	onMutateForeignThread?: (
		projectPath: string,
		threadId: string,
		action: "rename" | "delete",
		title?: string,
	) => void
	onNewThread: (projectPath?: string) => void
	onDeleteThread: (threadId: string) => void
	onRenameThread: (threadId: string, title: string) => void
	onLogin: (providerId: string) => void
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
	onCloneRepo: () => void
	onRemoveProject: (path: string, deleteHistory?: boolean) => void
	onRenameProject: (projectPath: string, newName: string) => void
	/** Rename a worktree's branch — the sidebar labels the row by it. */
	onRenameWorktree?: (worktreePath: string, newName: string) => void
	onCreateWorktree: (repoPath: string) => void
	onDeleteWorktree: (worktreePath: string) => void
	onOpenSettings: () => void
	onOpenAgents: () => void
	onOpenAccounts: () => void
	/** Developer logging: the sidebar entry only exists while it is enabled. */
	loggingEnabled?: boolean
	isLoggingActive?: boolean
	onOpenLogging?: () => void
	isSettingsActive: boolean
	isAgentsActive: boolean
	activeAgentCount: number
	onToggleSidebar?: () => void
	updateInfo?: UpdateInfo | null
	downloadProgress?: {
		percent: number
		downloadedBytes: number
		totalBytes: number
	} | null
	onDownloadUpdate?: () => void
}

const providers = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai-codex", label: "OpenAI" },
	{ id: "google", label: "Google" },
	{ id: "deepseek", label: "DeepSeek" },
]

function SearchIcon({ size = 14 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="7" />
			<line x1="16.5" y1="16.5" x2="21" y2="21" />
		</svg>
	)
}

export function Sidebar({
	threads,
	threadsByPath,
	threadsPath,
	currentThreadId,
	runningThreadId,
	queuesByThread,
	loggedInProviders,
	projectName,
	sidebarVisible,
	width = SIDEBAR_DEFAULT_WIDTH,
	onWidthChange,
	onCollapse,
	enrichedProjects,
	activeProjectPath,
	isAgentActive,
	onAbort,
	activeWorktrees,
	unreadWorktrees,
	worktreeStatuses,
	recordingThreads,
	recordingProjects,
	replayingThreads,
	replayingProjects,
	onToggleRecording,
	onStopReplay,
	linkedIssues,
	onSwitchThread,
	onOpenSession,
	onMutateForeignThread,
	onNewThread,
	onDeleteThread,
	onRenameThread,
	onLogin,
	onSwitchProject,
	onOpenFolder,
	onCloneRepo,
	onRemoveProject,
	onRenameProject,
	onRenameWorktree,
	onCreateWorktree,
	onDeleteWorktree,
	onOpenSettings,
	onOpenAgents,
	onOpenAccounts,
	loggingEnabled,
	isLoggingActive,
	onOpenLogging,
	isSettingsActive,
	isAgentsActive,
	activeAgentCount,
	onToggleSidebar,
	updateInfo,
	downloadProgress,
	onDownloadUpdate,
}: SidebarProps) {
	const [searchModalOpen, setSearchModalOpen] = useState(false)

	// Width reached by the current drag, so mouse-up can decide whether the
	// sidebar should collapse without waiting for another render.
	const dragWidthRef = useRef(width)

	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!onWidthChange) return
			e.preventDefault()
			e.stopPropagation()

			const startX = e.clientX
			const startWidth = width
			dragWidthRef.current = width

			const onMouseMove = (ev: MouseEvent) => {
				const next = clampSidebarWidth(startWidth + (ev.clientX - startX))
				dragWidthRef.current = next
				onWidthChange(next)
			}

			const onMouseUp = () => {
				document.removeEventListener("mousemove", onMouseMove)
				document.removeEventListener("mouseup", onMouseUp)
				document.body.style.cursor = ""
				document.body.style.userSelect = ""
				// Dragging narrower than the usable width closes the sidebar on
				// release, mirroring how the grid splitter behaves elsewhere.
				if (shouldCollapseSidebar(dragWidthRef.current)) onCollapse?.()
			}

			document.addEventListener("mousemove", onMouseMove)
			document.addEventListener("mouseup", onMouseUp)
			document.body.style.cursor = "col-resize"
			document.body.style.userSelect = "none"
		},
		[width, onWidthChange, onCollapse],
	)

	const isCollapsing = width < SIDEBAR_COLLAPSE_THRESHOLD

	return (
		<div
			style={{
				// border-box so the 4px drag strip stays inside `width`.
				boxSizing: "border-box",
				width,
				marginLeft: sidebarVisible ? 0 : -width,
				// Reserve the drag strip so it never sits on top of row content.
				paddingRight: SIDEBAR_RESIZE_HANDLE_WIDTH,
				// The strip itself is the divider, exactly like the right panel —
				// no extra 1px border, so both splitters read as the same line.
				display: "flex",
				flexDirection: "column",
				position: "relative",
				background: "var(--bg-surface)",
				flexShrink: 0,
				overflow: "hidden",
				// Fade while dragged into the closing range: releasing right now
				// hides the panel.
				opacity: isCollapsing ? 0.55 : 1,
				transition: "margin-left 0.22s ease, opacity 0.15s ease",
			}}
		>
			{/* Drag region (traffic lights + toggle button + search) */}
			<div
				className="titlebar-drag"
				style={{
					height: 38,
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
					position: "relative",
					display: "flex",
					alignItems: "center",
				}}
			>
				{sidebarVisible && onToggleSidebar && (
					<button
						type="button"
						className="titlebar-no-drag"
						onClick={onToggleSidebar}
						title="Toggle Sidebar (Cmd+B)"
						style={{
							position: "absolute",
							top: 5,
							left: 78,
							height: 28,
							width: 28,
							borderRadius: 6,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--text)",
							background: "none",
							border: "none",
							cursor: "pointer",
							transition: "background-color 0.15s, opacity 0.15s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = "var(--bg-hover)"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = "transparent"
						}}
					>
						<WindowToggleIcon side="left" open={true} />
					</button>
				)}

				{/* Search — top right of the panel */}
				<div
					className="titlebar-no-drag"
					style={{
						position: "absolute",
						right: 8,
						top: 5,
						height: 28,
						display: "flex",
						alignItems: "center",
					}}
				>
					<button
						type="button"
						onClick={() => setSearchModalOpen(true)}
						title="Search projects and sessions"
						aria-label="Search projects and sessions"
						style={{
							width: 26,
							height: 26,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							padding: 0,
							borderRadius: 4,
							background: "transparent",
							color: "var(--muted)",
							cursor: "pointer",
							transition: "background-color 0.15s, color 0.15s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							e.currentTarget.style.color = "var(--text)"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = "transparent"
							e.currentTarget.style.color = "var(--muted)"
						}}
					>
						<SearchIcon />
					</button>
				</div>
			</div>

			<div
				style={{
					// Follow the panel width — a fixed 260 kept the header actions,
					// rows and the footer pinned to the old size while dragging.
					width: "100%",
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
				}}
			>
				{/* Community banner — star / tip / share, above the nav rows */}
				<CommunityBanner sidebarWidth={width} />

				{/* Agents — agent dashboard navigation */}
				<button
					onClick={onOpenAgents}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						width: "100%",
						padding: "10px 14px",
						background: isAgentsActive ? "var(--selected-bg)" : "transparent",
						borderLeft: isAgentsActive
							? "3px solid var(--accent)"
							: "3px solid transparent",
						borderTop: "none",
						borderRight: "none",
						borderBottom: "1px solid var(--border-muted)",
						cursor: "pointer",
						flexShrink: 0,
						textAlign: "left" as const,
					}}
					onMouseEnter={(e) => {
						if (!isAgentsActive)
							e.currentTarget.style.background = "var(--bg-hover)"
					}}
					onMouseLeave={(e) => {
						if (!isAgentsActive)
							e.currentTarget.style.background = "transparent"
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<rect
							width="13.5"
							height="12.5"
							x="5.25"
							y="7.75"
							strokeWidth="1.5"
							rx="2.5"
						/>
						<path strokeWidth="1.5" d="M12 7.75V4" />
						<path strokeWidth="2" d="M12 3.25h.01" />
						<path strokeWidth="1.5" d="M2.75 12.5V16m18.5-3.5V16" />
						<path strokeWidth="2" d="M9.25 12.75h.01m5.49 0h.01" />
						<path strokeWidth="1.5" d="M9.75 16.5h4.5" />
					</svg>
					<span
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: isAgentsActive ? "var(--text)" : "var(--muted)",
						}}
					>
						Agents
					</span>
					{activeAgentCount > 0 && (
						<span
							style={{
								marginLeft: "auto",
								fontSize: 9,
								fontWeight: 600,
								color: "var(--warning)",
								background:
									"color-mix(in srgb, var(--warning) 10%, transparent)",
								padding: "1px 6px",
								borderRadius: 3,
								minWidth: 16,
								textAlign: "center" as const,
							}}
						>
							{activeAgentCount}
						</span>
					)}
				</button>

				{/* Logging — developer tool, only present while logging is enabled */}
				{loggingEnabled && (
					<button
						type="button"
						onClick={onOpenLogging}
						title="View live application logs"
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							width: "100%",
							// Same left inset as the Agents row above so both icons sit on
							// one vertical column instead of the old extra 16px indent.
							padding: "10px 14px",
							background: isLoggingActive
								? "var(--selected-bg)"
								: "transparent",
							borderLeft: isLoggingActive
								? "3px solid var(--accent)"
								: "3px solid transparent",
							borderTop: "none",
							borderRight: "none",
							borderBottom: "1px solid var(--border-muted)",
							cursor: "pointer",
							flexShrink: 0,
							textAlign: "left" as const,
						}}
						onMouseEnter={(e) => {
							if (!isLoggingActive)
								e.currentTarget.style.background = "var(--bg-hover)"
						}}
						onMouseLeave={(e) => {
							if (!isLoggingActive)
								e.currentTarget.style.background = "transparent"
						}}
					>
						<LogIcon />
						<span
							style={{
								fontSize: 13,
								fontWeight: 600,
								color: isLoggingActive ? "var(--text)" : "var(--muted)",
							}}
						>
							Logging
						</span>
						<span
							title="Logging is on"
							style={{
								marginLeft: "auto",
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: "var(--success)",
								boxShadow:
									"0 0 6px color-mix(in srgb, var(--success) 70%, transparent)",
								flexShrink: 0,
							}}
						/>
					</button>
				)}

				<div
					style={{
						flex: 1,
						overflowY: "auto",
					}}
				>
					<ProjectList
						projects={enrichedProjects}
						activeProjectPath={activeProjectPath}
						isAgentActive={isAgentActive}
						activeWorktrees={activeWorktrees}
						unreadWorktrees={unreadWorktrees}
						worktreeStatuses={worktreeStatuses}
						recordingProjects={recordingProjects}
						recordingThreads={recordingThreads}
						replayingProjects={replayingProjects}
						replayingThreads={replayingThreads}
						onToggleRecording={onToggleRecording}
						onStopReplay={onStopReplay}
						linkedIssues={linkedIssues}
						threads={threads}
						threadsByPath={threadsByPath}
						threadsPath={threadsPath}
						currentThreadId={currentThreadId}
						runningThreadId={runningThreadId}
						queuesByThread={queuesByThread}
						onSwitchProject={onSwitchProject}
						onOpenSession={onOpenSession}
						onMutateForeignThread={onMutateForeignThread}
						onOpenFolder={onOpenFolder}
						onCloneRepo={onCloneRepo}
						onRemoveProject={onRemoveProject}
						onCreateWorktree={onCreateWorktree}
						onDeleteWorktree={onDeleteWorktree}
						onRenameProject={onRenameProject}
						onRenameWorktree={onRenameWorktree}
						onSwitchThread={onSwitchThread}
						onNewThread={onNewThread}
						onDeleteThread={onDeleteThread}
						onRenameThread={onRenameThread}
						onAbort={onAbort}
					/>
				</div>

				{/* Connected providers + Settings gear */}
				<div
					style={{
						padding: "8px 12px",
						borderTop: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					{/* Connected provider dots */}
					<button
						onClick={onOpenAccounts}
						title="Manage accounts"
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "4px 0",
							background: "transparent",
							border: "none",
							cursor: "pointer",
							minWidth: 0,
						}}
					>
						{(() => {
							const connected = providers.filter((p) =>
								loggedInProviders.has(p.id),
							)
							if (connected.length === 0) {
								return (
									<span style={{ fontSize: 11, color: "var(--dim)" }}>
										No providers connected
									</span>
								)
							}
							return (
								<>
									<span
										style={{ display: "flex", gap: 4, alignItems: "center" }}
									>
										{connected.map((p) => (
											<span
												key={p.id}
												title={p.label}
												style={{
													width: 7,
													height: 7,
													borderRadius: "50%",
													background: "var(--success)",
													flexShrink: 0,
												}}
											/>
										))}
									</span>
									<span
										style={{
											fontSize: 11,
											color: "var(--muted)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{connected.map((p) => p.label).join(", ")}
									</span>
								</>
							)
						})()}
						{/* Arrow icon */}
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="var(--dim)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ flexShrink: 0 }}
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>

					{/* Update notification download button */}
					{updateInfo?.hasUpdate && (
						<button
							onClick={downloadProgress ? undefined : onDownloadUpdate}
							title={
								downloadProgress
									? `Downloading update (${downloadProgress.percent}%)`
									: `Have new version${updateInfo.latestVersion ? ` (v${updateInfo.latestVersion})` : ""}`
							}
							style={{
								width: 26,
								height: 26,
								borderRadius: "50%",
								background: "var(--action)",
								color: "var(--on-accent)",
								border: "none",
								cursor: downloadProgress ? "default" : "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								padding: 0,
								boxShadow:
									"0 2px 8px color-mix(in srgb, var(--action) 40%, transparent)",
								transition: "transform 0.15s ease, filter 0.15s ease",
								flexShrink: 0,
							}}
							onMouseEnter={(e) => {
								if (!downloadProgress) {
									e.currentTarget.style.transform = "scale(1.08)"
									e.currentTarget.style.filter = "brightness(1.1)"
								}
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.transform = "scale(1)"
								e.currentTarget.style.filter = "none"
							}}
						>
							{downloadProgress ? (
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									style={{ display: "block" }}
								>
									{/* Inner concentric core / orb (Codex style) */}
									<circle
										cx="12"
										cy="12"
										r="3.5"
										fill="currentColor"
										fillOpacity={0.45}
									/>
									{/* Background circular track */}
									<circle
										cx="12"
										cy="12"
										r="7.5"
										fill="none"
										stroke="currentColor"
										strokeOpacity={0.25}
										strokeWidth="2.2"
									/>
									{/* Dynamic progress ring (clockwise from top) */}
									<circle
										cx="12"
										cy="12"
										r="7.5"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.2"
										strokeLinecap="round"
										strokeDasharray={2 * Math.PI * 7.5}
										strokeDashoffset={
											2 *
											Math.PI *
											7.5 *
											(1 -
												Math.min(Math.max(downloadProgress.percent, 0), 100) /
													100)
										}
										transform="rotate(-90 12 12)"
										style={{ transition: "stroke-dashoffset 0.25s ease-out" }}
									/>
								</svg>
							) : (
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<line x1="12" y1="4" x2="12" y2="15" />
									<polyline points="7 10 12 15 17 10" />
									<path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
								</svg>
							)}
						</button>
					)}

					<button
						onClick={onOpenSettings}
						title="Settings"
						style={{
							padding: 6,
							background: isSettingsActive
								? "var(--selected-bg)"
								: "transparent",
							borderRadius: 4,
							cursor: "pointer",
							border: "none",
							color: isSettingsActive ? "var(--text)" : "var(--dim)",
							flexShrink: 0,
							display: "flex",
							alignItems: "center",
						}}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
						</svg>
					</button>
				</div>
			</div>

			{searchModalOpen &&
				createPortal(
					<GlobalSearchModal
						projects={enrichedProjects}
						threads={threads}
						activeProjectName={projectName}
						onClose={() => setSearchModalOpen(false)}
						onSelectProject={(path) => onSwitchProject(path)}
						onSelectThread={(threadId) => onSwitchThread(threadId)}
					/>,
					document.body,
				)}

			{/* Right-edge drag strip — same affordance as the right panel's splitter. */}
			{sidebarVisible && onWidthChange && (
				<div
					data-sidebar-resize-handle=""
					className="titlebar-no-drag"
					onMouseDown={handleResizeMouseDown}
					title="Drag to resize · release below 150px to hide"
					style={{
						position: "absolute",
						top: 0,
						right: 0,
						bottom: 0,
						width: SIDEBAR_RESIZE_HANDLE_WIDTH,
						cursor: "col-resize",
						// Same 4px line as the right panel's splitter: it *is* the
						// divider, and lights up on hover.
						background: "var(--border-muted)",
						zIndex: 6,
						transition: "background 0.15s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--accent)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "var(--border-muted)"
					}}
				/>
			)}
		</div>
	)
}
