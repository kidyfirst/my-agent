import type { ThreadInfo } from "../types/ipc"
import { OpenInDropdown } from "./OpenInDropdown"
import type { PRStatus } from "../hooks/useProjectManager"

interface TabBarProps {
	activeTab: string
	openThreadTabs: string[]
	openFiles: string[]
	dirtyFiles: Set<string>
	threads: ThreadInfo[]
	sidebarVisible: boolean
	rightSidebarVisible: boolean
	gitBranch?: string
	prStatus: PRStatus | null
	isAgentActive: boolean
	onSelectTab: (tab: string) => void
	onCloseTab: (tab: string) => void
	onSwitchThread: (threadId: string) => Promise<void>
	onNewThread: () => void
	onToggleRightSidebar: () => void
	onToggleSidebar?: () => void
	onCreatePR: () => void
	projectRootPath: string | null
}

const isChatTab = (tab: string) => tab === "chat" || tab.startsWith("thread:")
const closeButtonStyle: React.CSSProperties = {
	color: "var(--dim)",
	cursor: "pointer",
	fontSize: 11,
	padding: "0 8px 0 2px",
	lineHeight: 1,
}
const tabLabelStyle = (isActive: boolean): React.CSSProperties => ({
	padding: "0 4px 0 12px",
	fontSize: 11,
	fontWeight: 500,
	color: isActive ? "var(--text)" : "var(--muted)",
	cursor: "pointer",
	transition: "color 0.1s",
})
const tabShellStyle = (isActive: boolean): React.CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: 4,
	background: isActive ? "var(--bg)" : "transparent",
	borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
})

export function TabBar(props: TabBarProps) {
	const { activeTab, threads, prStatus } = props
	const showPR =
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
				alignItems: "stretch",
				background: "var(--bg-surface)",
				flexShrink: 0,
				paddingLeft: props.sidebarVisible ? 0 : 116,
				position: "relative",
			}}
		>
			{!props.sidebarVisible && props.onToggleSidebar && (
				<button
					type="button"
					className="titlebar-no-drag"
					onClick={props.onToggleSidebar}
					title="Toggle Sidebar (Cmd+B)"
					style={{
						position: "absolute",
						top: 0,
						left: 78,
						height: 38,
						width: 32,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--muted)",
						background: "none",
						border: "none",
						cursor: "pointer",
						transition: "color 0.15s, opacity 0.15s",
						zIndex: 10,
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = "var(--text)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = "var(--muted)"
					}}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<rect
							x="1"
							y="2"
							width="14"
							height="12"
							rx="1.5"
							stroke="currentColor"
							strokeWidth="1.2"
						/>
						<line
							x1="6"
							y1="2"
							x2="6"
							y2="14"
							stroke="currentColor"
							strokeWidth="1.2"
						/>
					</svg>
				</button>
			)}
			{props.openThreadTabs.length === 0 ? (
				<button
					className="titlebar-no-drag"
					onClick={() => props.onSelectTab("chat")}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "0 16px",
						fontSize: 11,
						fontWeight: 500,
						color: chatActive ? "var(--text)" : "var(--muted)",
						background: chatActive ? "var(--bg)" : "transparent",
						borderBottom: chatActive
							? "2px solid var(--accent)"
							: "2px solid transparent",
						cursor: "pointer",
					}}
				>
					New Thread
				</button>
			) : (
				props.openThreadTabs.map((threadId) => {
					const thread = threads.find((t) => t.id === threadId)
					const tabId = `thread:${threadId}`
					const isActive = activeTab === tabId
					return (
						<div key={tabId} style={tabShellStyle(isActive)}>
							<button
								className="titlebar-no-drag"
								onClick={() => props.onSwitchThread(threadId)}
								style={tabLabelStyle(isActive)}
							>
								{thread?.title || "New Thread"}
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
				})
			)}

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
									}}
								>
									M
								</span>
							)}
							{isBrowser && (
								<svg
									width="11"
									height="11"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--accent)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									style={{ flexShrink: 0 }}
								>
									<circle cx="12" cy="12" r="10" />
									<line x1="2" y1="12" x2="22" y2="12" />
									<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
								</svg>
							)}
							{fileName}
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

			{/* New thread button */}
			<button
				className="titlebar-no-drag"
				onClick={props.onNewThread}
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "0 8px",
					fontSize: 16,
					color: "var(--muted)",
					cursor: "pointer",
					transition: "color 0.1s",
				}}
				title="New Thread"
			>
				+
			</button>

			<div style={{ flex: 1 }} />

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
						<svg
							width="14"
							height="14"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="5" cy="3.5" r="2" />
							<circle cx="5" cy="12.5" r="2" />
							<circle cx="11" cy="5.5" r="2" />
							<line x1="5" y1="5.5" x2="5" y2="10.5" />
							<path d="M9 5.5 H7 C5.9 5.5 5 6.4 5 7.5" />
						</svg>
					)}
					{prLabel}
				</button>
			)}

			<OpenInDropdown projectPath={props.projectRootPath} />

			{/* Right sidebar toggle */}
			<button
				className="titlebar-no-drag"
				onClick={props.onToggleRightSidebar}
				style={{
					display: "flex",
					alignItems: "center",
					padding: "0 10px",
					color: props.rightSidebarVisible ? "var(--text)" : "var(--muted)",
					cursor: "pointer",
					transition: "color 0.1s",
				}}
				title="Toggle Explorer (Cmd+Shift+E)"
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<rect
						x="1"
						y="2"
						width="14"
						height="12"
						rx="1.5"
						stroke="currentColor"
						strokeWidth="1.2"
					/>
					<line
						x1="10.5"
						y1="2"
						x2="10.5"
						y2="14"
						stroke="currentColor"
						strokeWidth="1.2"
					/>
				</svg>
			</button>
		</div>
	)
}
