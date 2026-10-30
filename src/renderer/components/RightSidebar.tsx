import { useState, useCallback, useRef, useEffect } from "react"
import { FileTree } from "./FileTree"
import { GitPanel } from "./GitPanel"
import { ContextPanel } from "./ContextPanel"
import { TerminalPanel } from "./TerminalPanel"
import { ResizeHandle } from "./ResizeHandle"
import type { TokenUsage, Message } from "../types/ipc"
import type { ToolState } from "../types/chat"
import {
	resolveRightSidebarTab,
	rightSidebarTabs,
	type RightSidebarTab,
} from "../utils/rightSidebarTabs"
import {
	RIGHT_SIDEBAR_DEFAULT_WIDTH,
	RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
	RIGHT_SIDEBAR_RESIZE_HANDLE_WIDTH,
	clampRightSidebarWidth,
	restoreRightSidebarWidth,
	shouldCollapseRightSidebar,
} from "../utils/rightSidebarResize"

export type { RightSidebarTab }

interface RightSidebarProps {
	visible: boolean
	/** Called when a drag ends narrow enough that the panel should hide. */
	onCollapse?: () => void
	/**
	 * Space the left sidebar + chat panel need, so the splitter stops once the
	 * chat column reaches its minimum instead of squeezing it.
	 */
	layoutReserve?: number
	activeTab: RightSidebarTab
	onTabChange: (tab: RightSidebarTab) => void
	projectName: string
	projectPath?: string | null
	gitBranch?: string
	/** False for plain folders: hides every git-specific surface in this sidebar. */
	hasGitRepo?: boolean
	onFileClick: (filePath: string) => void
	onDiffClick: (filePath: string) => void
	activeFilePath?: string | null
	activeDiffPath?: string | null
	loading?: boolean
	onOpenBrowser?: (url: string) => void
	// Session context props
	currentThreadId?: string | null
	threadTitle?: string
	currentThreadModelId?: string
	currentThreadPermission?: string
	modeId?: string
	tokenUsage?: TokenUsage
	messages?: Message[]
	tools?: Map<string, ToolState>
	openFiles?: string[]
	tasks?: Array<{
		content: string
		status: "pending" | "in_progress" | "completed"
		activeForm: string
	}>
}

