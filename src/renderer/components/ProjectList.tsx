import { useState, useMemo, useCallback, Fragment, useEffect } from "react"
import type { EnrichedProject, ProjectListProps } from "../types/project-list"
import type { ThreadInfo } from "../types/ipc"
import {
	collapseTargets,
	hashColor,
	hasGitRepo,
	sortByCreatedAt,
	supportsWorktrees,
} from "../utils/project-list"
import { WorktreeIndicator } from "./project-list/WorktreeIndicator"
import { WorktreeGlyph } from "./project-list/WorktreeGlyph"
import { ProjectSessionRow } from "./project-list/ProjectSessionRow"
import { ConfirmDialog } from "./ConfirmDialog"
import { ContextMenu } from "./ContextMenu"
import { RowActions, rowMenuAnchor, rowTextFade } from "./RowActions"
import { claimMenu, releaseMenu } from "../utils/menuRegistry"

export type { EnrichedProject } from "../types/project-list"

/**
 * Folder glyph shared by every project row. It doubles as the expand/collapse
 * affordance: an open folder while the group is expanded, a closed one while
 * it is collapsed — no separate chevron needed.
 */
function FolderIcon({
	size = 14,
	open = false,
}: {
	size?: number
	open?: boolean
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0 }}
			aria-hidden="true"
		>
			{open ? (
				<path d="M2 17.5V6a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v1.5M2 17.5l1.7-5a2 2 0 0 1 1.9-1.4h15a2 2 0 0 1 1.9 2.6l-1.5 5a2 2 0 0 1-1.9 1.3H4a2 2 0 0 1-2-2z" />
			) : (
				<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2a1.5 1.5 0 0 1 1.2.6l1 1.4h9.6A1.5 1.5 0 0 1 22 9.5v8A1.5 1.5 0 0 1 20.5 19h-16A1.5 1.5 0 0 1 3 17.5z" />
			)}
		</svg>
	)
}

/**
 * Current branch of a repo project, shown right-aligned on its row — but left
 * of the hover actions, so the ⋯ / + triggers stay the right-most elements.
 *
 * Only meaningful for the repository itself: a worktree row already carries its
 * branch as the row label, and a plain folder has no branch at all. The chip is
 * the first thing to give up space (see the row's `minWidth`), so the project
 * name survives longest.
 */
function BranchChip({ branch }: { branch: string }) {
	return (
		<span
			title={`Current branch: ${branch}`}
			style={{
				fontSize: 10,
				fontWeight: 500,
				lineHeight: 1.4,
				color: "var(--muted)",
				background: "var(--bg-elevated)",
				border: "1px solid var(--border-muted)",
				borderRadius: 3,
				padding: "0 5px",
				// border-box so `maxWidth` is the space actually taken (padding
				// included), otherwise the chip silently steals ~10px from the name.
				boxSizing: "border-box",
				maxWidth: 90,
				minWidth: 0,
				flexShrink: 1,
				whiteSpace: "nowrap",
				overflow: "hidden",
				textOverflow: "ellipsis",
			}}
		>
			{branch}
		</span>
	)
}

