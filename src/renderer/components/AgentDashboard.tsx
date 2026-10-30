import { useState, useEffect, useCallback } from "react"
import { hashColor } from "../utils/project-list"

interface AgentData {
	worktreePath: string
	projectName: string
	gitBranch: string
	isActive: boolean
	currentTask: string | null
	linkedIssue: { id: string; identifier: string; provider: string } | null
	tokenUsage: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
	estimatedCost: number
	modelId: string | null
	modeId?: string
	thinkingLevel?: string
	startedAt: number | null
	totalDurationMs: number
	isCurrentSession: boolean
}

interface DashboardTotals {
	promptTokens: number
	completionTokens: number
	totalTokens: number
	estimatedCost: number
	activeCount: number
	totalCount: number
}

interface AgentDashboardProps {
	isOpen?: boolean
	onClose: () => void
	onSwitchToAgent: (worktreePath: string) => void
}

const modeDisplayNames: Record<string, string> = {
	react: "ReAct",
	fast: "Fast",
	plan: "Plan & Solve",
	build: "ReAct",
	chat: "Fast",
}

const modeColors: Record<string, string> = {
	react: "var(--mode-react)",
	fast: "var(--mode-fast)",
	plan: "var(--mode-plan)",
	build: "var(--mode-build)",
	chat: "var(--mode-fast)",
}

function formatThinkingLevel(level?: string): string {
	if (!level || level === "off") return "Off"
	if (level === "low") return "Low"
	if (level === "medium") return "Med"
	if (level === "high") return "High"
	if (level === "xhigh") return "Max"
	return level.charAt(0).toUpperCase() + level.slice(1)
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
	return String(n)
}

