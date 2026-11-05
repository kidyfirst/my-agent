import { useState, useCallback, useRef, useEffect } from "react"
import { FileTree } from "./FileTree"
import { GitPanel } from "./GitPanel"
import { ContextPanel } from "./ContextPanel"
import { PanelBrowser } from "./PanelBrowser"
import { RightSidebarMenu } from "./RightSidebarMenu"
import { RightSidebarTabStrip } from "./RightSidebarTabStrip"
import { TerminalPanel } from "./TerminalPanel"
import type { TokenUsage, Message } from "../types/ipc"
import type { ToolState } from "../types/chat"
import type { OverviewAction } from "../utils/overviewMenu"
import {
	resolveRightSidebarTabs,
	visibleRightSidebarTabs,
	type RightSidebarPanel,
	type RightSidebarTab,
	type RightSidebarTabsState,
} from "../utils/rightSidebarTabs"
import {
	RIGHT_SIDEBAR_DEFAULT_WIDTH,
	RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
	RIGHT_SIDEBAR_RESIZE_HANDLE_WIDTH,
	clampRightSidebarWidth,
	restoreRightSidebarWidth,
	shouldCollapseRightSidebar,
} from "../utils/rightSidebarResize"

export type { RightSidebarTab, RightSidebarPanel }

interface RightSidebarProps {
	visible: boolean
	/** Called when a drag ends narrow enough that the panel should hide. */
	onCollapse?: () => void
	/**
	 * Filling the window: the panel gives up its width and grows into every
	 * pixel the conversation pane used to occupy.
	 */
	maximized?: boolean
	onToggleMaximize?: () => void
	/**
	 * Space the left sidebar + chat panel need, so the splitter stops once the
	 * chat column reaches its minimum instead of squeezing it.
	 */
	layoutReserve?: number
	activeTab: RightSidebarTab
	/** Destinations already opened as tabs, in display order. */
	openTabs?: RightSidebarPanel[]
	onTabChange: (tab: RightSidebarTab) => void
	onCloseTab?: (tab: RightSidebarPanel) => void
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
	/**
	 * A page another surface asked the embedded browser to show (the
	 * browser-preview card's open button). The shell decides when.
	 */
	browserOpenRequest?: { url: string; seq: number } | null
	/**
	 * Rows of the landing menu are app-level actions (open the browser panel,
	 * focus the terminal, …), so the shell decides what each one means.
	 */
	onSelectMenuItem?: (action: OverviewAction) => void
	/** Bumped by the shell when something asked for the terminal. */
	terminalFocusSignal?: number
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

/**
 * Every destination gets a permanently mounted pane. Hiding with `display`
 * instead of unmounting is what keeps PTY sessions, webviews, scroll offsets
 * and tree state intact when the user switches tabs.
 */
function Pane({
	active,
	children,
	testId,
}: {
	active: boolean
	children: React.ReactNode
	testId?: string
}) {
	return (
		<div
			data-testid={testId}
			style={{
				flex: 1,
				minHeight: 0,
				display: active ? "flex" : "none",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			{children}
		</div>
	)
}

export function RightSidebar({
	visible,
	onCollapse,
	maximized = false,
	onToggleMaximize,
	layoutReserve = RIGHT_SIDEBAR_MIN_LAYOUT_WIDTH,
	activeTab,
	openTabs = [],
	onTabChange,
	onCloseTab,
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
	browserOpenRequest,
	onSelectMenuItem,
	terminalFocusSignal,
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
	const [isDragging, setIsDragging] = useState(false)
	// Width reached by the current drag, so mouse-up can decide whether the
	// panel should hide without waiting for another render.
	const dragWidthRef = useRef(width)
	const prevVisibleRef = useRef(visible)

	// Reopening after a collapsing drag must not restore a sliver.
	useEffect(() => {
		if (!visible) {
			prevVisibleRef.current = false
			return
		}
		if (!prevVisibleRef.current) {
			prevVisibleRef.current = true
			setWidth((w) =>
				restoreRightSidebarWidth(w, window.innerWidth, layoutReserve),
			)
		}
	}, [visible, layoutReserve])

	// A window resize — or the left sidebar getting wider — can leave the panel
	// wider than the chat column can afford.
	useEffect(() => {
		const clamp = () => {
			setWidth((w) => {
				const next = clampRightSidebarWidth(w, window.innerWidth, layoutReserve)
				return next === w ? w : next
			})
		}
		window.addEventListener("resize", clamp)
		return () => window.removeEventListener("resize", clamp)
	}, [layoutReserve])

	const onDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault()
			setIsDragging(true)
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
				setIsDragging(false)
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

	const isCollapsing = shouldCollapseRightSidebar(width)

	const state: RightSidebarTabsState = { open: openTabs, active: activeTab }
	const tabs = visibleRightSidebarTabs(state, hasGitRepo)
	// A stale "git" selection (or a project switch from repo to plain folder)
	// falls back to the landing list instead of rendering an empty panel.
	const shownTab = resolveRightSidebarTabs(state, hasGitRepo)
	// A pane is created once its tab exists and then stays mounted, so switching
	// tabs never resets a file tree or reloads a webview. The terminal is the
	// exception: it owns a PTY that already exists at startup and must never be
	// torn down by a tab switch, so it is always mounted.
	const hasPane = (tab: RightSidebarPanel) => tabs.includes(tab)

	return (
		<div
			style={{
				// border-box so the 4px splitter stays inside `width`.
				boxSizing: "border-box",
				// Maximized: the panel stops claiming a fixed width and grows
				// into whatever the conversation column gives up. Both ends of
				// that swap are lengths, so the browser can interpolate them —
				// the panel widens while the chat column narrows, which is the
				// same motion as the panel sliding in and out.
				width: maximized && visible ? undefined : width,
				flexBasis: maximized && visible ? 0 : width,
				flexGrow: maximized && visible ? 1 : 0,
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
				transition: isDragging
					? "none"
					: "margin-right 0.22s ease, opacity 0.15s ease, flex-grow 0.22s ease, flex-basis 0.22s ease",
			}}
		>
			{/* Drag handle on left edge. Pointless while the panel is as wide as
			    the window, so it steps aside and gives the pixels to content. */}
			{!maximized && (
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
			)}

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
				{/* Overview is a header, not a tab: it stays at the far left and
				    the strip lists only real destinations next to it. */}
				<RightSidebarTabStrip
					tabs={tabs}
					activeTab={shownTab}
					onTabChange={onTabChange}
					onCloseTab={onCloseTab}
					maximized={maximized}
					onToggleMaximize={onToggleMaximize}
					onHide={onCollapse}
				/>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
						position: "relative",
						overflow: "hidden",
					}}
				>
					<Pane active={shownTab === "menu"} testId="right-sidebar-menu-pane">
						<RightSidebarMenu
							hasGitRepo={hasGitRepo}
							onSelect={(action) => onSelectMenuItem?.(action)}
						/>
					</Pane>

					{hasPane("files") && (
						<Pane active={shownTab === "files"}>
							<FileTree
								projectName={projectName}
								projectPath={projectPath}
								onFileClick={onFileClick}
								activeFilePath={activeFilePath}
							/>
						</Pane>
					)}

					{hasGitRepo && hasPane("git") && (
						<Pane active={shownTab === "git"}>
							<GitPanel
								onFileClick={onDiffClick}
								activeFilePath={activeDiffPath}
							/>
						</Pane>
					)}

					{hasPane("context") && (
						<Pane active={shownTab === "context"}>
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
						</Pane>
					)}

					{/* Terminal fills its own tab — no bottom dock, no splitter. */}
					<Pane active={shownTab === "terminal"}>
						<TerminalPanel
							projectPath={projectPath}
							onOpenBrowser={onOpenBrowser}
							focusSignal={terminalFocusSignal}
						/>
					</Pane>

					{hasPane("browser") && (
						<Pane active={shownTab === "browser"}>
							<PanelBrowser
								worktreePath={projectPath ?? null}
								openRequest={browserOpenRequest}
							/>
						</Pane>
					)}

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
				</div>
			</div>
		</div>
	)
}
