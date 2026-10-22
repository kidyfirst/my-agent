import { AskQuestionDialog } from "./AskQuestionDialog"
import { CommandPalette, type CommandItem } from "./CommandPalette"
import { LoginDialog } from "./LoginDialog"
import { ModelSelector } from "./ModelSelector"
import { PlanApproval } from "./PlanApproval"
import { QuickFileOpen } from "./QuickFileOpen"
import { ToolApprovalDialog } from "./ToolApprovalDialog"

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
	onSelectModel: (modelId: string) => void
	commandPaletteItems: CommandItem[]
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
						background: "rgba(0,0,0,0.5)",
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
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 12,
							padding: 24,
							width: 480,
							maxWidth: "90vw",
							display: "flex",
							flexDirection: "column",
							gap: 16,
						}}
					>
						<div
							style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}
						>
							Clone from URL
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<label
								style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}
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
								style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}
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
									color: cloneReady ? "#fff" : "var(--dim)",
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
						background: "rgba(0, 0, 0, 0.5)",
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
		</>
	)
}
