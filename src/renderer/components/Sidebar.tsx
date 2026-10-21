import { useState, useCallback, useRef } from "react"
import { ProjectList } from "./ProjectList"
import type { EnrichedProject } from "../types/project-list"
import { ConfirmDialog } from "./ConfirmDialog"
import { ResizeHandle } from "./ResizeHandle"
import { ContextMenu } from "./ContextMenu"
import type { ThreadInfo } from "../types/ipc"
import type { WorktreeStatus } from "../types/project"
import type { QueuedMessage } from "../types/chat"

interface SidebarProps {
	threads: ThreadInfo[]
	currentThreadId: string | null
	queuesByThread?: Record<string, QueuedMessage[]>
	loggedInProviders: Set<string>
	projectName: string
	sidebarVisible: boolean
	enrichedProjects: EnrichedProject[]
	activeProjectPath: string | null
	isAgentActive: boolean
	activeWorktrees: Set<string>
	unreadWorktrees: Set<string>
	worktreeStatuses: Map<string, WorktreeStatus>
	linkedIssues?: Record<string, { issueId: string; issueIdentifier: string; provider?: string }>
	onSwitchThread: (threadId: string) => void
	onNewThread: () => void
	onDeleteThread: (threadId: string) => void
	onRenameThread: (threadId: string, title: string) => void
	onLogin: (providerId: string) => void
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
	onCloneRepo: () => void
	onRemoveProject: (path: string) => void
	onRenameProject: (projectPath: string, newName: string) => void
	onCreateWorktree: (repoPath: string) => void
	onDeleteWorktree: (worktreePath: string) => void
	onOpenSettings: () => void
	onOpenAgents: () => void
	onOpenAccounts: () => void
	isSettingsActive: boolean
	isAgentsActive: boolean
	activeAgentCount: number
}

const providers = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai-codex", label: "OpenAI" },
	{ id: "google", label: "Google" },
	{ id: "deepseek", label: "DeepSeek" },
]

