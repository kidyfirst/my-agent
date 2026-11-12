import type { ThreadInfo } from "../types/ipc"
import { OpenInDropdown } from "./OpenInDropdown"
import { OverviewMenu } from "./OverviewMenu"
import { ShortcutTooltip } from "./ShortcutTooltip"
import { WindowToggleIcon } from "./WindowToggleIcon"
import { GlobeIcon, GitPullRequestIcon } from "./icons"
import type { PRStatus } from "../hooks/useProjectManager"
import type { OverviewAction } from "../utils/overviewMenu"

interface TabBarProps {
	activeTab: string
	currentThreadId?: string | null
	openFiles: string[]
	dirtyFiles: Set<string>
	threads: ThreadInfo[]
	sidebarVisible: boolean
	rightSidebarVisible: boolean
	gitBranch?: string
	/** False for plain folders — the PR button is a git-only affordance. */
	hasGitRepo?: boolean
	prStatus: PRStatus | null
	isAgentActive: boolean
	onSelectTab: (tab: string) => void
	onCloseTab: (tab: string) => void
	onSwitchThread: (threadId: string) => Promise<void>
	onToggleRightSidebar: () => void
	onToggleSidebar?: () => void
	onCreatePR: () => void
	/** Overview Panel dropdown: rows are handled by the app shell. */
	onOverviewSelect: (action: OverviewAction) => void
	projectRootPath: string | null
	projectName?: string
	/**
	 * Optimistic "project / conversation" shown while a session in another
	 * project is opening: the real project info and thread list only land once
	 * that project's harness is up.
	 */
	titleOverride?: { projectName: string; conversationName: string }
	replayingThreads?: Set<string>
}

const isChatTab = (tab: string) => tab === "chat" || tab.startsWith("thread:")
const closeButtonStyle: React.CSSProperties = {
	color: "var(--dim)",
	cursor: "pointer",
	fontSize: 11,
	padding: "0 8px 0 2px",
	lineHeight: 1,
	flexShrink: 0,
}
const tabLabelStyle = (isActive: boolean): React.CSSProperties => ({
	padding: "0 4px 0 12px",
	fontSize: 11,
	fontWeight: 500,
	color: isActive ? "var(--text)" : "var(--muted)",
	cursor: "pointer",
	transition: "color 0.1s",
	// Let the label give way to its neighbours; the filename span inside clips.
	minWidth: 0,
	overflow: "hidden",
})
const tabShellStyle = (isActive: boolean): React.CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: 4,
	background: isActive ? "var(--bg)" : "transparent",
	borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
	// Tabs share one row: short of space they truncate, never wrap.
	flex: "0 1 auto",
	minWidth: 48,
	overflow: "hidden",
})

