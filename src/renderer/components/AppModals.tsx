import { AskQuestionDialog } from "./AskQuestionDialog"
import { CommandPalette, type CommandItem } from "./CommandPalette"
import { LoginDialog } from "./LoginDialog"
import { ModelSelector } from "./ModelSelector"
import { PlanApproval } from "./PlanApproval"
import { QuickFileOpen } from "./QuickFileOpen"
import { ToolApprovalDialog } from "./ToolApprovalDialog"
import { GraphViewerModal } from "./graph/GraphViewerModal"
import { Settings } from "./Settings"
import { AgentDashboard } from "./AgentDashboard"
import {
	SessionExportModal,
	type SessionExportData,
} from "./SessionExportModal"
import { SessionReplayModal } from "./SessionReplayModal"
import { LogConsoleModal } from "./LogConsoleModal"
import { DEFAULT_EXECUTION_MODE } from "../types/ipc"

import type { AuthManager } from "../hooks/useAuthManager"
import type { DialogManager } from "../hooks/useDialogManager"
import type { ProjectManager } from "../hooks/useProjectManager"
import type { TabManager } from "../hooks/useTabManager"

interface AppModalsProps {
	dialogs: DialogManager
	auth: AuthManager
	tabs: TabManager
	project: ProjectManager
	currentModelId: string
	currentModeId?: string
	isAgentActive?: boolean
	onSelectModel: (modelId: string) => void
	onSelectMode?: (modeId: string) => void
	commandPaletteItems: CommandItem[]
	sessionExportData?: SessionExportData | null
	onCloseExport?: () => void
	onExportSuccess?: (savedPath: string) => void
	onExportError?: (msg: string) => void
	showReplayModal?: boolean
	onCloseReplay?: () => void
	onStartReplay?: (filePath: string) => void
	onReplayError?: (msg: string) => void
	currentThreadId?: string | null
}