export function ProjectList({
	projects,
	activeProjectPath,
	isAgentActive,
	activeWorktrees,
	unreadWorktrees,
	recordingProjects,
	recordingThreads,
	replayingProjects,
	replayingThreads,
	onToggleRecording,
	onStopReplay,
	linkedIssues,
	threads,
	threadsByPath,
	threadsPath,
	currentThreadId,
	runningThreadId,
	queuesByThread,
	filterText = "",
	onSwitchProject,
	onOpenSession,
	onMutateForeignThread,
	onOpenFolder,
	onCloneRepo,
	onRemoveProject,
	onCreateWorktree,
	onDeleteWorktree,
	onRenameProject,
	onRenameWorktree,
	onSwitchThread,
	onNewThread,
	onDeleteThread,
	onRenameThread,
	onAbort,
}: ProjectListProps) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
	// Worktrees fold independently of their project, so a project can stay open
	// while a busy worktree keeps its sessions out of the way.
	const [collapsedWorktrees, setCollapsedWorktrees] = useState<Set<string>>(
		new Set(),
	)
	const [hoveredProject, setHoveredProject] = useState<string | null>(null)
	const [hoveredWorktree, setHoveredWorktree] = useState<string | null>(null)
	const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(
		null,
	)
	const [deleteHistory, setDeleteHistory] = useState(false)
	const [confirmDeleteWorktree, setConfirmDeleteWorktree] = useState<{
		path: string
		branch: string
	} | null>(null)
	const [editingProjectPath, setEditingProjectPath] = useState<string | null>(
		null,
	)
	const [editingProjectName, setEditingProjectName] = useState("")
	const [addMenuOpen, setAddMenuOpen] = useState(false)
	const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
	const [projectContextMenu, setProjectContextMenu] = useState<{
		x: number
		y: number
		projectPath: string
		name: string
		isWorktree?: boolean
		branch?: string
		/** Plain folders have no git repo, so worktrees do not apply. */
		canCreateWorktree?: boolean
	} | null>(null)

	// The header and "add project" popovers are hand-rolled rather than
	// ContextMenu, so they join the same single-menu registry explicitly:
	// opening any other menu closes them instead of leaving a second one
	// floating behind.
	useEffect(() => {
		if (!headerMenuOpen) return
		claimMenu("project-header-menu", () => setHeaderMenuOpen(false))
		return () => releaseMenu("project-header-menu")
	}, [headerMenuOpen])

	useEffect(() => {
		if (!addMenuOpen) return
		claimMenu("project-add-menu", () => setAddMenuOpen(false))
		return () => releaseMenu("project-add-menu")
	}, [addMenuOpen])

	/**
	 * Commit an inline rename. The two rows edit different things: a project
	 * renames its display name, a worktree renames the branch it is checked out
	 * on — which is also its label, so the edit has to reach git.
	 */
	const commitRename = useCallback(
		(targetPath: string, isWorktree = false) => {
			const name = editingProjectName.trim()
			if (name) {
				if (isWorktree) onRenameWorktree?.(targetPath, name)
				else onRenameProject(targetPath, name)
			}
			setEditingProjectPath(null)
		},
		[editingProjectName, onRenameProject, onRenameWorktree],
	)

	// 1. Sanitize projects: exclude empty names, root '/', or empty paths
	const validProjects = useMemo(() => {
		return (projects || []).filter(
			(p) =>
				p &&
				typeof p.rootPath === "string" &&
				p.rootPath.trim() !== "" &&
				p.rootPath !== "/" &&
				p.name &&
				p.name.trim() !== "",
		)
	}, [projects])

	// Group projects: root projects have worktrees nested underneath.
	// Ordered by creation time so the list only changes when something is added.
	const groups = useMemo(() => {
		const result: Array<{
			root: EnrichedProject
			worktrees: EnrichedProject[]
		}> = []
		const seen = new Set<string>()

		const orderedRoots = sortByCreatedAt(validProjects, (p) => p.createdAt)

		for (const p of orderedRoots) {
			const groupKey = p.mainRepoPath || p.rootPath
			if (!groupKey || groupKey === "/" || seen.has(groupKey)) continue
			seen.add(groupKey)

			const root =
				validProjects.find((q) => q.rootPath === groupKey && !q.isWorktree) ||
				validProjects.find((q) => q.rootPath === groupKey) ||
				p
			const wts = root.worktrees || p.worktrees || []

			result.push({
				root,
				worktrees: sortByCreatedAt(
					wts.map((wt) => ({
						name: wt.branch,
						rootPath: wt.path,
						lastOpened: "",
						createdAt: wt.createdAt,
						gitBranch: wt.branch,
						isWorktree: true,
						mainRepoPath: groupKey,
						worktrees: [],
					})),
					(wt) => wt.createdAt,
				),
			})
		}
		return result
	}, [validProjects])

	const isActive = (projectPath: string) => projectPath === activeProjectPath

	const query = filterText.trim().toLowerCase()

	/**
	 * Sessions of one folder (the project root or a worktree), in creation order
	 * — sending a message must not reorder them.
	 *
	 * `threadsByPath` is already the union of that folder's persisted snapshot and
	 * the last live list seen for it, so it is the whole answer. `threads` is only
	 * a fallback for the folder the live list was actually listed for: during a
	 * switch the new project becomes active before its own list arrives, and
	 * painting the previous project's list under it made rows appear and then
	 * vanish — the "jitter" you see when clicking another project's session.
	 */
	const sessionsOfPath = useCallback(
		(folderPath: string) => {
			const known = threadsByPath?.[folderPath]
			const list =
				known !== undefined
					? known
					: // No per-folder data at all (older callers pass the live list only):
						// use it, but solely for the folder it was actually listed for.
						threadsPath == null
						? isActive(folderPath)
							? (threads ?? [])
							: []
						: threadsPath === folderPath
							? (threads ?? [])
							: []
			const ordered = sortByCreatedAt(list, (t) => t.createdAt)
			if (!query) return ordered
			return ordered.filter((t) =>
				(t.title || "").toLowerCase().includes(query),
			)
		},
		// `isActive` only reads activeProjectPath.
		[activeProjectPath, threads, threadsByPath, threadsPath, query],
	)

	// Apply the text filter (project name, branch, worktree branch, session title)
	const filteredGroups = useMemo(() => {
		if (!query) return groups
		return groups
			.map((g) => {
				const nameMatch =
					g.root.name.toLowerCase().includes(query) ||
					(g.root.gitBranch || "").toLowerCase().includes(query)
				if (nameMatch) return g

				const rootHasSession = sessionsOfPath(g.root.rootPath).length > 0
				const matchedWorktrees = g.worktrees.filter(
					(wt) =>
						(wt.gitBranch || wt.name).toLowerCase().includes(query) ||
						sessionsOfPath(wt.rootPath).length > 0,
				)

				if (matchedWorktrees.length === 0 && !rootHasSession) {
					return null
				}
				return { ...g, worktrees: matchedWorktrees }
			})
			.filter(Boolean) as typeof groups
	}, [groups, query, sessionsOfPath])

	/**
	 * A session row already carries the selection: accent bar plus tinted
	 * background. Painting the project row above it the same way stacks a
	 * second bar right next to the first and reads as two selections, so the
	 * project row only keeps its highlight while the project is active with
	 * no session open in it.
	 *
	 * The open session may only exist in the per-folder snapshot for a moment
	 * (a project switch clears the live list first), so both sources count.
	 */
	const sessionSelected = useMemo(() => {
		if (!currentThreadId) return false
		if ((threads || []).some((t) => t.id === currentThreadId)) return true
		return Object.values(threadsByPath || {}).some((list) =>
			(list || []).some((t) => t.id === currentThreadId),
		)
	}, [currentThreadId, threads, threadsByPath])

	const activeRunningThreadId =
		runningThreadId !== undefined
			? runningThreadId
			: isAgentActive
				? currentThreadId
				: null

	function toggleCollapse(rootPath: string) {
		setCollapsed((prev) => {
			const next = new Set(prev)
			if (next.has(rootPath)) next.delete(rootPath)
			else next.add(rootPath)
			return next
		})
	}

	function toggleWorktree(rootPath: string) {
		setCollapsedWorktrees((prev) => {
			const next = new Set(prev)
			if (next.has(rootPath)) next.delete(rootPath)
			else next.add(rootPath)
			return next
		})
	}

	/**
	 * One session row, rendered under the folder that owns it. Selecting it opens
	 * that folder first when the session belongs to another project; renames and
	 * deletes of a sibling project go through the threads table instead of the
	 * (not running) harness, so the ⋯ menu is available everywhere.
	 */
	const sessionRow = (thread: ThreadInfo, ownerPath: string) => {
		const owned = isActive(ownerPath)
		const manageable = owned || Boolean(onMutateForeignThread)
		return (
			<ProjectSessionRow
				key={thread.id}
				thread={thread}
				active={thread.id === currentThreadId}
				running={thread.id === activeRunningThreadId}
				recording={Boolean(recordingThreads?.has(thread.id))}
				replayActive={Boolean(replayingThreads?.has(thread.id))}
				isReplay={Boolean(
					(thread.metadata as Record<string, unknown> | null)?.isReplay,
				)}
				queuedCount={queuesByThread?.[thread.id]?.length ?? 0}
				manageable={manageable}
				onSelect={() =>
					onOpenSession
						? onOpenSession(ownerPath, thread.id)
						: onSwitchThread(thread.id)
				}
				onRename={(title) =>
					owned
						? onRenameThread(thread.id, title)
						: onMutateForeignThread?.(ownerPath, thread.id, "rename", title)
				}
				onDelete={() =>
					owned
						? onDeleteThread(thread.id)
						: onMutateForeignThread?.(ownerPath, thread.id, "delete")
				}
				onStopReplay={() => onStopReplay?.(thread.id, ownerPath)}
				onToggleRecording={() => onToggleRecording?.(thread.id, ownerPath)}
				onAbort={onAbort}
			/>
		)
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				padding: "10px 0 12px",
			}}
		>
			<style>{`
				@keyframes wt-busy {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.35; }
				}
				@keyframes rec-pulse {
					0%, 100% { opacity: 1; transform: scale(1); }
					50% { opacity: 0.35; transform: scale(0.85); }
				}
				@keyframes sidebar-thread-spin {
					to { transform: rotate(360deg); }
				}
				@keyframes sidebar-rec-pulse {
					0%, 100% { opacity: 1; transform: scale(1); }
					50% { opacity: 0.35; transform: scale(0.85); }
				}
			`}</style>

			{/* Section header: label + project-level actions */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 2,
					padding: "0 8px 4px 10px",
					minHeight: 22,
				}}
			>
				<span
					style={{
						fontSize: 10,
						fontWeight: 600,
						color: "var(--dim)",
						textTransform: "uppercase",
						letterSpacing: "0.5px",
					}}
				>
					Project
				</span>
				<div style={{ flex: 1 }} />

				{/* Collapse / expand all */}
				<div style={{ position: "relative" }}>
					<button
						type="button"
						onClick={() => setHeaderMenuOpen((v) => !v)}
						onBlur={() => setTimeout(() => setHeaderMenuOpen(false), 150)}
						title="Project list options"
						aria-label="Project list options"
						style={{
							width: 20,
							height: 20,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							padding: 0,
							border: "none",
							borderRadius: 4,
							background: headerMenuOpen ? "var(--bg-hover)" : "transparent",
							color: "var(--muted)",
							cursor: "pointer",
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<circle cx="12" cy="5" r="1.7" />
							<circle cx="12" cy="12" r="1.7" />
							<circle cx="12" cy="19" r="1.7" />
						</svg>
					</button>
					{headerMenuOpen && (
						<div
							style={{
								position: "absolute",
								top: "100%",
								right: 0,
								marginTop: 6,
								background: "var(--bg)",
								border: "1px solid var(--border)",
								borderRadius: 10,
								padding: 5,
								zIndex: 100,
								minWidth: 150,
								boxShadow: "var(--shadow-popover)",
								display: "flex",
								flexDirection: "column",
								gap: 1,
							}}
						>
							{[
								{
									label: "Collapse all",
									onClick: () => {
										const targets = collapseTargets(groups)
										setCollapsed(new Set(targets.projects))
										setCollapsedWorktrees(new Set(targets.worktrees))
									},
								},
								{
									// Both levels: every project opens and every worktree
									// shows its sessions, i.e. the whole tree is visible.
									label: "Expand all",
									onClick: () => {
										setCollapsed(new Set())
										setCollapsedWorktrees(new Set())
									},
								},
							].map((item) => (
								<button
									key={item.label}
									type="button"
									onMouseDown={(e) => {
										e.preventDefault()
										item.onClick()
										setHeaderMenuOpen(false)
									}}
									style={{
										display: "flex",
										alignItems: "center",
										width: "100%",
										padding: "6px 9px",
										background: "transparent",
										color: "var(--text)",
										border: "none",
										borderRadius: 6,
										fontSize: 12,
										cursor: "pointer",
										textAlign: "left",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
									}}
								>
									{item.label}
								</button>
							))}
						</div>
					)}
				</div>

				{/* Add project */}
				<div style={{ position: "relative" }}>
					<button
						type="button"
						onClick={() => setAddMenuOpen((v) => !v)}
						onBlur={() => setTimeout(() => setAddMenuOpen(false), 150)}
						title="Add project"
						aria-label="Add project"
						style={{
							width: 20,
							height: 20,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							padding: 0,
							border: "none",
							borderRadius: 4,
							background: addMenuOpen ? "var(--bg-hover)" : "transparent",
							color: "var(--muted)",
							cursor: "pointer",
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
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
					</button>
					{addMenuOpen && (
						<div
							style={{
								position: "absolute",
								top: "100%",
								right: 0,
								marginTop: 6,
								background: "var(--bg)",
								border: "1px solid var(--border)",
								borderRadius: 12,
								padding: 6,
								zIndex: 100,
								minWidth: 160,
								boxShadow: "var(--shadow-popover)",
								display: "flex",
								flexDirection: "column",
								gap: 2,
							}}
						>
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault()
									onOpenFolder()
									setAddMenuOpen(false)
								}}
								title="Open Folder"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									width: "100%",
									padding: "7px 10px",
									background: "transparent",
									color: "var(--text)",
									border: "none",
									borderRadius: 8,
									fontSize: 12,
									cursor: "pointer",
									textAlign: "left",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = "var(--bg-hover)"
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "transparent"
								}}
							>
								<FolderIcon />
								<span
									style={{
										flex: 1,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Open Folder
								</span>
							</button>
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault()
									onCloneRepo()
									setAddMenuOpen(false)
								}}
								title="Clone from URL"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									width: "100%",
									padding: "7px 10px",
									background: "transparent",
									color: "var(--text)",
									border: "none",
									borderRadius: 8,
									fontSize: 12,
									cursor: "pointer",
									textAlign: "left",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor = "var(--bg-hover)"
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor = "transparent"
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
									strokeLinejoin="round"
									style={{ flexShrink: 0 }}
								>
									<circle cx="18" cy="18" r="3" />
									<circle cx="6" cy="6" r="3" />
									<path d="M13 6h3a2 2 0 012 2v7" />
									<line x1="6" y1="9" x2="6" y2="21" />
								</svg>
								<span
									style={{
										flex: 1,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Clone from URL
								</span>
							</button>
						</div>
					)}
				</div>
			</div>

			{filteredGroups.length === 0 && (
				<div
					style={{
						padding: "16px",
						color: "var(--dim)",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					{query ? "No matches" : "No projects yet"}
				</div>
			)}

			{filteredGroups.map(({ root, worktrees }) => {
				// A filter always reveals what it matched.
				const isExpanded = query ? true : !collapsed.has(root.rootPath)
				const rootSessions = sessionsOfPath(root.rootPath)
				const hasChildren = worktrees.length > 0 || rootSessions.length > 0
				// Folded groups advertise how much they hide, so a collapsed
				// project never looks like an empty one — same treatment the
				// worktree rows get.
				const hiddenSessions = isExpanded
					? 0
					: rootSessions.length +
						worktrees.reduce(
							(n, wt) => n + sessionsOfPath(wt.rootPath).length,
							0,
						)
				// Selection is drawn on the open session row instead (see
				// `sessionSelected`).
				const projectSelected = isActive(root.rootPath) && !sessionSelected

				return (
					<div key={root.rootPath} style={{ marginBottom: 1 }}>
						{/* Project row — actions live behind the hover ⋯ button only. */}
						<div
							onMouseEnter={() => setHoveredProject(root.rootPath)}
							onMouseLeave={() => setHoveredProject(null)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								borderLeft: projectSelected
									? "3px solid var(--accent)"
									: "3px solid transparent",
								background: projectSelected
									? "var(--selected-bg)"
									: hoveredProject === root.rootPath
										? "var(--bg-hover)"
										: "transparent",
							}}
						>
							<button
								type="button"
								onClick={() => {
									if (isActive(root.rootPath)) {
										if (hasChildren) toggleCollapse(root.rootPath)
										return
									}
									onSwitchProject(root.rootPath)
									if (!isExpanded) toggleCollapse(root.rootPath)
								}}
								title={
									root.gitBranch
										? `${root.name} (${root.gitBranch})`
										: root.name
								}
								style={{
									display: "flex",
									alignItems: "center",
									flex: 1,
									// The name keeps a floor so the branch chip is what
									// ellipsizes when the row runs out of width.
									minWidth: 72,
									gap: 6,
									padding: "7px 0 7px 6px",
									textAlign: "left",
									cursor: "pointer",
									borderRadius: 0,
									border: "none",
									background: "transparent",
									color: "var(--muted)",
									...rowTextFade(
										hoveredProject === root.rootPath &&
											editingProjectPath !== root.rootPath,
									),
								}}
							>
								{/* The folder glyph itself signals and toggles expand/collapse. */}
								<span
									onClick={(e) => {
										e.stopPropagation()
										if (hasChildren) toggleCollapse(root.rootPath)
									}}
									title={isExpanded ? "Collapse" : "Expand"}
									style={{
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
										cursor: hasChildren ? "pointer" : "default",
										color:
											isExpanded && hasChildren ? "var(--text)" : "inherit",
										transition: "color 0.12s ease",
									}}
								>
									<FolderIcon open={hasChildren && isExpanded} />
								</span>
								{editingProjectPath === root.rootPath ? (
									<input
										autoFocus
										onFocus={(e) => e.currentTarget.select()}
										value={editingProjectName}
										onChange={(e) => setEditingProjectName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") commitRename(root.rootPath)
											else if (e.key === "Escape") setEditingProjectPath(null)
										}}
										onBlur={() => commitRename(root.rootPath)}
										onClick={(e) => e.stopPropagation()}
										style={{
											flex: 1,
											minWidth: 0,
											fontSize: 12,
											fontWeight: 500,
											color: "var(--text)",
											background: "var(--bg)",
											border: "1px solid var(--accent)",
											borderRadius: 3,
											padding: "1px 5px",
											outline: "none",
											boxSizing: "border-box",
										}}
									/>
								) : (
									<span
										onDoubleClick={(e) => {
											e.stopPropagation()
											setEditingProjectPath(root.rootPath)
											setEditingProjectName(root.name)
										}}
										style={{
											flex: 1,
											minWidth: 0,
											fontSize: 12,
											fontWeight: 500,
											color: "var(--text)",
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{root.name}
									</span>
								)}
							</button>
							{/* Folded: keep the hidden session count visible instead of
							    letting the group read as empty. */}
							{hiddenSessions > 0 && (
								<span
									title={`${hiddenSessions} hidden session${hiddenSessions === 1 ? "" : "s"}`}
									style={{
										fontSize: 10,
										color: "var(--dim)",
										fontVariantNumeric: "tabular-nums",
										flexShrink: 0,
									}}
								>
									{hiddenSessions}
								</span>
							)}
							{/* Branch sits left of the hover actions; a worktree row already
							    uses its branch as the label, so it never gets a chip. */}
							{hasGitRepo(root) && !root.isWorktree && root.gitBranch && (
								<BranchChip branch={root.gitBranch} />
							)}
							{editingProjectPath !== root.rootPath && (
								<RowActions
									hovered={hoveredProject === root.rootPath}
									menuLabel="Project actions"
									onCreate={() => onNewThread(root.rootPath)}
									createLabel="New session"
									onOpenMenu={(rect) =>
										setProjectContextMenu({
											...rowMenuAnchor(rect, 180),
											projectPath: root.rootPath,
											name: root.name,
											canCreateWorktree: supportsWorktrees(root),
										})
									}
								/>
							)}
						</div>

						{/* Sessions of the project itself hang right under its own row —
						    not below the worktree list, where they would read as
						    children of whichever worktree came last. */}
						{isExpanded &&
							rootSessions.map((thread) => sessionRow(thread, root.rootPath))}

						{/* Worktrees, each carrying its own sessions */}
						{isExpanded &&
							worktrees.map((wt) => {
								const wtColor = hashColor(wt.gitBranch || wt.rootPath)
								const wtIsActive = isActive(wt.rootPath)
								// Same rule as the project row: the open session owns
								// the selection styling.
								const wtSelected = wtIsActive && !sessionSelected
								const wtIsSpinning =
									activeWorktrees.has(wt.rootPath) ||
									(wtIsActive && isAgentActive)
								const wtIsGlowing = unreadWorktrees.has(wt.rootPath)
								const issue = linkedIssues?.[wt.rootPath]
								// A search always reveals what it matched.
								const wtSessions = sessionsOfPath(wt.rootPath)
								const wtExpanded = query
									? true
									: !collapsedWorktrees.has(wt.rootPath)
								const wtHasSessions = wtSessions.length > 0

								return (
									<Fragment key={wt.rootPath}>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												borderLeft: wtSelected
													? `3px solid ${wtColor}`
													: "3px solid transparent",
												background: wtSelected
													? "var(--selected-bg)"
													: hoveredWorktree === wt.rootPath
														? "var(--bg-hover)"
														: "transparent",
											}}
											onMouseEnter={() => setHoveredWorktree(wt.rootPath)}
											onMouseLeave={() => setHoveredWorktree(null)}
										>
											<button
												type="button"
												onClick={() => {
													onSwitchProject(wt.rootPath)
													// Opening a worktree shows its sessions too.
													if (!wtExpanded) toggleWorktree(wt.rootPath)
												}}
												style={{
													display: "flex",
													alignItems: "center",
													flex: 1,
													minWidth: 0,
													padding: "6px 0 6px 28px",
													textAlign: "left",
													cursor: "pointer",
													borderRadius: 0,
													border: "none",
													background: "transparent",
													// 13px glyph + 5px gap keeps the label on the same x
													// as the 10px dot it replaced (28 + 13 + 5 = 46).
													gap: 5,
													...rowTextFade(
														hoveredWorktree === wt.rootPath &&
															editingProjectPath !== wt.rootPath,
													),
												}}
											>
												{/* The glyph doubles as the fold trigger, like the folder
												    on a project row: a click opens/closes the sessions
												    underneath, and its nodes are solid only while they
												    are shown. */}
												<span
													onClick={(e) => {
														e.stopPropagation()
														if (wtHasSessions) toggleWorktree(wt.rootPath)
													}}
													title={
														wtHasSessions
															? wtExpanded
																? "Collapse sessions"
																: "Expand sessions"
															: undefined
													}
													style={{
														display: "inline-flex",
														alignItems: "center",
														flexShrink: 0,
														cursor: wtHasSessions ? "pointer" : "default",
														opacity: wtHasSessions && !wtExpanded ? 0.8 : 1,
													}}
												>
													<WorktreeIndicator
														color={wtColor}
														expanded={wtExpanded}
														isSpinning={wtIsSpinning}
														isGlowing={wtIsGlowing}
													/>
												</span>
												{editingProjectPath === wt.rootPath ? (
													<input
														autoFocus
														onFocus={(e) => e.currentTarget.select()}
														value={editingProjectName}
														onChange={(e) =>
															setEditingProjectName(e.target.value)
														}
														onKeyDown={(e) => {
															if (e.key === "Enter")
																commitRename(wt.rootPath, true)
															else if (e.key === "Escape")
																setEditingProjectPath(null)
														}}
														onBlur={() => commitRename(wt.rootPath, true)}
														onClick={(e) => e.stopPropagation()}
														style={{
															flex: 1,
															minWidth: 0,
															fontSize: 11.5,
															color: "var(--text)",
															background: "var(--bg)",
															border: "1px solid var(--accent)",
															borderRadius: 3,
															padding: "1px 5px",
															outline: "none",
															boxSizing: "border-box",
														}}
													/>
												) : (
													<span
														onDoubleClick={(e) => {
															e.stopPropagation()
															setEditingProjectPath(wt.rootPath)
															setEditingProjectName(wt.gitBranch || wt.name)
														}}
														title={wt.gitBranch || wt.name}
														style={{
															fontSize: 11.5,
															color: "var(--text)",
															whiteSpace: "nowrap",
															overflow: "hidden",
															textOverflow: "ellipsis",
															flex: 1,
															minWidth: 0,
														}}
													>
														{wt.gitBranch || wt.name}
													</span>
												)}
												{/* Folded worktree: a count keeps the hidden sessions
												    from looking like there are none. */}
												{!wtExpanded && wtHasSessions && (
													<span
														style={{
															fontSize: 10,
															color: "var(--dim)",
															fontVariantNumeric: "tabular-nums",
															flexShrink: 0,
														}}
													>
														{wtSessions.length}
													</span>
												)}
												{issue && (
													<span
														style={{
															fontSize: 9,
															color: "var(--issue)",
															background:
																"color-mix(in srgb, var(--issue) 10%, transparent)",
															padding: "0px 5px",
															borderRadius: 3,
															fontFamily: "monospace",
															fontWeight: 500,
															flexShrink: 0,
														}}
													>
														{issue.issueIdentifier}
													</span>
												)}
											</button>
											{editingProjectPath !== wt.rootPath && (
												<RowActions
													hovered={hoveredWorktree === wt.rootPath}
													menuLabel="Worktree actions"
													onCreate={() => onNewThread(wt.rootPath)}
													createLabel="New session"
													onOpenMenu={(rect) =>
														setProjectContextMenu({
															...rowMenuAnchor(rect, 180),
															projectPath: wt.rootPath,
															name: wt.gitBranch || wt.name,
															isWorktree: true,
															branch: wt.gitBranch || wt.name,
														})
													}
												/>
											)}
										</div>
										{/* A worktree carries the sessions opened on it, and folds
										    them away on its own. */}
										{wtExpanded &&
											wtSessions.map((thread) =>
												sessionRow(thread, wt.rootPath),
											)}
									</Fragment>
								)
							})}
					</div>
				)
			})}

			{/* Project / worktree context menu */}
			{projectContextMenu && (
				<ContextMenu
					x={projectContextMenu.x}
					y={projectContextMenu.y}
					onClose={() => setProjectContextMenu(null)}
					items={[
						...(projectContextMenu.canCreateWorktree
							? [
									{
										label: "New worktree",
										icon: <WorktreeGlyph />,
										onClick: () => {
											onCreateWorktree(projectContextMenu.projectPath)
										},
									},
								]
							: []),
						{
							label: "Rename",
							icon: (
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M12 20h9" />
									<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
								</svg>
							),
							onClick: () => {
								setEditingProjectPath(projectContextMenu.projectPath)
								setEditingProjectName(projectContextMenu.name)
							},
						},
						projectContextMenu.isWorktree
							? {
									label: "Delete worktree",
									danger: true,
									icon: (
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<polyline points="3 6 5 6 21 6" />
											<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									),
									onClick: () => {
										setConfirmDeleteWorktree({
											path: projectContextMenu.projectPath,
											branch:
												projectContextMenu.branch || projectContextMenu.name,
										})
									},
								}
							: {
									label: "Remove project",
									danger: true,
									icon: (
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<polyline points="3 6 5 6 21 6" />
											<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									),
									onClick: () => {
										setConfirmRemovePath(projectContextMenu.projectPath)
									},
								},
					]}
				/>
			)}

			{/* Delete worktree confirmation */}
			{confirmDeleteWorktree && (
				<ConfirmDialog
					title="Delete worktree?"
					description={`The worktree "${confirmDeleteWorktree.branch}" and its files on disk will be permanently removed.`}
					confirmLabel="Delete"
					onConfirm={() => {
						onDeleteWorktree(confirmDeleteWorktree.path)
						setConfirmDeleteWorktree(null)
					}}
					onCancel={() => setConfirmDeleteWorktree(null)}
				/>
			)}

			{/* Remove project confirmation */}
			{confirmRemovePath && (
				<ConfirmDialog
					title="Remove project?"
					description={`"${groups.find((g) => g.root.rootPath === confirmRemovePath)?.root.name || "Untitled"}" will be removed from the sidebar. Files on disk will not be deleted.`}
					confirmLabel="Remove"
					checkboxLabel="Also delete conversation history"
					checkboxChecked={deleteHistory}
					onCheckboxChange={setDeleteHistory}
					onConfirm={() => {
						onRemoveProject(confirmRemovePath, deleteHistory)
						setConfirmRemovePath(null)
						setDeleteHistory(false)
					}}
					onCancel={() => {
						setConfirmRemovePath(null)
						setDeleteHistory(false)
					}}
				/>
			)}
		</div>
	)
}
