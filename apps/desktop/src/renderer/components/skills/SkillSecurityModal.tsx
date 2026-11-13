import type { SecurityAuditReport, SkillHubPluginItem } from "@my-agent/core"
import { CloseIcon } from "../icons"
import { AsyncButton } from "../AsyncButton"

export interface SkillSecurityModalProps {
	isOpen: boolean
	plugin: SkillHubPluginItem | null
	report: SecurityAuditReport | null
	onConfirm: () => void
	onCancel: () => void
	installing?: boolean
}

export function SkillSecurityModal({
	isOpen,
	plugin,
	report,
	onConfirm,
	onCancel,
	installing = false,
}: SkillSecurityModalProps) {
	if (!isOpen || !plugin || !report) return null

	const isSafe = report.safe
	const scoreColor =
		report.score >= 80
			? "var(--success)"
			: report.score >= 60
				? "var(--warning)"
				: "var(--error)"

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				backgroundColor: "var(--scrim)",
				backdropFilter: "blur(4px)",
				zIndex: 1200,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel()
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 580,
					maxHeight: "85vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "14px 18px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span
							style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}
						>
							Security Audit Report
						</span>
						<span style={{ fontSize: 12, color: "var(--muted)" }}>
							— {plugin.name}
						</span>
					</div>

					<button
						type="button"
						onClick={onCancel}
						style={{
							background: "transparent",
							border: "none",
							color: "var(--muted)",
							cursor: "pointer",
							padding: 4,
						}}
					>
						<CloseIcon size={16} strokeWidth={2} />
					</button>
				</div>

				{/* Body */}
				<div
					style={{
						padding: 20,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						gap: 16,
						fontSize: 13,
					}}
				>
					{/* Status & Score Banner */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "12px 16px",
							background: isSafe
								? "var(--tool-success-bg)"
								: "var(--tool-error-bg)",
							border: isSafe
								? "1px solid var(--tool-border-success)"
								: "1px solid var(--tool-border-error)",
							borderRadius: 8,
						}}
					>
						<div>
							<div
								style={{
									fontWeight: 600,
									color: isSafe ? "var(--success)" : "var(--error)",
									marginBottom: 2,
								}}
							>
								{isSafe ? "Safe to install" : "Security warnings detected"}
							</div>
							<div style={{ fontSize: 12, color: "var(--muted)" }}>
								{report.summary}
							</div>
						</div>

						<div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
							<div style={{ fontSize: 11, color: "var(--dim)" }}>
								Audit Score
							</div>
							<div style={{ fontSize: 18, fontWeight: 700, color: scoreColor }}>
								{report.score}/100
							</div>
						</div>
					</div>

					{/* Permissions Analysis */}
					<div>
						<div
							style={{
								fontSize: 11,
								color: "var(--dim)",
								marginBottom: 6,
								textTransform: "uppercase",
								fontWeight: 600,
							}}
						>
							Permission Capabilities
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 10,
								background: "var(--bg-elevated)",
								padding: 10,
								borderRadius: 8,
								border: "1px solid var(--border)",
							}}
						>
							<div>
								<span style={{ fontSize: 11, color: "var(--muted)" }}>
									Declared:{" "}
								</span>
								<span style={{ fontWeight: 500 }}>
									{report.declaredPermissions.length > 0
										? report.declaredPermissions.join(", ")
										: "None declared"}
								</span>
							</div>
							<div>
								<span style={{ fontSize: 11, color: "var(--muted)" }}>
									Detected:{" "}
								</span>
								<span style={{ fontWeight: 500 }}>
									{report.detectedPermissions.length > 0
										? report.detectedPermissions.join(", ")
										: "None detected"}
								</span>
							</div>
						</div>
					</div>

					{/* Flagged Issues */}
					{report.issues.length > 0 ? (
						<div>
							<div
								style={{
									fontSize: 11,
									color: "var(--dim)",
									marginBottom: 6,
									textTransform: "uppercase",
									fontWeight: 600,
								}}
							>
								Flagged Issues ({report.issues.length})
							</div>
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{report.issues.map((issue, idx) => (
									<div
										key={idx}
										style={{
											padding: 10,
											borderRadius: 6,
											border: "1px solid var(--border)",
											background: "var(--bg-surface)",
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												marginBottom: 4,
											}}
										>
											<span style={{ fontWeight: 600, fontSize: 12 }}>
												{issue.title}
											</span>
											<span
												style={{
													fontSize: 10,
													textTransform: "uppercase",
													fontWeight: 600,
													padding: "1px 6px",
													borderRadius: 4,
													color:
														issue.severity === "critical" ||
														issue.severity === "high"
															? "var(--error)"
															: "var(--warning)",
													background: "var(--bg-elevated)",
												}}
											>
												{issue.severity}
											</span>
										</div>
										<div style={{ fontSize: 11, color: "var(--muted)" }}>
											{issue.description}
										</div>
										{issue.codeSnippet && (
											<code
												style={{
													display: "block",
													marginTop: 6,
													padding: "4px 8px",
													background: "var(--bg)",
													borderRadius: 4,
													fontSize: 10,
													fontFamily: "var(--font-mono)",
													color: "var(--dim)",
													overflowX: "auto",
												}}
											>
												{issue.codeSnippet}
											</code>
										)}
									</div>
								))}
							</div>
						</div>
					) : (
						<div
							style={{
								fontSize: 12,
								color: "var(--dim)",
								fontStyle: "italic",
							}}
						>
							Automated scan checked code for privacy leaks, credential theft,
							prompt injection, and undeclared capabilities. All checks passed.
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "flex-end",
						gap: 10,
						padding: "12px 18px",
						borderTop: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
					}}
				>
					<button
						type="button"
						onClick={onCancel}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							color: "var(--text)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 6,
							cursor: "pointer",
						}}
					>
						Cancel
					</button>

					<AsyncButton
						type="button"
						loading={installing}
						onClick={onConfirm}
						style={{
							padding: "6px 16px",
							fontSize: 12,
							fontWeight: 600,
							color: "var(--on-accent)",
							background: isSafe ? "var(--accent)" : "var(--error)",
							border: "none",
							borderRadius: 6,
							cursor: "pointer",
						}}
					>
						Proceed with Install
					</AsyncButton>
				</div>
			</div>
		</div>
	)
}