function formatCost(n: number): string {
	if (n === 0) return "$0.00"
	if (n < 0.01) return "<$0.01"
	return "$" + n.toFixed(2)
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ${minutes % 60}m`
}

function LiveDuration({
	startedAt,
	baseDurationMs,
}: {
	startedAt: number | null
	baseDurationMs: number
}) {
	const [now, setNow] = useState(Date.now())

	useEffect(() => {
		if (!startedAt) return
		const interval = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(interval)
	}, [startedAt])

	const elapsed = baseDurationMs + (startedAt ? now - startedAt : 0)
	return <span>{formatDuration(elapsed)}</span>
}

function extractModelShort(modelId: string | null): string {
	if (!modelId) return "—"
	if (modelId.includes("/")) return modelId.split("/").pop() || modelId
	return modelId
}

export function AgentDashboard({
	isOpen = true,
	onClose,
	onSwitchToAgent,
}: AgentDashboardProps) {
	const [agents, setAgents] = useState<AgentData[]>([])
	const [totals, setTotals] = useState<DashboardTotals | null>(null)
	const [loading, setLoading] = useState(true)
	const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

	const loadData = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "getAgentDashboardData",
			})) as {
				agents: AgentData[]
				totals: DashboardTotals
			}
			if (result) {
				setAgents(result.agents)
				setTotals(result.totals)
			}
		} catch {
			/* ignore */
		}
		setLoading(false)
	}, [])

	useEffect(() => {
		if (!isOpen) return
		loadData()
		const interval = setInterval(loadData, 3000)
		return () => clearInterval(interval)
	}, [isOpen, loadData])

	useEffect(() => {
		if (!isOpen) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [isOpen, onClose])

	if (!isOpen) return null

	// Sort: running agents first, then by branch name
	const sorted = [...agents].sort((a, b) => {
		if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
		if (a.isCurrentSession !== b.isCurrentSession)
			return a.isCurrentSession ? -1 : 1
		return a.gitBranch.localeCompare(b.gitBranch)
	})

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				backgroundColor: "var(--scrim)",
				backdropFilter: "blur(4px)",
				zIndex: 1000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			{/* CSS for spinner */}
			<style>{`
				@keyframes dash-spin {
					to { transform: rotate(360deg); }
				}
			`}</style>

			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 780,
					height: "82vh",
					maxHeight: 680,
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
						padding: "8px 16px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
						flexShrink: 0,
						minHeight: 38,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<div
							style={{
								width: 22,
								height: 22,
								borderRadius: 5,
								background:
									"linear-gradient(135deg, var(--accent), var(--accent-2))",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--on-accent)",
							}}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<rect
									width="13.5"
									height="12.5"
									x="5.25"
									y="7.75"
									strokeWidth="1.5"
									rx="2.5"
								/>
								<path strokeWidth="1.5" d="M12 7.75V4" />
								<path strokeWidth="2" d="M12 3.25h.01" />
								<path strokeWidth="1.5" d="M2.75 12.5V16m18.5-3.5V16" />
								<path strokeWidth="2" d="M9.25 12.75h.01m5.49 0h.01" />
								<path strokeWidth="1.5" d="M9.75 16.5h4.5" />
							</svg>
						</div>
						<span
							style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
						>
							Agent Sessions
						</span>
						{totals && totals.activeCount > 0 && (
							<span
								style={{
									fontSize: 9,
									fontWeight: 600,
									color: "var(--warning)",
									background:
										"color-mix(in srgb, var(--warning) 10%, transparent)",
									padding: "1px 6px",
									borderRadius: 3,
								}}
							>
								{totals.activeCount} running
							</span>
						)}
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						{totals && totals.estimatedCost > 0 && (
							<span
								style={{
									fontSize: 12,
									color: "var(--muted)",
									fontFamily: "monospace",
								}}
							>
								{formatCost(totals.estimatedCost)} total
							</span>
						)}
						<button
							onClick={onClose}
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
								transition: "color 0.15s ease",
							}}
							title="Close (Esc)"
							onMouseEnter={(e) => {
								;(e.currentTarget as HTMLElement).style.color = "var(--text)"
							}}
							onMouseLeave={(e) => {
								;(e.currentTarget as HTMLElement).style.color = "var(--muted)"
							}}
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
				</div>

				{/* Summary bar */}
				{totals && totals.totalCount > 0 && (
					<div
						style={{
							display: "flex",
							gap: 20,
							padding: "10px 16px",
							borderBottom: "1px solid var(--border-muted)",
							background: "var(--bg-surface)",
							flexShrink: 0,
						}}
					>
						<SummaryItem label="Sessions" value={String(totals.totalCount)} />
						<SummaryItem
							label="Active"
							value={String(totals.activeCount)}
							color={totals.activeCount > 0 ? "var(--warning)" : undefined}
						/>
						<SummaryItem
							label="Input"
							value={formatTokens(totals.promptTokens)}
						/>
						<SummaryItem
							label="Output"
							value={formatTokens(totals.completionTokens)}
						/>
						<SummaryItem
							label="Total tokens"
							value={formatTokens(totals.totalTokens)}
						/>
						<SummaryItem
							label="Est. cost"
							value={formatCost(totals.estimatedCost)}
							color="var(--accent)"
						/>
					</div>
				)}

				{/* Agent list */}
				<div
					style={{
						flex: 1,
						overflowY: "auto",
						padding: "14px 16px",
						background: "var(--bg)",
					}}
				>
					{loading && (
						<div
							style={{
								color: "var(--muted)",
								fontSize: 12,
								padding: "40px 0",
								textAlign: "center",
							}}
						>
							Loading...
						</div>
					)}

					{!loading && sorted.length === 0 && (
						<div style={{ padding: "60px 0", textAlign: "center" }}>
							<div
								style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}
							>
								No agent sessions
							</div>
							<div style={{ fontSize: 12, color: "var(--dim)" }}>
								Create a worktree and start an agent to see it here.
							</div>
						</div>
					)}

					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{sorted.map((agent) => {
							const branchColor = hashColor(
								agent.gitBranch || agent.projectName,
							)
							const modelShort = extractModelShort(agent.modelId)
							const modeKey = agent.modeId ?? "react"
							const modeDisplayName = modeDisplayNames[modeKey] ?? modeKey
							const modeColor = modeColors[modeKey] ?? "var(--accent)"
							const isThinkingOn = Boolean(
								agent.thinkingLevel && agent.thinkingLevel !== "off",
							)
							const thinkingLabel = formatThinkingLevel(agent.thinkingLevel)

							return (
								<button
									key={agent.worktreePath}
									onClick={() => onSwitchToAgent(agent.worktreePath)}
									onMouseEnter={() => setHoveredAgent(agent.worktreePath)}
									onMouseLeave={() => setHoveredAgent(null)}
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 8,
										padding: "12px 14px",
										background:
											hoveredAgent === agent.worktreePath
												? "var(--bg-elevated)"
												: "var(--bg-surface)",
										border: agent.isCurrentSession
											? "1px solid var(--accent)"
											: "1px solid var(--border-muted)",
										borderRadius: 8,
										cursor: "pointer",
										textAlign: "left",
										transition: "background 0.1s",
									}}
								>
									{/* Row 1: Status + Branch + Issue + Model */}
									<div
										style={{ display: "flex", alignItems: "center", gap: 8 }}
									>
										{/* Status indicator */}
										{agent.isActive ? (
											<span
												style={{
													width: 10,
													height: 10,
													flexShrink: 0,
													display: "inline-block",
													borderRadius: "50%",
													border: "2px solid transparent",
													borderTopColor: branchColor,
													borderRightColor: branchColor,
													animation: "dash-spin 0.8s linear infinite",
												}}
											/>
										) : (
											<span
												style={{
													width: 10,
													height: 10,
													borderRadius: "50%",
													background: branchColor,
													flexShrink: 0,
													opacity: 0.6,
												}}
											/>
										)}

										{/* Branch name */}
										<span
											style={{
												fontSize: 13,
												fontWeight: 600,
												color: "var(--text)",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												flex: 1,
												minWidth: 0,
											}}
										>
											{agent.gitBranch || agent.projectName}
										</span>

										{/* Linked issue */}
										{agent.linkedIssue && (
											<span
												style={{
													fontSize: 9,
													color: "var(--issue)",
													background:
														"color-mix(in srgb, var(--issue) 10%, transparent)",
													padding: "1px 6px",
													borderRadius: 3,
													border:
														"1px solid color-mix(in srgb, var(--issue) 20%, transparent)",
													fontFamily: "monospace",
													fontWeight: 500,
													flexShrink: 0,
												}}
											>
												{agent.linkedIssue.identifier}
											</span>
										)}

										{/* Status badge */}
										<span
											style={{
												fontSize: 9,
												fontWeight: 600,
												color: agent.isActive
													? "var(--warning)"
													: "var(--muted)",
												background: agent.isActive
													? "color-mix(in srgb, var(--warning) 10%, transparent)"
													: "color-mix(in srgb, var(--muted) 10%, transparent)",
												padding: "1px 5px",
												borderRadius: 3,
												flexShrink: 0,
											}}
										>
											{agent.isActive ? "Running" : "Idle"}
										</span>

										{/* Current badge */}
										{agent.isCurrentSession && (
											<span
												style={{
													fontSize: 9,
													fontWeight: 600,
													color: "var(--accent)",
													background: "var(--accent)18",
													padding: "1px 5px",
													borderRadius: 3,
													flexShrink: 0,
												}}
											>
												Current
											</span>
										)}
									</div>

									{/* Row 2: Task */}
									{agent.currentTask && (
										<div
											style={{
												fontSize: 12,
												color: "var(--muted)",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												paddingLeft: 18,
											}}
										>
											{agent.currentTask}
										</div>
									)}

									{/* Row 3: Model, Mode, Thinking & Metrics */}
									<div
										style={{
											display: "flex",
											alignItems: "center",
											flexWrap: "wrap",
											gap: 10,
											paddingLeft: 18,
											fontSize: 11,
											color: "var(--dim)",
										}}
									>
										{/* Model */}
										<span
											style={{
												fontFamily: "monospace",
												color: "var(--text)",
												fontWeight: 500,
											}}
										>
											{modelShort}
										</span>

										{/* Mode Badge */}
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 4,
												padding: "1px 6px",
												borderRadius: 4,
												fontSize: 10,
												fontWeight: 600,
												color: modeColor,
												background: `color-mix(in srgb, ${modeColor} 10%, transparent)`,
												border: `1px solid color-mix(in srgb, ${modeColor} 20%, transparent)`,
											}}
										>
											{modeDisplayName}
										</span>

										{/* Thinking Level */}
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 4,
												padding: "1px 6px",
												borderRadius: 4,
												fontSize: 10,
												fontWeight: 500,
												color: isThinkingOn
													? "var(--thinking-accent)"
													: "var(--dim)",
												background: isThinkingOn
													? "color-mix(in srgb, var(--thinking-accent) 10%, transparent)"
													: "transparent",
												border: isThinkingOn
													? "1px solid color-mix(in srgb, var(--thinking-accent) 20%, transparent)"
													: "1px solid var(--border-muted)",
											}}
										>
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21h6" />
											</svg>
											Thinking: {thinkingLabel}
										</span>

										<div style={{ flex: 1 }} />

										{/* Duration */}
										{(agent.totalDurationMs > 0 || agent.startedAt) && (
											<span>
												<LiveDuration
													startedAt={agent.startedAt}
													baseDurationMs={agent.totalDurationMs}
												/>
											</span>
										)}

										{/* Tokens */}
										{agent.tokenUsage.totalTokens > 0 && (
											<span style={{ fontFamily: "monospace" }}>
												{formatTokens(agent.tokenUsage.totalTokens)} tokens
											</span>
										)}

										{/* Cost */}
										{agent.estimatedCost > 0 && (
											<span
												style={{
													fontFamily: "monospace",
													color: "var(--accent)",
												}}
											>
												{formatCost(agent.estimatedCost)}
											</span>
										)}
									</div>
								</button>
							)
						})}
					</div>
				</div>
			</div>
		</div>
	)
}

function SummaryItem({
	label,
	value,
	color,
}: {
	label: string
	value: string
	color?: string
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<span
				style={{
					fontSize: 10,
					color: "var(--dim)",
					textTransform: "uppercase",
					letterSpacing: "0.3px",
				}}
			>
				{label}
			</span>
			<span
				style={{
					fontSize: 14,
					fontWeight: 600,
					color: color ?? "var(--text)",
					fontFamily: "monospace",
				}}
			>
				{value}
			</span>
		</div>
	)
}