export function RightSidebar({
	visible,
	onCollapse,
	layoutReserve = RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
	activeTab,
	onTabChange,
	projectName,
	projectPath,
	gitBranch,
	hasGitRepo = false,
	onFileClick,
	onDiffClick,
	activeFilePath,
	activeDiffPath,
	loading,
	onOpenBrowser,
	currentThreadId,
	threadTitle,
	currentThreadModelId,
	currentThreadPermission,
	modeId,
	tokenUsage,
	messages,
	tools,
	openFiles,
	tasks,
}: RightSidebarProps) {
	const [terminalHeight, setTerminalHeight] = useState(350)
	// The panel keeps its own width, always clamped so the chat panel and the
	// left sidebar keep their space.
	const [width, setWidth] = useState(() => {
		if (typeof window === "undefined") return RIGHT_SIDEBAR_DEFAULT_WIDTH
		return clampRightSidebarWidth(
			RIGHT_SIDEBAR_DEFAULT_WIDTH,
			window.innerWidth,
			layoutReserve,
		)
	})
	// Width reached by the current drag, so mouse-up can decide whether the
	// panel should hide without waiting for another render.
	const dragWidthRef = useRef(width)

	// Reopening after a collapsing drag must not restore a sliver.
	useEffect(() => {
		if (!visible) return
		setWidth((w) =>
			restoreRightSidebarWidth(w, window.innerWidth, layoutReserve),
		)
	}, [visible, layoutReserve])

	// A window resize — or the left sidebar getting wider — can leave the panel
	// wider than the chat column can afford.
	useEffect(() => {
		const clamp = () => {
			setWidth((w) =>
				clampRightSidebarWidth(w, window.innerWidth, layoutReserve),
			)
		}
		clamp()
		window.addEventListener("resize", clamp)
		return () => window.removeEventListener("resize", clamp)
	}, [layoutReserve])

	const handleTerminalResize = useCallback((deltaY: number) => {
		setTerminalHeight((h) => Math.max(100, Math.min(600, h + deltaY)))
	}, [])

	const onDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault()
			const startX = e.clientX
			const startWidth = width
			dragWidthRef.current = width

			const onMouseMove = (ev: MouseEvent) => {
				// Dragging left widens the panel. The clamp stops at the point where
				// the chat column hits its minimum: the panel must not keep growing.
				const next = clampRightSidebarWidth(
					startWidth + (startX - ev.clientX),
					window.innerWidth,
					layoutReserve,
				)
				dragWidthRef.current = next
				setWidth(next)
			}

			const onMouseUp = () => {
				document.removeEventListener("mousemove", onMouseMove)
				document.removeEventListener("mouseup", onMouseUp)
				document.body.style.cursor = ""
				document.body.style.userSelect = ""
				// Same gesture as the left sidebar: releasing while the panel is
				// narrower than the usable width hides it.
				if (shouldCollapseRightSidebar(dragWidthRef.current)) onCollapse?.()
			}

			document.addEventListener("mousemove", onMouseMove)
			document.addEventListener("mouseup", onMouseUp)
			document.body.style.cursor = "col-resize"
			document.body.style.userSelect = "none"
		},
		[width, onCollapse, layoutReserve],
	)

	// The panel stays mounted while hidden so it can slide out (and so the
	// terminal inside it is not torn down and re-spawned on every toggle).
	const isCollapsing = shouldCollapseRightSidebar(width)

	// A stale "git" selection (or a project switch from repo to plain folder)
	// falls back to Files instead of rendering an empty panel.
	const shownTab = resolveRightSidebarTab(activeTab, hasGitRepo)

	return (
		<div
			style={{
				// border-box so the 4px splitter stays inside `width`.
				boxSizing: "border-box",
				width,
				// Hidden panels slide out to the right by their own width instead
				// of unmounting — the chat panel grows into the freed space.
				marginRight: visible ? 0 : -width,
				display: "flex",
				flexDirection: "row",
				flexShrink: 0,
				overflow: "hidden",
				// Fade while dragged into the closing range: releasing right now
				// hides the panel.
				opacity: isCollapsing ? 0.55 : 1,
				transition: "margin-right 0.22s ease, opacity 0.15s ease",
			}}
		>
			{/* Drag handle on left edge */}
			<div
				data-right-sidebar-resize-handle=""
				onMouseDown={onDragStart}
				title="Drag to resize · release below 150px to hide"
				style={{
					width: RIGHT_SIDEBAR_RESIZE_HANDLE_WIDTH,
					cursor: "col-resize",
					background: "var(--border-muted)",
					flexShrink: 0,
					transition: "background 0.15s",
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.background = "var(--accent)"
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.background = "var(--border-muted)"
				}}
			/>

			{/* Sidebar content */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					background: "var(--bg-surface)",
					overflow: "hidden",
					minWidth: 0,
				}}
			>
				{/* Tab strip */}
				<div
					className="titlebar-drag"
					style={{
						height: 38,
						boxSizing: "border-box",
						display: "flex",
						alignItems: "stretch",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
						flexShrink: 0,
					}}
				>
					{rightSidebarTabs(hasGitRepo).map((tab) => {
						const isActive = shownTab === tab.id
						return (
							<button
								key={tab.id}
								className="titlebar-no-drag"
								onClick={() => onTabChange(tab.id)}
								style={{
									flex: 1,
									height: "100%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									fontSize: 11,
									fontWeight: 500,
									color: isActive ? "var(--text)" : "var(--muted)",
									background: isActive ? "var(--bg)" : "transparent",
									borderBottom: isActive
										? "2px solid var(--accent)"
										: "2px solid transparent",
									cursor: "pointer",
									borderTop: "none",
									borderLeft: "none",
									borderRight: "none",
									padding: 0,
									transition: "color 0.15s, background-color 0.15s",
								}}
								onMouseEnter={(e) => {
									if (!isActive) {
										e.currentTarget.style.color = "var(--text)"
										e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									}
								}}
								onMouseLeave={(e) => {
									if (!isActive) {
										e.currentTarget.style.color = "var(--muted)"
										e.currentTarget.style.backgroundColor = "transparent"
									}
								}}
							>
								{tab.label}
							</button>
						)
					})}
				</div>

				{/* Tab content + Terminal with loading overlay */}
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
						position: "relative",
					}}
				>
					{/* Loading overlay */}
					{loading && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								zIndex: 10,
								background: "var(--bg-surface)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexDirection: "column",
								gap: 12,
							}}
						>
							<div
								style={{
									width: 24,
									height: 24,
									border: "2px solid var(--border-muted)",
									borderTopColor: "var(--accent)",
									borderRadius: "50%",
									animation: "sidebar-spin 0.8s linear infinite",
								}}
							/>
							<span style={{ fontSize: 12, color: "var(--muted)" }}>
								Switching project...
							</span>
							<style>{`
								@keyframes sidebar-spin {
									to { transform: rotate(360deg); }
								}
							`}</style>
						</div>
					)}

					{/* Tab content */}
					<div
						style={{
							flex: 1,
							overflow: "hidden",
							display: "flex",
							flexDirection: "column" as const,
							minHeight: 0,
						}}
					>
						{shownTab === "files" && (
							<FileTree
								projectName={projectName}
								projectPath={projectPath}
								onFileClick={onFileClick}
								activeFilePath={activeFilePath}
							/>
						)}
						{shownTab === "git" && hasGitRepo && (
							<GitPanel
								onFileClick={onDiffClick}
								activeFilePath={activeDiffPath}
							/>
						)}
						{shownTab === "context" && (
							<ContextPanel
								onFileClick={onFileClick}
								projectName={projectName}
								projectPath={projectPath}
								gitBranch={gitBranch}
								currentThreadId={currentThreadId}
								threadTitle={threadTitle}
								currentThreadModelId={currentThreadModelId}
								currentThreadPermission={currentThreadPermission}
								modeId={modeId}
								tokenUsage={tokenUsage}
								messages={messages}
								tools={tools}
								openFiles={openFiles}
								tasks={tasks}
							/>
						)}
					</div>

					{/* Terminal pinned to bottom */}
					<ResizeHandle onResize={handleTerminalResize} />
					<TerminalPanel
						height={terminalHeight}
						projectPath={projectPath}
						onOpenBrowser={onOpenBrowser}
					/>
				</div>
			</div>
		</div>
	)
}