export function Sidebar({
	threads,
	currentThreadId,
	queuesByThread,
	loggedInProviders,
	projectName,
	sidebarVisible,
	enrichedProjects,
	activeProjectPath,
	isAgentActive,
	activeWorktrees,
	unreadWorktrees,
	worktreeStatuses,
	linkedIssues,
	onSwitchThread,
	onNewThread,
	onDeleteThread,
	onRenameThread,
	onLogin,
	onSwitchProject,
	onOpenFolder,
	onCloneRepo,
	onRemoveProject,
	onRenameProject,
	onCreateWorktree,
	onDeleteWorktree,
	onOpenSettings,
	onOpenAgents,
	onOpenAccounts,
	isSettingsActive,
	isAgentsActive,
	activeAgentCount,
}: SidebarProps) {
	const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null)
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
	const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
	const [editingThreadTitle, setEditingThreadTitle] = useState("")
	const [threadContextMenu, setThreadContextMenu] = useState<{
		x: number
		y: number
		threadId: string
		title: string
	} | null>(null)
	const [historyCollapsed, setHistoryCollapsed] = useState(false)
	const [historyHeight, setHistoryHeight] = useState(160)

	const commitThreadRename = useCallback(
		(threadId: string) => {
			if (editingThreadTitle.trim()) {
				onRenameThread(threadId, editingThreadTitle.trim())
			}
			setEditingThreadId(null)
		},
		[editingThreadTitle, onRenameThread],
	)

	const handleResize = useCallback((delta: number) => {
		setHistoryHeight((h) => Math.max(60, Math.min(500, h + delta)))
	}, [])

	if (!sidebarVisible) return null

	return (
		<div
			style={{
				width: 260,
				borderRight: "1px solid var(--border-muted)",
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-surface)",
				flexShrink: 0,
			}}
		>
			{/* Drag region + logo */}
			<div
				className="titlebar-drag"
				style={{
					height: 38,
					display: "flex",
					alignItems: "center",
					paddingLeft: 78,
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: -0.4 }}>My</span>
					<span style={{ fontSize: 16, fontWeight: 700, color: "var(--logo-accent, #059669)", letterSpacing: -0.4 }}>Agent</span>
				</div>
			</div>

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
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
				</svg>
				<span style={{
					fontSize: 13,
					fontWeight: 600,
					color: isAgentsActive ? "var(--text)" : "var(--muted)",
				}}>
					Agents
				</span>
				{activeAgentCount > 0 && (
					<span style={{
						marginLeft: "auto",
						fontSize: 9,
						fontWeight: 600,
						color: "#d97706",
						background: "#d9770618",
						padding: "1px 6px",
						borderRadius: 3,
						minWidth: 16,
						textAlign: "center" as const,
					}}>
						{activeAgentCount}
					</span>
				)}
			</button>

			{/* Project list — primary feature, takes available space */}
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
					linkedIssues={linkedIssues}
					onSwitchProject={onSwitchProject}
					onOpenFolder={onOpenFolder}
					onCloneRepo={onCloneRepo}
					onRemoveProject={onRemoveProject}
					onCreateWorktree={onCreateWorktree}
					onDeleteWorktree={onDeleteWorktree}
					onRenameProject={onRenameProject}
				/>
			</div>

			{/* Resize handle */}
			<ResizeHandle onResize={handleResize} />

			{/* Bottom section: threads + providers — pinned to bottom */}
			<div
				style={{
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
				}}
			>
				{/* Threads header */}
				<div style={{ padding: "6px 12px 4px", display: "flex", alignItems: "center" }}>
					<button
						onClick={() => setHistoryCollapsed(!historyCollapsed)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 4,
							background: "transparent",
							cursor: "pointer",
							padding: 0,
							border: "none",
						}}
					>
						<span
							style={{
								fontSize: 8,
								color: "var(--dim)",
								display: "inline-block",
								transition: "transform 0.15s ease",
								transform: historyCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
							}}
						>
							&#9660;
						</span>
						<span
							style={{
								fontSize: 10,
								fontWeight: 600,
								color: "var(--dim)",
								textTransform: "uppercase",
								letterSpacing: "0.5px",
							}}
						>
							History
						</span>
					</button>
					<div style={{ flex: 1 }} />
					<button
						onClick={onNewThread}
						style={{
							fontSize: 14,
							color: "var(--muted)",
							cursor: "pointer",
							padding: "0 4px",
							lineHeight: 1,
						}}
						title="New Thread"
					>
						+
					</button>
				</div>

				{/* Thread list — scrollable, resizable height */}
				{!historyCollapsed && <div
					style={{
						height: historyHeight,
						overflowY: "auto",
						padding: "2px 0",
					}}
				>
					{threads.length === 0 && (
						<div
							style={{
								padding: "8px 16px",
								color: "var(--dim)",
								fontSize: 11,
								textAlign: "center",
							}}
						>
							No threads yet
						</div>
					)}
					{threads.map((thread) => (
						<div
							key={thread.id}
							onMouseEnter={() => setHoveredThreadId(thread.id)}
							onMouseLeave={() => setHoveredThreadId(null)}
							onContextMenu={(e) => {
								e.preventDefault()
								setThreadContextMenu({
									x: e.clientX,
									y: e.clientY,
									threadId: thread.id,
									title: thread.title || "New Thread",
								})
							}}
							style={{
								display: "flex",
								alignItems: "center",
								background:
									thread.id === currentThreadId
										? "var(--selected-bg)"
										: "transparent",
								borderLeft:
									thread.id === currentThreadId
										? "2px solid var(--accent)"
										: "2px solid transparent",
							}}
						>
							{editingThreadId === thread.id ? (
								<div style={{ flex: 1, minWidth: 0, padding: "3px 8px 3px 12px" }}>
									<input
										autoFocus
										onFocus={(e) => e.currentTarget.select()}
										value={editingThreadTitle}
										onChange={(e) => setEditingThreadTitle(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												commitThreadRename(thread.id)
											} else if (e.key === "Escape") {
												setEditingThreadId(null)
											}
										}}
										onBlur={() => commitThreadRename(thread.id)}
										onClick={(e) => e.stopPropagation()}
										style={{
											width: "100%",
											fontSize: 11,
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
									onClick={() => onSwitchThread(thread.id)}
									onDoubleClick={(e) => {
										e.stopPropagation()
										setEditingThreadId(thread.id)
										setEditingThreadTitle(thread.title || "New Thread")
									}}
									style={{
										flex: 1,
										minWidth: 0,
										padding: "5px 4px 5px 16px",
										background: "transparent",
										textAlign: "left",
										cursor: "pointer",
										borderRadius: 0,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 4,
											minWidth: 0,
										}}
									>
										<span
											style={{
												fontSize: 11,
												color:
													thread.id === currentThreadId
														? "var(--text)"
														: "var(--muted)",
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
												flex: 1,
											}}
										>
											{thread.title || "New Thread"}
										</span>
										{queuesByThread?.[thread.id] &&
											queuesByThread[thread.id].length > 0 && (
												<span
													title={`${queuesByThread[thread.id].length} queued message${queuesByThread[thread.id].length > 1 ? "s" : ""}`}
													style={{
														fontSize: 9,
														color: "var(--accent)",
														background: "rgba(59, 130, 246, 0.15)",
														padding: "1px 5px",
														borderRadius: 8,
														fontWeight: 600,
														flexShrink: 0,
													}}
												>
													⏳ {queuesByThread[thread.id].length}
												</span>
											)}
									</div>
								</button>
							)}
							{hoveredThreadId === thread.id && editingThreadId !== thread.id && (
								<button
									onClick={(e) => {
										e.stopPropagation()
										setConfirmDeleteId(thread.id)
									}}
									title="Delete thread"
									style={{
										flexShrink: 0,
										padding: "2px 8px",
										fontSize: 12,
										color: "var(--muted)",
										background: "transparent",
										border: "none",
										cursor: "pointer",
										lineHeight: 1,
										opacity: 0.6,
									}}
									onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "var(--error)" }}
									onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.6"; (e.target as HTMLElement).style.color = "var(--muted)" }}
								>
									✕
								</button>
							)}
						</div>
					))}
				</div>}

				<div
					style={{
						height: 1,
						background: "var(--border-muted)",
						margin: "0 12px",
					}}
				/>

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
							const connected = providers.filter((p) => loggedInProviders.has(p.id))
							if (connected.length === 0) {
								return (
									<span style={{ fontSize: 11, color: "var(--dim)" }}>
										No providers connected
									</span>
								)
							}
							return (
								<>
									<span style={{ display: "flex", gap: 4, alignItems: "center" }}>
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
							style={{ flexShrink: 0, marginLeft: "auto" }}
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>

					<button
						onClick={onOpenSettings}
						title="Settings"
						style={{
							padding: 6,
							background: isSettingsActive ? "var(--selected-bg)" : "transparent",
							borderRadius: 4,
							cursor: "pointer",
							border: "none",
							color: isSettingsActive ? "var(--text)" : "var(--dim)",
							flexShrink: 0,
							display: "flex",
							alignItems: "center",
						}}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
						</svg>
					</button>
				</div>
			</div>

			{/* Thread Right-Click Context Menu */}
			{threadContextMenu && (
				<ContextMenu
					x={threadContextMenu.x}
					y={threadContextMenu.y}
					onClose={() => setThreadContextMenu(null)}
					items={[
						{
							label: "Rename",
							icon: (
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
								</svg>
							),
							onClick: () => {
								setEditingThreadId(threadContextMenu.threadId)
								setEditingThreadTitle(threadContextMenu.title)
							},
						},
						{
							label: "Delete",
							danger: true,
							icon: (
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							),
							onClick: () => {
								setConfirmDeleteId(threadContextMenu.threadId)
							},
						},
					]}
				/>
			)}

			{/* Delete confirmation modal */}
			{confirmDeleteId && (
				<ConfirmDialog
					title="Delete thread?"
					description={`"${threads.find((t) => t.id === confirmDeleteId)?.title || "Untitled"}" will be permanently deleted.`}
					confirmLabel="Delete"
					onConfirm={() => {
						onDeleteThread(confirmDeleteId)
						setConfirmDeleteId(null)
					}}
					onCancel={() => setConfirmDeleteId(null)}
				/>
			)}
		</div>
	)
}