export function AppModals(props: AppModalsProps) {
	const { dialogs, auth, tabs, project } = props
	const cloneReady = Boolean(
		project.cloneUrl.trim() && project.cloneDest.trim(),
	)

	return (
		<>
			{dialogs.pendingApproval && (
				<ToolApprovalDialog
					toolCallId={dialogs.pendingApproval.toolCallId}
					toolName={dialogs.pendingApproval.toolName}
					args={dialogs.pendingApproval.args}
					category={dialogs.pendingApproval.category}
					categoryLabel={dialogs.pendingApproval.categoryLabel}
					onApprove={dialogs.handleApprove}
					onDecline={dialogs.handleDecline}
					onAlwaysAllow={dialogs.handleAlwaysAllow}
				/>
			)}

			{dialogs.pendingQuestion && (
				<AskQuestionDialog
					questionId={dialogs.pendingQuestion.questionId}
					question={dialogs.pendingQuestion.question}
					options={dialogs.pendingQuestion.options}
					onRespond={dialogs.handleQuestionResponse}
				/>
			)}

			{dialogs.pendingPlan && (
				<PlanApproval
					planId={dialogs.pendingPlan.planId}
					title={dialogs.pendingPlan.title}
					plan={dialogs.pendingPlan.plan}
					onRespond={dialogs.handlePlanResponse}
				/>
			)}

			{/* Clone modal */}
			{project.showCloneModal && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "var(--scrim)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={(e) => {
						if (e.target === e.currentTarget && !project.cloning)
							project.setShowCloneModal(false)
					}}
				>
					<div
						style={{
							background: "var(--bg)",
							border: "1px solid var(--border)",
							borderRadius: 12,
							overflow: "hidden",
							width: 480,
							maxWidth: "90vw",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "8px 16px",
								borderBottom: "1px solid var(--border-muted)",
								background: "var(--bg-surface)",
								minHeight: 38,
							}}
						>
							<span
								style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
							>
								Clone from URL
							</span>
							<button
								onClick={() => {
									if (!project.cloning) {
										project.setShowCloneModal(false)
										project.setCloneUrl("")
										project.setCloneDest("")
									}
								}}
								style={{
									background: "transparent",
									border: "none",
									color: "var(--muted)",
									cursor: "pointer",
									padding: "4px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									borderRadius: 6,
								}}
								title="Close (Esc)"
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
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
						<div
							style={{
								padding: 20,
								display: "flex",
								flexDirection: "column",
								gap: 16,
							}}
						>
							<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
								<label
									style={{
										fontSize: 12,
										fontWeight: 500,
										color: "var(--muted)",
									}}
								>
									Git URL
								</label>
								<input
									type="text"
									value={project.cloneUrl}
									onChange={(e) => project.setCloneUrl(e.target.value)}
									placeholder="https://github.com/user/repo.git"
									disabled={project.cloning}
									onFocus={(e) => e.currentTarget.select()}
									style={{
										padding: "10px 12px",
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										borderRadius: 8,
										color: "var(--text)",
										fontSize: 13,
										fontFamily: "inherit",
										outline: "none",
									}}
								/>
							</div>
							<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
								<label
									style={{
										fontSize: 12,
										fontWeight: 500,
										color: "var(--muted)",
									}}
								>
									Clone location
								</label>
								<div style={{ display: "flex", gap: 8 }}>
									<input
										type="text"
										value={project.cloneDest}
										onChange={(e) => project.setCloneDest(e.target.value)}
										placeholder="/path/to/directory"
										disabled={project.cloning}
										style={{
											flex: 1,
											padding: "10px 12px",
											background: "var(--bg-elevated)",
											border: "1px solid var(--border)",
											borderRadius: 8,
											color: "var(--text)",
											fontSize: 13,
											fontFamily: "inherit",
											outline: "none",
										}}
									/>
									<button
										onClick={project.handleBrowseCloneDest}
										disabled={project.cloning}
										style={{
											padding: "10px 16px",
											background: "var(--bg-elevated)",
											color: "var(--text)",
											border: "1px solid var(--border)",
											borderRadius: 8,
											cursor: "pointer",
											fontSize: 13,
											fontWeight: 500,
											whiteSpace: "nowrap",
										}}
									>
										Browse...
									</button>
								</div>
							</div>
							<div
								style={{
									display: "flex",
									justifyContent: "flex-end",
									gap: 8,
									marginTop: 4,
								}}
							>
								<button
									onClick={() => {
										project.setShowCloneModal(false)
										project.setCloneUrl("")
										project.setCloneDest("")
									}}
									disabled={project.cloning}
									style={{
										padding: "8px 16px",
										background: "transparent",
										color: "var(--muted)",
										border: "1px solid var(--border)",
										borderRadius: 8,
										cursor: "pointer",
										fontSize: 13,
									}}
								>
									Cancel
								</button>
								<button
									onClick={project.handleCloneSubmit}
									disabled={!cloneReady || project.cloning}
									style={{
										padding: "8px 20px",
										background: cloneReady
											? "var(--accent)"
											: "var(--bg-elevated)",
										color: cloneReady ? "var(--on-accent)" : "var(--dim)",
										border: "none",
										borderRadius: 8,
										cursor:
											cloneReady && !project.cloning ? "pointer" : "default",
										fontSize: 13,
										fontWeight: 600,
										opacity: project.cloning ? 0.6 : 1,
									}}
								>
									{project.cloning ? "Cloning..." : "Clone repository"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{dialogs.showModelSelector && (
				<ModelSelector
					currentModelId={props.currentModelId}
					onSelect={(newModelId) => {
						props.onSelectModel(newModelId)
						dialogs.setShowModelSelector(false)
					}}
					onClose={() => dialogs.setShowModelSelector(false)}
				/>
			)}

			{dialogs.showCommandPalette && (
				<CommandPalette
					commands={props.commandPaletteItems}
					onClose={() => dialogs.setShowCommandPalette(false)}
				/>
			)}

			{dialogs.showQuickFileOpen && (
				<QuickFileOpen
					onSelect={(filePath) => {
						tabs.handleFileClick(filePath)
						dialogs.setShowQuickFileOpen(false)
					}}
					onClose={() => dialogs.setShowQuickFileOpen(false)}
				/>
			)}

			{tabs.pendingCloseTab && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 9999,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "var(--scrim)",
					}}
					onClick={() => tabs.setPendingCloseTab(null)}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 8,
							padding: "20px 24px",
							maxWidth: 360,
							width: "100%",
							display: "flex",
							flexDirection: "column",
							gap: 16,
						}}
					>
						<div
							style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
						>
							Unsaved Changes
						</div>
						<div
							style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}
						>
							This file has unsaved changes. Do you want to save before closing?
						</div>
						<div
							style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
						>
							<button
								onClick={() => {
									const tabId = tabs.pendingCloseTab!
									tabs.setPendingCloseTab(null)
									tabs.forceCloseTab(tabId)
								}}
								style={{
									fontSize: 12,
									padding: "6px 14px",
									borderRadius: 4,
									border: "1px solid var(--border)",
									background: "transparent",
									color: "var(--error)",
									cursor: "pointer",
									fontWeight: 500,
								}}
							>
								Discard
							</button>
							<button
								onClick={() => tabs.setPendingCloseTab(null)}
								style={{
									fontSize: 12,
									padding: "6px 14px",
									borderRadius: 4,
									border: "1px solid var(--border)",
									background: "transparent",
									color: "var(--muted)",
									cursor: "pointer",
									fontWeight: 500,
								}}
							>
								Cancel
							</button>
							<button
								onClick={async () => {
									const tabId = tabs.pendingCloseTab!
									tabs.setPendingCloseTab(null)
									await tabs.fileEditorRef.current?.save()
									tabs.forceCloseTab(tabId)
								}}
								style={{
									fontSize: 12,
									padding: "6px 14px",
									borderRadius: 4,
									border: "1px solid var(--border)",
									background: "var(--accent)",
									color: "var(--bg)",
									cursor: "pointer",
									fontWeight: 500,
								}}
							>
								Save & Close
							</button>
						</div>
					</div>
				</div>
			)}

			{auth.loginState && (
				<LoginDialog
					providerId={auth.loginState.providerId}
					stage={auth.loginState.stage}
					url={auth.loginState.url}
					instructions={auth.loginState.instructions}
					promptMessage={auth.loginState.promptMessage}
					promptPlaceholder={auth.loginState.promptPlaceholder}
					progressMessage={auth.loginState.progressMessage}
					errorMessage={auth.loginState.errorMessage}
					onSubmitCode={auth.handleLoginSubmitCode}
					onCancel={auth.handleLoginCancel}
					onClose={auth.handleLoginClose}
				/>
			)}

			<GraphViewerModal
				isOpen={Boolean(dialogs.showGraphViewer)}
				currentModeId={props.currentModeId || DEFAULT_EXECUTION_MODE}
				isAgentActive={props.isAgentActive}
				activeGraphNode={dialogs.activeGraphNode}
				onClose={dialogs.handleCloseGraphViewer}
				onSelectMode={(modeId) => {
					props.onSelectMode?.(modeId)
				}}
			/>

			{dialogs.showSettings && (
				<Settings
					isOpen={dialogs.showSettings}
					onClose={dialogs.handleCloseSettings}
					loggedInProviders={auth.loggedInProviders}
					onLogin={auth.handleLogin}
					onApiKey={auth.handleApiKey}
					onLogout={auth.handleLogout}
					initialSection={dialogs.settingsSection}
					onSectionChange={dialogs.setSettingsSection}
				/>
			)}

			{dialogs.showAgents && (
				<AgentDashboard
					isOpen={dialogs.showAgents}
					onClose={dialogs.handleCloseAgents}
					onSwitchToAgent={(worktreePath) => {
						project.handleSwitchProject(worktreePath)
						dialogs.handleCloseAgents()
					}}
				/>
			)}

			{dialogs.showLogConsole && (
				<LogConsoleModal onClose={dialogs.handleCloseLogConsole} />
			)}

			{props.sessionExportData && (
				<SessionExportModal
					data={props.sessionExportData}
					onClose={props.onCloseExport || (() => {})}
					onExported={props.onExportSuccess}
					onError={props.onExportError}
				/>
			)}

			{props.showReplayModal && (
				<SessionReplayModal
					currentThreadId={props.currentThreadId}
					onClose={props.onCloseReplay || (() => {})}
					onStartReplay={props.onStartReplay || (() => {})}
					onError={props.onReplayError}
				/>
			)}
		</>
	)
}
