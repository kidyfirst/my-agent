import type { AttachedFile, ChatState } from "../types/chat"
import type { AuthManager } from "../hooks/useAuthManager"
import type { ProjectManager } from "../hooks/useProjectManager"
import type { TabManager } from "../hooks/useTabManager"
import type { PermissionMode } from "../hooks/useThreadModelPermissions"
import { AgentDashboard } from "./AgentDashboard"
import { BrowserView } from "./BrowserView"
import { ChatView, type ChatViewProps } from "./ChatView"
import { DiffEditor } from "./DiffEditor"
import { EditorInput } from "./EditorInput"
import { FileEditor } from "./FileEditor"
import { Settings } from "./Settings"
import { WelcomeScreen } from "./WelcomeScreen"

type QueueHandlers = ReturnType<
	typeof import("../hooks/useMessageQueue").useMessageQueue
>

interface MainContentProps {
	auth: AuthManager
	project: ProjectManager
	tabs: TabManager
	chat: ChatState
	tasks: ChatViewProps["todos"]
	activeThreadKey: string
	currentModelId: string
	modeId: string
	permissionMode: PermissionMode
	onSend: (content: string, files?: AttachedFile[]) => void
	onQueue: (content: string, files?: AttachedFile[]) => void
	onAbort: () => void
	onBuiltinCommand: (name: string) => void
	onSelectModel: (modelId: string) => void
	onSelectPermissionMode: (mode: PermissionMode) => void
	onResumeQueue: () => void
	onSteerQueued: QueueHandlers["handleSteerQueued"]
	onDeleteQueued: QueueHandlers["handleDeleteQueued"]
	onReorderQueue: QueueHandlers["handleReorderQueue"]
	onClearQueue: QueueHandlers["handleClearQueue"]
}

const isChatTab = (tab: string) => tab === "chat" || tab.startsWith("thread:")

export function LoadingSpinner() {
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					width: 24,
					height: 24,
					border: "2px solid var(--border)",
					borderTopColor: "var(--accent)",
					borderRadius: "50%",
					animation: "spin 0.8s linear infinite",
				}}
			/>
			<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
		</div>
	)
}

export function EmptyProjectScreen(props: {
	onOpenFolder: () => void
	onShowCloneModal: () => void
}) {
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				padding: 40,
				gap: 24,
			}}
		>
			<div
				style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}
			>
				<span
					style={{
						fontSize: 26,
						fontWeight: 700,
						color: "var(--text)",
						letterSpacing: -0.5,
					}}
				>
					My
				</span>
				<span
					style={{
						fontSize: 26,
						fontWeight: 700,
						color: "var(--logo-accent, #059669)",
						letterSpacing: -0.5,
					}}
				>
					Agent
				</span>
			</div>
			<div style={{ textAlign: "center", maxWidth: 420 }}>
				<div
					style={{
						fontSize: 20,
						fontWeight: 600,
						color: "var(--text)",
						marginBottom: 8,
					}}
				>
					Open a project to get started
				</div>
				<div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
					Point MyAgent at a repository or folder to start coding with AI.
				</div>
			</div>
			<div style={{ display: "flex", gap: 12 }}>
				<button
					onClick={props.onOpenFolder}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "12px 28px",
						background: "var(--accent)",
						color: "#fff",
						borderRadius: 8,
						cursor: "pointer",
						fontWeight: 600,
						fontSize: 14,
						border: "none",
						transition: "opacity 0.15s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.opacity = "0.85"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.opacity = "1"
					}}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
					</svg>
					Open Folder
				</button>
				<button
					onClick={props.onShowCloneModal}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "12px 28px",
						background: "transparent",
						color: "var(--text)",
						borderRadius: 8,
						cursor: "pointer",
						fontWeight: 600,
						fontSize: 14,
						border: "1px solid var(--border)",
						transition: "opacity 0.15s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.opacity = "0.85"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.opacity = "1"
					}}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="18" cy="18" r="3" />
						<circle cx="6" cy="6" r="3" />
						<path d="M13 6h3a2 2 0 012 2v7" />
						<line x1="6" y1="9" x2="6" y2="21" />
					</svg>
					Clone from URL
				</button>
			</div>
			<div style={{ fontSize: 11, color: "var(--dim)" }}>
				or press{" "}
				<kbd
					style={{
						padding: "2px 6px",
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						fontSize: 11,
						fontFamily: "inherit",
					}}
				>
					&#8984;O
				</kbd>{" "}
				anytime
			</div>
		</div>
	)
}

