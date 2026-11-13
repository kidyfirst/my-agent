import type { ProjectSkillEntry, Skill } from "@my-agent/core"
import { CloseIcon } from "../icons"

export interface ProjectSkillsGuideModalProps {
	isOpen: boolean
	mode: "onboarding" | "refresh"
	projectPath: string
	skills?: Skill[]
	added?: Skill[]
	removed?: ProjectSkillEntry[]
	modified?: Skill[]
	onEnable: () => void
	onDisable: () => void
	onClose?: () => void
}

export function ProjectSkillsGuideModal({
	isOpen,
	mode,
	projectPath,
	skills = [],
	added = [],
	removed = [],
	modified = [],
	onEnable,
	onDisable,
	onClose,
}: ProjectSkillsGuideModalProps) {
	if (!isOpen) return null

	const isRefresh = mode === "refresh"

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
				if (e.target === e.currentTarget && onClose) onClose()
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 540,
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
							{isRefresh ? "Project Skills Updated" : "Custom Skills Detected"}
						</span>
					</div>

					{onClose && (
						<button
							type="button"
							onClick={onClose}
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
					)}
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
					<div style={{ color: "var(--muted)", lineHeight: 1.5 }}>
						{isRefresh
							? "Changes to custom skills were detected in this workspace repository. Review the updates below."
							: "Custom skills were found in your project directory (.agent/skills, .claude/skills, .codex/skills). Enabling them provides your agent with workspace-specific workflows and instructions."}
					</div>

					{isRefresh ? (
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							{added.length > 0 && (
								<div>
									<div
										style={{
											fontSize: 11,
											fontWeight: 600,
											color: "var(--success)",
											marginBottom: 4,
											textTransform: "uppercase",
										}}
									>
										Added Skills ({added.length})
									</div>
									{added.map((s) => (
										<div
											key={s.name}
											style={{
												padding: "6px 10px",
												background: "var(--bg-surface)",
												borderRadius: 6,
												border: "1px solid var(--border)",
												fontSize: 12,
												marginBottom: 4,
											}}
										>
											<span style={{ fontWeight: 600 }}>{s.name}</span>:{" "}
											<span style={{ color: "var(--muted)" }}>
												{s.description}
											</span>
										</div>
									))}
								</div>
							)}

							{modified.length > 0 && (
								<div>
									<div
										style={{
											fontSize: 11,
											fontWeight: 600,
											color: "var(--warning)",
											marginBottom: 4,
											textTransform: "uppercase",
										}}
									>
										Modified Skills ({modified.length})
									</div>
									{modified.map((s) => (
										<div
											key={s.name}
											style={{
												padding: "6px 10px",
												background: "var(--bg-surface)",
												borderRadius: 6,
												border: "1px solid var(--border)",
												fontSize: 12,
												marginBottom: 4,
											}}
										>
											<span style={{ fontWeight: 600 }}>{s.name}</span>:{" "}
											<span style={{ color: "var(--muted)" }}>
												{s.description}
											</span>
										</div>
									))}
								</div>
							)}

							{removed.length > 0 && (
								<div>
									<div
										style={{
											fontSize: 11,
											fontWeight: 600,
											color: "var(--error)",
											marginBottom: 4,
											textTransform: "uppercase",
										}}
									>
										Removed Skills ({removed.length})
									</div>
									{removed.map((s) => (
										<div
											key={s.name}
											style={{
												padding: "6px 10px",
												background: "var(--bg-surface)",
												borderRadius: 6,
												border: "1px solid var(--border)",
												fontSize: 12,
												marginBottom: 4,
											}}
										>
											<span style={{ fontWeight: 600 }}>{s.name}</span>
										</div>
									))}
								</div>
							)}
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<div
								style={{
									fontSize: 11,
									fontWeight: 600,
									color: "var(--dim)",
									textTransform: "uppercase",
								}}
							>
								Detected Workspace Skills ({skills.length})
							</div>
							{skills.map((s) => (
								<div
									key={s.name}
									style={{
										padding: 10,
										background: "var(--bg-surface)",
										borderRadius: 8,
										border: "1px solid var(--border)",
									}}
								>
									<div
										style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}
									>
										{s.name}
									</div>
									<div
										style={{
											fontSize: 12,
											color: "var(--muted)",
											marginBottom: 4,
										}}
									>
										{s.description}
									</div>
									<div
										style={{
											fontSize: 10,
											fontFamily: "var(--font-mono)",
											color: "var(--dim)",
										}}
									>
										{s.path}
									</div>
								</div>
							))}
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
						onClick={onDisable}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							color: "var(--muted)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 6,
							cursor: "pointer",
						}}
					>
						Don't Enable
					</button>

					<button
						type="button"
						onClick={onEnable}
						style={{
							padding: "6px 16px",
							fontSize: 12,
							fontWeight: 600,
							color: "var(--on-accent)",
							background: "var(--accent)",
							border: "none",
							borderRadius: 6,
							cursor: "pointer",
						}}
					>
						Enable Skills
					</button>
				</div>
			</div>
		</div>
	)
}