export function TabBar(props: TabBarProps) {
	const { activeTab, threads, prStatus } = props
	const isGitRepo = props.hasGitRepo !== false
	const showPR =
		isGitRepo &&
		props.gitBranch &&
		props.gitBranch !== "main" &&
		props.gitBranch !== "master"
	const chatActive = isChatTab(activeTab)

	let prLabel = "Create PR"
	let prDotColor = ""
	let prTitle = "Create PR from current branch"
	if (prStatus?.exists && prStatus.state === "open") {
		prLabel = `#${prStatus.number}`
		prTitle = `${prStatus.title} — ${prStatus.url}`
		if (prStatus.checks === "passing") {
			prDotColor = "var(--success)"
			prLabel += " passing"
		} else if (prStatus.checks === "failing") {
			prDotColor = "var(--error)"
			prLabel += " failing"
		} else if (prStatus.checks === "pending") {
			prDotColor = "var(--warning)"
			prLabel += " pending"
		}
		if (prStatus.isDraft) prLabel = `#${prStatus.number} draft`
	} else if (prStatus?.exists && prStatus.state === "merged") {
		prLabel = `#${prStatus.number} merged`
		prDotColor = "var(--accent)"
		prTitle = `Merged — ${prStatus.url}`
	}
	const hasOpenPR = Boolean(prStatus?.exists && prStatus.state === "open")
	const isMerged = Boolean(prStatus?.exists && prStatus.state === "merged")

	return (
		<div
			className="titlebar-drag"
			style={{
				height: 38,
				borderBottom: "1px solid var(--border-muted)",
				display: "flex",
				flexWrap: "nowrap",
				alignItems: "stretch",
				background: "var(--bg-surface)",
				flexShrink: 0,
				paddingLeft: props.sidebarVisible ? 0 : 116,
				position: "relative",
				overflow: "hidden",
			}}
		>
			{!props.sidebarVisible && props.onToggleSidebar && (
				<ShortcutTooltip
					label="Toggle Sidebar"
					shortcut="⌘B"
					className="titlebar-no-drag"
					style={{ position: "absolute", top: 5, left: 78, zIndex: 10 }}
				>
					<button
						type="button"
						className="titlebar-no-drag"
						onClick={props.onToggleSidebar}
						aria-label="Toggle Sidebar"
						style={{
							height: 28,
							width: 28,
							borderRadius: 6,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--muted)",
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
						<WindowToggleIcon side="left" open={false} soft />
					</button>
				</ShortcutTooltip>
			)}
			{/* Conversation Title (title style, no tab borders) */}
			{(() => {
				const threadId =
					props.currentThreadId ||
					(activeTab.startsWith("thread:") ? activeTab.slice(7) : null)
				const thread = threadId ? threads.find((t) => t.id === threadId) : null
				const conversationName =
					props.titleOverride?.conversationName || thread?.title || "New Thread"
				const projectName =
					props.titleOverride?.projectName ||
					props.projectName ||
					(props.projectRootPath
						? props.projectRootPath.split("/").filter(Boolean).pop()
						: "") ||
					""
				const title = projectName
					? `${projectName} / ${conversationName}`
					: conversationName

				// With the conversation already in front the title is a label, not a
				// control: selecting the tab it points at changes nothing, so it
				// must not offer a hand cursor. It only becomes a way back when a
				// file/diff/browser tab has taken over the pane.
				const titleClickable = !chatActive

				return (
					<div
						className="titlebar-no-drag"
						onClick={() => {
							if (!titleClickable) return
							if (threadId) {
								props.onSelectTab(`thread:${threadId}`)
								props.onSwitchThread(threadId)
							} else {
								props.onSelectTab("chat")
							}
						}}
						style={{
							display: "flex",
							alignItems: "center",
							padding: "0 14px",
							fontSize: 12,
							fontWeight: 500,
							color: "var(--text)",
							cursor: titleClickable ? "pointer" : "default",
							userSelect: "none",
							maxWidth: 540,
							// Shrink — but never below a readable floor; the name
							// ellipsizes once the tabs crowd it past that.
							flex: "0 1 auto",
							minWidth: 140,
							height: "100%",
							overflow: "hidden",
						}}
						title={title}
					>
						<span
							style={{
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{projectName ? (
								<>
									<span style={{ color: "var(--muted)" }}>{projectName}</span>
									<span style={{ color: "var(--dim)", margin: "0 6px" }}>
										/
									</span>
									<span>{conversationName}</span>
								</>
							) : (
								conversationName
							)}
						</span>
					</div>
				)
			})()}

			{/* Open file/diff/browser tabs */}
			{props.openFiles.map((tabId) => {
				const isDiff = tabId.startsWith("diff:")
				const isBrowser = tabId.startsWith("browser:")
				const filePath = isDiff
					? tabId.slice(5)
					: isBrowser
						? tabId.slice(8)
						: tabId
				const fileName = isBrowser
					? (() => {
							try {
								return new URL(filePath).host || "Browser"
							} catch {
								return "Browser"
							}
						})()
					: filePath.split("/").pop() || filePath
				const isActive = activeTab === tabId
				return (
					<div key={tabId} style={tabShellStyle(isActive)}>
						<button
							className="titlebar-no-drag"
							onClick={() => props.onSelectTab(tabId)}
							title={filePath}
							style={{
								...tabLabelStyle(isActive),
								display: "flex",
								alignItems: "center",
								gap: 4,
							}}
						>
							{isDiff && (
								<span
									style={{
										fontSize: 9,
										color: "var(--warning)",
										fontWeight: 700,
										flexShrink: 0,
									}}
								>
									M
								</span>
							)}
							{isBrowser && (
								<GlobeIcon
									size={11}
									stroke="var(--accent)"
									strokeWidth={2}
									style={{ flexShrink: 0 }}
								/>
							)}
							<span
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{fileName}
							</span>
							{props.dirtyFiles.has(tabId) && (
								<span
									style={{
										width: 6,
										height: 6,
										borderRadius: "50%",
										background: "var(--text)",
										flexShrink: 0,
									}}
								/>
							)}
						</button>
						<button
							className="titlebar-no-drag"
							onClick={(e) => {
								e.stopPropagation()
								props.onCloseTab(tabId)
							}}
							style={closeButtonStyle}
							title="Close"
						>
							&times;
						</button>
					</div>
				)
			})}

			{/* Gutter between the tabs and the controls on the right. `flex: 1`
			    fills the slack, but the minimum is what matters: tabs run right
			    up to the edge, and a hover highlight with no breathing room
			    reads as if it belonged to the tab. */}
			<div style={{ flex: "1 1 0", minWidth: 10 }} />

			{/* PR button */}
			{showPR && (
				<button
					className="titlebar-no-drag"
					onClick={() => {
						if (hasOpenPR && prStatus?.url) {
							window.api.invoke({ type: "openExternal", url: prStatus.url })
						} else if (!isMerged) {
							if (props.isAgentActive) return
							props.onCreatePR()
						}
					}}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "0 10px",
						fontSize: 11,
						fontWeight: 500,
						flexShrink: 0,
						color: hasOpenPR
							? "var(--text)"
							: isMerged
								? "var(--dim)"
								: props.isAgentActive
									? "var(--dim)"
									: "var(--muted)",
						cursor: isMerged ? "default" : "pointer",
						transition: "color 0.1s",
					}}
					title={prTitle}
				>
					{prDotColor && (
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: prDotColor,
								flexShrink: 0,
							}}
						/>
					)}
					{!prDotColor && (
						<GitPullRequestIcon size={14} strokeWidth={1.3} />
					)}
					{prLabel}
				</button>
			)}

			{/* <OpenInDropdown projectPath={props.projectRootPath} /> */}

			<OverviewMenu hasGitRepo={isGitRepo} onSelect={props.onOverviewSelect} />

			{/* Right sidebar toggle. Only while the panel is away: open, the
			    panel carries its own controls at its right edge, and two
			    side-by-side toggles for one panel read as a bug. */}
			{!props.rightSidebarVisible && (
				<ShortcutTooltip
					label="Toggle Side Panel"
					shortcut="⇧⌘B"
					align="end"
					className="titlebar-no-drag"
					style={{ margin: "0 6px", alignSelf: "center", flexShrink: 0 }}
				>
					<button
						type="button"
						className="titlebar-no-drag"
						data-testid="right-sidebar-show"
						onClick={props.onToggleRightSidebar}
						aria-label="Toggle Side Panel"
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							height: 28,
							width: 28,
							flexShrink: 0,
							borderRadius: 6,
							color: "var(--muted)",
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
						<WindowToggleIcon side="right" open={false} soft />
					</button>
				</ShortcutTooltip>
			)}
		</div>
	)
}