/**
 * Everything between the tab bar and the right sidebar: auth gate,
 * chat + composer, and the per-tab editors.
 */
export function MainContent(props: MainContentProps) {
	const { auth, project, tabs, chat } = props

	if (auth.isAuthenticated === null) return <LoadingSpinner />
	if (auth.isAuthenticated === false) {
		return (
			<WelcomeScreen
				onLogin={auth.handleLogin}
				onApiKey={auth.handleApiKey}
				onSkip={auth.handleSkipLogin}
			/>
		)
	}
	if (project.enrichedProjects.length === 0 && isChatTab(tabs.activeTab)) {
		return (
			<EmptyProjectScreen
				onOpenFolder={project.handleOpenFolder}
				onShowCloneModal={project.handleShowCloneModal}
			/>
		)
	}

	const activeTab = tabs.activeTab
	const fileTabOpen =
		!isChatTab(activeTab) && activeTab !== "settings" && activeTab !== "agents"

	return (
		<>
			<div
				onMouseDown={() => project.markWorktreeRead()}
				style={{
					flex: 1,
					display: isChatTab(activeTab) ? "flex" : "none",
					flexDirection: "column",
					overflow: "hidden",
					minWidth: 0,
				}}
			>
				<ChatView
					messages={chat.messages}
					tools={chat.tools}
					subagents={chat.subagents}
					isAgentActive={chat.isAgentActive}
					agentStartedAt={chat.agentStartedAt}
					streamingMessageId={chat.streamingMessageId}
					todos={props.tasks}
					onOpenDiff={props.tabs.handleDiffClick}
				/>
				<EditorInput
					onSend={props.onSend}
					onQueue={props.onQueue}
					onAbort={props.onAbort}
					isAgentActive={chat.isAgentActive}
					modeId={props.modeId}
					onBuiltinCommand={props.onBuiltinCommand}
					queue={chat.queuesByThread[props.activeThreadKey] || []}
					isQueuePaused={chat.isQueuePaused}
					onResumeQueue={props.onResumeQueue}
					onSteerQueued={props.onSteerQueued}
					onDeleteQueued={props.onDeleteQueued}
					onReorderQueue={props.onReorderQueue}
					onClearQueue={props.onClearQueue}
					currentModelId={props.currentModelId}
					onSelectModel={props.onSelectModel}
					permissionMode={props.permissionMode}
					onSelectPermissionMode={props.onSelectPermissionMode}
				/>
			</div>

			{activeTab === "settings" && (
				<Settings
					onClose={() => tabs.setActiveTab("chat")}
					loggedInProviders={auth.loggedInProviders}
					onLogin={auth.handleLogin}
					onApiKey={auth.handleApiKey}
					onLogout={auth.handleLogout}
					initialSection={tabs.settingsSection}
					onSectionChange={(s) => tabs.setSettingsSection(s)}
				/>
			)}

			{activeTab === "agents" && (
				<AgentDashboard
					onClose={() => tabs.setActiveTab("chat")}
					onSwitchToAgent={project.handleSwitchProject}
				/>
			)}

			{fileTabOpen &&
				(activeTab.startsWith("browser:") ? (
					<BrowserView
						url={activeTab.slice(8)}
						onNavigate={(newUrl) => {
							const newTab = `browser:${newUrl}`
							if (activeTab !== newTab) {
								tabs.setOpenFiles((prev) =>
									prev.map((f) => (f === activeTab ? newTab : f)),
								)
								tabs.setActiveTab(newTab)
							}
						}}
						onClose={() => tabs.handleCloseTab(activeTab)}
					/>
				) : activeTab.startsWith("diff:") ? (
					<DiffEditor
						filePath={activeTab.slice(5)}
						onClose={() => tabs.handleCloseTab(activeTab)}
						onOpenFile={tabs.handleFileClick}
					/>
				) : (
					<FileEditor
						ref={tabs.fileEditorRef}
						filePath={activeTab}
						onClose={() => tabs.handleCloseTab(activeTab)}
						onDirtyChange={(dirty) => tabs.handleDirtyChange(activeTab, dirty)}
					/>
				))}
		</>
	)
}
