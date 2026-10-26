import { useState, useEffect, useCallback, useMemo } from "react"
import type { TokenUsage, Message } from "../types/ipc"
import type { ToolState } from "../types/chat"

interface ContextFile {
	path: string
	content: string
	scope: "global" | "project"
	fileName: string
}

export interface SessionFileInfo {
	path: string
	fileName: string
	relPath: string
	status: "modified" | "read" | "open"
	additions?: number
	deletions?: number
}

export interface ContextPanelProps {
	onFileClick?: (filePath: string) => void
	projectName?: string
	projectPath?: string | null
	gitBranch?: string
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

type ViewFilter = "all" | "session" | "files" | "instructions" | "prompt"

export function ContextPanel({
	onFileClick,
	projectName = "",
	projectPath = null,
	gitBranch = "",
	currentThreadId = null,
	threadTitle = "Current Session",
	currentThreadModelId = "deepseek-v4-pro",
	currentThreadPermission = "default",
	modeId = "build",
	tokenUsage,
	messages = [],
	tools,
	openFiles = [],
	tasks = [],
}: ContextPanelProps) {
	const [filter, setFilter] = useState<ViewFilter>("all")
	const [files, setFiles] = useState<ContextFile[]>([])
	const [loadingFiles, setLoadingFiles] = useState(true)
	const [expandedFile, setExpandedFile] = useState<string | null>(null)
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editContent, setEditContent] = useState("")
	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
		"idle",
	)

	// Dynamic prompt preview
	const [activePrompt, setActivePrompt] = useState<string>("")
	const [loadingPrompt, setLoadingPrompt] = useState(false)
	const [promptCopied, setPromptCopied] = useState(false)
	const [isPromptExpanded, setIsPromptExpanded] = useState(false)

	// Collapsible section state
	const [openSections, setOpenSections] = useState({
		session: true,
		files: true,
		tasks: true,
		instructions: true,
		prompt: false,
	})

	const toggleSection = useCallback((sec: keyof typeof openSections) => {
		setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }))
	}, [])

	// Load AGENT.md / CLAUDE.md files
	const loadContextFiles = useCallback(async () => {
		setLoadingFiles(true)
		try {
			const result = (await window.api.invoke({
				type: "getContextFiles",
			})) as ContextFile[]
			setFiles(result ?? [])
		} catch {
			// ignore
		} finally {
			setLoadingFiles(false)
		}
	}, [])

	// Load active system prompt
	const loadActivePrompt = useCallback(async () => {
		setLoadingPrompt(true)
		try {
			const result = (await window.api.invoke({
				type: "getActivePrompt",
			})) as { prompt?: string }
			if (result?.prompt) {
				setActivePrompt(result.prompt)
			}
		} catch {
			// ignore
		} finally {
			setLoadingPrompt(false)
		}
	}, [])

	const handleRefreshAll = useCallback(() => {
		loadContextFiles()
		loadActivePrompt()
	}, [loadContextFiles, loadActivePrompt])

	useEffect(() => {
		loadContextFiles()
		loadActivePrompt()
	}, [loadContextFiles, loadActivePrompt])

	const handleStartEdit = useCallback((file: ContextFile) => {
		setEditingPath(file.path)
		setEditContent(file.content)
		setExpandedFile(file.path)
	}, [])

	const handleSave = useCallback(
		async (filePath: string) => {
			setSaveStatus("saving")
			try {
				await window.api.invoke({
					type: "writeContextFile",
					filePath,
					content: editContent,
				})
				setSaveStatus("saved")
				setEditingPath(null)
				await loadContextFiles()
				await loadActivePrompt()
				setTimeout(() => setSaveStatus("idle"), 1500)
			} catch {
				setSaveStatus("idle")
			}
		},
		[editContent, loadContextFiles, loadActivePrompt],
	)

	const handleCopyPrompt = useCallback(() => {
		if (!activePrompt) return
		navigator.clipboard.writeText(activePrompt)
		setPromptCopied(true)
		setTimeout(() => setPromptCopied(false), 2000)
	}, [activePrompt])

	// Extract files in context from messages, tools, and open editor tabs
	const sessionFiles = useMemo(() => {
		const map = new Map<string, SessionFileInfo>()

		const normalizeRel = (rawPath: string) => {
			if (!rawPath) return ""
			let p = rawPath.replace(/\\/g, "/")
			if (projectPath) {
				const normRoot = projectPath.replace(/\\/g, "/").replace(/\/$/, "")
				if (p.startsWith(normRoot)) {
					p = p.slice(normRoot.length).replace(/^\/+/, "")
				}
			}
			return p
		}

		// 1. Files modified from message.changedFiles
		for (const msg of messages) {
			if (msg.changedFiles && Array.isArray(msg.changedFiles)) {
				for (const cf of msg.changedFiles) {
					const fpath = typeof cf === "string" ? cf : cf.path
					if (!fpath) continue
					const rel = normalizeRel(fpath)
					const fileName = rel.split("/").pop() || rel
					map.set(fpath, {
						path: fpath,
						fileName,
						relPath: rel,
						status: "modified",
						additions: typeof cf === "object" ? cf.added : undefined,
						deletions: typeof cf === "object" ? cf.deleted : undefined,
					})
				}
			}
		}

		// 2. Files from tools
		if (tools) {
			for (const tool of tools.values()) {
				const args = tool.args as any
				const targetPath =
					args?.Path ||
					args?.path ||
					args?.filePath ||
					args?.file_path ||
					args?.targetPath
				if (typeof targetPath === "string" && targetPath.trim()) {
					const fpath = targetPath.trim()
					const isModify =
						tool.name === "edit_file" ||
						tool.name === "write_file" ||
						tool.name === "create_file"
					const status: "modified" | "read" = isModify ? "modified" : "read"
					const existing = map.get(fpath)
					if (!existing || (existing.status !== "modified" && isModify)) {
						const rel = normalizeRel(fpath)
						const fileName = rel.split("/").pop() || rel
						map.set(fpath, {
							path: fpath,
							fileName,
							relPath: rel,
							status,
						})
					}
				}
			}
		}

		// 3. Open files in editor tabs
		for (const op of openFiles) {
			if (!op || op.startsWith("diff:") || op.startsWith("thread:")) continue
			if (!map.has(op)) {
				const rel = normalizeRel(op)
				const fileName = rel.split("/").pop() || rel
				map.set(op, {
					path: op,
					fileName,
					relPath: rel,
					status: "open",
				})
			}
		}

		return Array.from(map.values())
	}, [messages, tools, openFiles, projectPath])

	// Stats
	const userTurns = useMemo(
		() => messages.filter((m) => m.role === "user").length,
		[messages],
	)
	const assistantTurns = useMemo(
		() => messages.filter((m) => m.role === "assistant").length,
		[messages],
	)
	const toolsCount = useMemo(() => (tools ? tools.size : 0), [tools])

	// Context window limit calculation
	const modelCapacity = useMemo(() => {
		const lower = currentThreadModelId.toLowerCase()
		if (lower.includes("gemini")) return 1000000
		if (lower.includes("claude")) return 200000
		if (lower.includes("deepseek")) return 128000
		return 128000
	}, [currentThreadModelId])

	const currentTokens = tokenUsage?.totalTokens ?? 0
	const promptTokens = tokenUsage?.promptTokens ?? 0
	const completionTokens = tokenUsage?.completionTokens ?? 0
	const usagePercent = Math.min(
		100,
		Math.max(0, (currentTokens / modelCapacity) * 100),
	)

	return (
		<div
			style={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				background: "var(--bg-surface)",
				fontSize: 11,
			}}
		>
			{/* Top Header & Filters */}
			<div
				style={{
					padding: "8px 12px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
					background: "var(--bg-surface)",
				}}
			>
				{/* Segmented Filter Pills */}
				<div
					style={{
						display: "flex",
						gap: 3,
						background: "var(--bg-elevated)",
						padding: 2,
						borderRadius: 5,
						border: "1px solid var(--border-muted)",
					}}
				>
					{(
						[
							{ id: "all", label: "All" },
							{ id: "session", label: "Session" },
							{ id: "files", label: "Files" },
							{ id: "instructions", label: "Rules" },
							{ id: "prompt", label: "Prompt" },
						] as const
					).map((tab) => (
						<button
							key={tab.id}
							onClick={() => setFilter(tab.id)}
							style={{
								padding: "3px 7px",
								fontSize: 10,
								fontWeight: filter === tab.id ? 600 : 400,
								borderRadius: 3,
								border: "none",
								cursor: "pointer",
								background:
									filter === tab.id ? "var(--bg-surface)" : "transparent",
								color: filter === tab.id ? "var(--text)" : "var(--muted)",
								boxShadow:
									filter === tab.id ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
								transition: "all 0.15s ease",
							}}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Quick Actions */}
				<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<button
						onClick={handleRefreshAll}
						style={{
							fontSize: 11,
							color: "var(--muted)",
							cursor: "pointer",
							padding: "3px 6px",
							background: "transparent",
							border: "1px solid var(--border-muted)",
							borderRadius: 4,
							lineHeight: 1,
						}}
						title="Refresh context"
					>
						&#x21bb;
					</button>
				</div>
			</div>

			{/* Scrollable Content */}
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: filter === "prompt" ? "hidden" : "auto",
					overflowX: "hidden",
					padding: filter === "prompt" ? "8px 10px 10px" : "8px 10px 24px",
					display: "flex",
					flexDirection: "column",
					gap: 10,
				}}
			>
				{/* ======================================================== */}
				{/* 1. SESSION OVERVIEW CARD                                  */}
				{/* ======================================================== */}
				{(filter === "all" || filter === "session") && (
					<div
						style={{
							background: "var(--bg-elevated)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							overflow: "hidden",
							flexShrink: 0,
						}}
					>
						<div
							onClick={() => toggleSection("session")}
							style={{
								padding: openSections.session ? "9px 10px" : "10px 10px 12px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								cursor: "pointer",
								userSelect: "none",
								borderBottom: openSections.session
									? "1px solid var(--border-muted)"
									: "none",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<span
									style={{
										fontSize: 8,
										color: "var(--dim)",
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										lineHeight: 1,
										transform: openSections.session
											? "rotate(90deg)"
											: "rotate(0deg)",
										transition: "transform 0.15s ease",
									}}
								>
									&#9654;
								</span>
								<span
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: "var(--text)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										lineHeight: 1,
									}}
								>
									Session Overview
								</span>
							</div>
							<span
								style={{
									fontSize: 9,
									color: "var(--dim)",
									fontFamily: "monospace",
								}}
							>
								{currentThreadId ? `#${currentThreadId.slice(0, 8)}` : "local"}
							</span>
						</div>

						{openSections.session && (
							<div
								style={{
									padding: "10px",
									display: "flex",
									flexDirection: "column",
									gap: 8,
								}}
							>
								{/* Thread & Model Details */}
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 4,
									}}
								>
									<div
										style={{
											fontSize: 12,
											fontWeight: 600,
											color: "var(--text)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
										title={threadTitle}
									>
										{threadTitle}
									</div>
									<div
										style={{
											display: "flex",
											flexWrap: "wrap",
											alignItems: "center",
											gap: 4,
										}}
									>
										<span
											style={{
												fontSize: 10,
												fontWeight: 500,
												color: "var(--accent)",
												background: "var(--accent)" + "15",
												padding: "1px 6px",
												borderRadius: 3,
												fontFamily: "monospace",
											}}
										>
											{currentThreadModelId}
										</span>
										<span
											style={{
												fontSize: 10,
												color: "var(--muted)",
												background: "var(--bg-surface)",
												padding: "1px 5px",
												borderRadius: 3,
												border: "1px solid var(--border-muted)",
												textTransform: "capitalize",
											}}
										>
											{modeId} mode
										</span>
										<span
											style={{
												fontSize: 10,
												color: "var(--muted)",
												background: "var(--bg-surface)",
												padding: "1px 5px",
												borderRadius: 3,
												border: "1px solid var(--border-muted)",
											}}
										>
											{currentThreadPermission}
										</span>
										{gitBranch && (
											<span
												style={{
													fontSize: 10,
													color: "var(--dim)",
													background: "var(--bg-surface)",
													padding: "1px 5px",
													borderRadius: 3,
													border: "1px solid var(--border-muted)",
												}}
											>
												🌿 {gitBranch}
											</span>
										)}
									</div>
								</div>

								{/* Context Window / Token Meter */}
								<div
									style={{
										padding: "8px",
										background: "var(--bg)",
										borderRadius: 4,
										border: "1px solid var(--border-muted)",
										display: "flex",
										flexDirection: "column",
										gap: 6,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
										}}
									>
										<span
											style={{
												fontSize: 10,
												color: "var(--dim)",
												fontWeight: 500,
											}}
										>
											Context Window Usage
										</span>
										<span
											style={{
												fontSize: 10,
												fontWeight: 600,
												color:
													usagePercent > 80
														? "var(--danger, #ef4444)"
														: "var(--text)",
											}}
										>
											{currentTokens.toLocaleString()} /{" "}
											{modelCapacity >= 1000000
												? `${(modelCapacity / 1000000).toFixed(0)}M`
												: `${Math.round(modelCapacity / 1000)}k`}{" "}
											tokens ({usagePercent.toFixed(1)}%)
										</span>
									</div>

									{/* Progress bar */}
									<div
										style={{
											width: "100%",
											height: 5,
											background: "var(--bg-surface)",
											borderRadius: 3,
											overflow: "hidden",
											border: "1px solid var(--border-muted)",
										}}
									>
										<div
											style={{
												height: "100%",
												width: `${Math.max(1, usagePercent)}%`,
												background:
													usagePercent > 80
														? "var(--danger, #ef4444)"
														: usagePercent > 50
															? "var(--warning, #eab308)"
															: "var(--accent)",
												borderRadius: 3,
												transition: "width 0.3s ease",
											}}
										/>
									</div>

									{/* Token breakdown */}
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											fontSize: 9,
											color: "var(--dim)",
										}}
									>
										<span>
											Prompt:{" "}
											<strong style={{ color: "var(--muted)" }}>
												{promptTokens.toLocaleString()}
											</strong>
										</span>
										<span>
											Completion:{" "}
											<strong style={{ color: "var(--muted)" }}>
												{completionTokens.toLocaleString()}
											</strong>
										</span>
									</div>
								</div>

								{/* Conversation Activity Summary */}
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr 1fr",
										gap: 6,
									}}
								>
									<div
										style={{
											padding: "6px 8px",
											background: "var(--bg)",
											borderRadius: 4,
											border: "1px solid var(--border-muted)",
											textAlign: "center",
										}}
									>
										<div
											style={{
												fontSize: 13,
												fontWeight: 600,
												color: "var(--text)",
											}}
										>
											{userTurns + assistantTurns}
										</div>
										<div style={{ fontSize: 9, color: "var(--dim)" }}>
											Turns ({userTurns}U / {assistantTurns}A)
										</div>
									</div>

									<div
										style={{
											padding: "6px 8px",
											background: "var(--bg)",
											borderRadius: 4,
											border: "1px solid var(--border-muted)",
											textAlign: "center",
										}}
									>
										<div
											style={{
												fontSize: 13,
												fontWeight: 600,
												color: "var(--text)",
											}}
										>
											{toolsCount}
										</div>
										<div style={{ fontSize: 9, color: "var(--dim)" }}>
											Tool Calls
										</div>
									</div>

									<div
										style={{
											padding: "6px 8px",
											background: "var(--bg)",
											borderRadius: 4,
											border: "1px solid var(--border-muted)",
											textAlign: "center",
										}}
									>
										<div
											style={{
												fontSize: 13,
												fontWeight: 600,
												color: "var(--text)",
											}}
										>
											{sessionFiles.length}
										</div>
										<div style={{ fontSize: 9, color: "var(--dim)" }}>
											Files Touched
										</div>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{/* ======================================================== */}
				{/* 2. FILES IN CONTEXT                                       */}
				{/* ======================================================== */}
				{(filter === "all" || filter === "files") && (
					<div
						style={{
							background: "var(--bg-elevated)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							overflow: "hidden",
							flexShrink: 0,
						}}
					>
						<div
							onClick={() => toggleSection("files")}
							style={{
								padding: openSections.files ? "9px 10px" : "10px 10px 12px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								cursor: "pointer",
								userSelect: "none",
								borderBottom: openSections.files
									? "1px solid var(--border-muted)"
									: "none",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<span
									style={{
										fontSize: 8,
										color: "var(--dim)",
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										lineHeight: 1,
										transform: openSections.files
											? "rotate(90deg)"
											: "rotate(0deg)",
										transition: "transform 0.15s ease",
									}}
								>
									&#9654;
								</span>
								<span
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: "var(--text)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										lineHeight: 1,
									}}
								>
									Files In Context
								</span>
							</div>
							<span
								style={{
									fontSize: 9,
									fontWeight: 500,
									color: "var(--muted)",
									background: "var(--bg-surface)",
									padding: "1px 6px",
									borderRadius: 10,
									border: "1px solid var(--border-muted)",
								}}
							>
								{sessionFiles.length}
							</span>
						</div>

						{openSections.files && (
							<div style={{ padding: "6px 0" }}>
								{sessionFiles.length === 0 ? (
									<div
										style={{
											padding: "14px 12px",
											textAlign: "center",
											color: "var(--dim)",
											fontSize: 10,
											lineHeight: 1.5,
										}}
									>
										No files referenced in this conversation yet.
										<br />
										Open files in editor tabs or instruct the agent to inspect
										code.
									</div>
								) : (
									sessionFiles.map((sf) => {
										const statusBadge =
											sf.status === "modified" ? (
												<span
													style={{
														fontSize: 9,
														color: "var(--success)",
														background: "var(--success)" + "18",
														padding: "1px 5px",
														borderRadius: 3,
														fontWeight: 500,
													}}
												>
													Modified
													{sf.additions !== undefined &&
													sf.deletions !== undefined
														? ` (+${sf.additions}/-${sf.deletions})`
														: ""}
												</span>
											) : sf.status === "read" ? (
												<span
													style={{
														fontSize: 9,
														color: "var(--accent)",
														background: "var(--accent)" + "18",
														padding: "1px 5px",
														borderRadius: 3,
														fontWeight: 500,
													}}
												>
													Read
												</span>
											) : (
												<span
													style={{
														fontSize: 9,
														color: "var(--dim)",
														background: "var(--bg-surface)",
														padding: "1px 5px",
														borderRadius: 3,
														border: "1px solid var(--border-muted)",
													}}
												>
													Open
												</span>
											)

										return (
											<div
												key={sf.path}
												onClick={() => onFileClick?.(sf.path)}
												style={{
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
													gap: 6,
													padding: "5px 10px",
													cursor: onFileClick ? "pointer" : "default",
													borderBottom: "1px solid var(--border-muted)",
													transition: "background 0.15s ease",
												}}
												onMouseEnter={(e) => {
													e.currentTarget.style.background = "var(--bg-surface)"
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.background = "transparent"
												}}
												title={`Click to open ${sf.path}`}
											>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: 6,
														overflow: "hidden",
														flex: 1,
													}}
												>
													<span style={{ fontSize: 11, flexShrink: 0 }}>
														{sf.status === "modified"
															? "✏️"
															: sf.status === "read"
																? "📖"
																: "📄"}
													</span>
													<div
														style={{
															display: "flex",
															flexDirection: "column",
															overflow: "hidden",
														}}
													>
														<span
															style={{
																fontSize: 11,
																color: "var(--text)",
																fontWeight: 500,
																overflow: "hidden",
																textOverflow: "ellipsis",
																whiteSpace: "nowrap",
															}}
														>
															{sf.fileName}
														</span>
														<span
															style={{
																fontSize: 9,
																color: "var(--dim)",
																fontFamily: "monospace",
																overflow: "hidden",
																textOverflow: "ellipsis",
																whiteSpace: "nowrap",
															}}
														>
															{sf.relPath}
														</span>
													</div>
												</div>
												{statusBadge}
											</div>
										)
									})
								)}
							</div>
						)}
					</div>
				)}

				{/* ======================================================== */}
				{/* 3. ACTIVE TASKS / PLAN CONTEXT                            */}
				{/* ======================================================== */}
				{tasks &&
					tasks.length > 0 &&
					(filter === "all" || filter === "session") && (
						<div
							style={{
								background: "var(--bg-elevated)",
								border: "1px solid var(--border-muted)",
								borderRadius: 6,
								overflow: "hidden",
								flexShrink: 0,
							}}
						>
							<div
								onClick={() => toggleSection("tasks")}
								style={{
									padding: openSections.tasks ? "9px 10px" : "10px 10px 12px",
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									cursor: "pointer",
									userSelect: "none",
									borderBottom: openSections.tasks
										? "1px solid var(--border-muted)"
										: "none",
								}}
							>
								<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
									<span
										style={{
											fontSize: 8,
											color: "var(--dim)",
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											lineHeight: 1,
											transform: openSections.tasks
												? "rotate(90deg)"
												: "rotate(0deg)",
											transition: "transform 0.15s ease",
										}}
									>
										&#9654;
									</span>
									<span
										style={{
											fontSize: 10,
											fontWeight: 600,
											color: "var(--text)",
											textTransform: "uppercase",
											letterSpacing: "0.5px",
											lineHeight: 1,
										}}
									>
										Active Tasks & Plan
									</span>
								</div>
								<span
									style={{
										fontSize: 9,
										fontWeight: 500,
										color: "var(--muted)",
										background: "var(--bg-surface)",
										padding: "1px 6px",
										borderRadius: 10,
										border: "1px solid var(--border-muted)",
									}}
								>
									{tasks.length}
								</span>
							</div>

							{openSections.tasks && (
								<div
									style={{
										padding: "6px 10px",
										display: "flex",
										flexDirection: "column",
										gap: 4,
									}}
								>
									{tasks.map((task, idx) => {
										const isDone = task.status === "completed"
										const isInProgress = task.status === "in_progress"
										return (
											<div
												key={idx}
												style={{
													display: "flex",
													alignItems: "flex-start",
													gap: 6,
													fontSize: 10,
													color: isDone ? "var(--muted)" : "var(--text)",
													textDecoration: isDone ? "line-through" : "none",
													padding: "3px 0",
												}}
											>
												<span
													style={{
														color: isDone
															? "var(--success)"
															: isInProgress
																? "var(--accent)"
																: "var(--dim)",
														fontWeight: "bold",
														flexShrink: 0,
													}}
												>
													{isDone ? "✓" : isInProgress ? "▸" : "○"}
												</span>
												<span style={{ flex: 1, wordBreak: "break-word" }}>
													{task.content}
												</span>
											</div>
										)
									})}
								</div>
							)}
						</div>
					)}

				{/* ======================================================== */}
				{/* 4. INSTRUCTION FILES (AGENT.MD / CLAUDE.MD)               */}
				{/* ======================================================== */}
				{(filter === "all" || filter === "instructions") && (
					<div
						style={{
							background: "var(--bg-elevated)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							overflow: "hidden",
							flexShrink: 0,
						}}
					>
						<div
							onClick={() => toggleSection("instructions")}
							style={{
								padding: openSections.instructions
									? "9px 10px"
									: "10px 10px 12px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								cursor: "pointer",
								userSelect: "none",
								borderBottom: openSections.instructions
									? "1px solid var(--border-muted)"
									: "none",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<span
									style={{
										fontSize: 8,
										color: "var(--dim)",
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										lineHeight: 1,
										transform: openSections.instructions
											? "rotate(90deg)"
											: "rotate(0deg)",
										transition: "transform 0.15s ease",
									}}
								>
									&#9654;
								</span>
								<span
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: "var(--text)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										lineHeight: 1,
									}}
								>
									Agent Instructions
								</span>
							</div>
							<span
								style={{
									fontSize: 9,
									fontWeight: 500,
									color: "var(--muted)",
									background: "var(--bg-surface)",
									padding: "1px 6px",
									borderRadius: 10,
									border: "1px solid var(--border-muted)",
								}}
							>
								{files.length}
							</span>
						</div>

						{openSections.instructions && (
							<div>
								{loadingFiles ? (
									<div
										style={{
											padding: 14,
											textAlign: "center",
											color: "var(--muted)",
											fontSize: 10,
										}}
									>
										Loading instruction files...
									</div>
								) : files.length === 0 ? (
									<div
										style={{
											padding: "16px 14px",
											textAlign: "center",
											color: "var(--dim)",
											fontSize: 10,
											lineHeight: 1.6,
										}}
									>
										<div style={{ marginBottom: 4, fontWeight: 500 }}>
											No instruction files found.
										</div>
										<div style={{ color: "var(--muted)" }}>
											Add an <code>AGENT.md</code> or <code>CLAUDE.md</code>{" "}
											file in your project root or home directory to provide
											persistent instructions.
										</div>
									</div>
								) : (
									files.map((file) => {
										const isExpanded = expandedFile === file.path
										const isEditing = editingPath === file.path
										return (
											<div
												key={file.path}
												style={{
													borderBottom: "1px solid var(--border-muted)",
												}}
											>
												{/* File Header */}
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: 6,
														padding: isExpanded ? "6px 10px" : "7px 10px 8px",
														cursor: "pointer",
													}}
													onClick={() =>
														setExpandedFile(isExpanded ? null : file.path)
													}
												>
													<span
														style={{
															fontSize: 8,
															color: "var(--dim)",
															display: "inline-flex",
															alignItems: "center",
															justifyContent: "center",
															lineHeight: 1,
															transition: "transform 0.15s ease",
															transform: isExpanded
																? "rotate(90deg)"
																: "rotate(0deg)",
														}}
													>
														&#9654;
													</span>
													<span
														style={{
															fontSize: 11,
															color: "var(--text)",
															fontWeight: 500,
															flex: 1,
														}}
													>
														{file.fileName}
													</span>
													<span
														style={{
															fontSize: 9,
															color:
																file.scope === "global"
																	? "var(--accent)"
																	: "var(--success)",
															background:
																file.scope === "global"
																	? "var(--accent)" + "18"
																	: "var(--success)" + "18",
															padding: "1px 6px",
															borderRadius: 3,
															textTransform: "capitalize",
														}}
													>
														{file.scope}
													</span>
												</div>

												{/* Expanded content */}
												{isExpanded && (
													<div
														style={{
															padding: "8px 10px",
															background: "var(--bg)",
															borderTop: "1px solid var(--border-muted)",
														}}
													>
														<div
															style={{
																fontSize: 9,
																color: "var(--dim)",
																marginBottom: 6,
																fontFamily: "monospace",
																wordBreak: "break-all",
															}}
														>
															{file.path}
														</div>
														{isEditing ? (
															<>
																<textarea
																	value={editContent}
																	onChange={(e) =>
																		setEditContent(e.target.value)
																	}
																	style={{
																		width: "100%",
																		minHeight: 180,
																		background: "var(--bg-elevated)",
																		color: "var(--text)",
																		border: "1px solid var(--border)",
																		borderRadius: 4,
																		padding: "6px 8px",
																		fontSize: 11,
																		fontFamily:
																			"'SF Mono', 'Fira Code', monospace",
																		lineHeight: 1.5,
																		resize: "vertical",
																	}}
																	autoFocus
																/>
																<div
																	style={{
																		display: "flex",
																		gap: 6,
																		marginTop: 6,
																	}}
																>
																	<button
																		onClick={() => handleSave(file.path)}
																		style={{
																			padding: "4px 10px",
																			fontSize: 10,
																			background: "var(--accent)",
																			color: "#fff",
																			borderRadius: 4,
																			border: "none",
																			cursor: "pointer",
																			fontWeight: 500,
																		}}
																	>
																		{saveStatus === "saving"
																			? "Saving..."
																			: "Save"}
																	</button>
																	<button
																		onClick={() => setEditingPath(null)}
																		style={{
																			padding: "4px 10px",
																			fontSize: 10,
																			background: "var(--bg-surface)",
																			color: "var(--muted)",
																			borderRadius: 4,
																			border: "1px solid var(--border-muted)",
																			cursor: "pointer",
																		}}
																	>
																		Cancel
																	</button>
																</div>
															</>
														) : (
															<>
																<pre
																	style={{
																		fontSize: 10,
																		color: "var(--text)",
																		background: "var(--bg-elevated)",
																		padding: "8px 10px 24px",
																		borderRadius: 4,
																		border: "1px solid var(--border-muted)",
																		overflow: "auto",
																		maxHeight: 300,
																		lineHeight: 1.5,
																		whiteSpace: "pre-wrap",
																		wordBreak: "break-word",
																		fontFamily:
																			"'SF Mono', 'Fira Code', monospace",
																		margin: 0,
																	}}
																>
																	{file.content || "(empty file)"}
																</pre>
																<div
																	style={{
																		display: "flex",
																		gap: 6,
																		marginTop: 6,
																	}}
																>
																	<button
																		onClick={() => handleStartEdit(file)}
																		style={{
																			padding: "3px 8px",
																			fontSize: 10,
																			background: "var(--bg-surface)",
																			color: "var(--accent)",
																			borderRadius: 4,
																			border: "1px solid var(--accent)",
																			cursor: "pointer",
																		}}
																	>
																		Edit
																	</button>
																	{onFileClick && (
																		<button
																			onClick={() => onFileClick(file.path)}
																			style={{
																				padding: "3px 8px",
																				fontSize: 10,
																				background: "var(--bg-surface)",
																				color: "var(--muted)",
																				borderRadius: 4,
																				border: "1px solid var(--border-muted)",
																				cursor: "pointer",
																			}}
																		>
																			Open in Editor
																		</button>
																	)}
																</div>
															</>
														)}
													</div>
												)}
											</div>
										)
									})
								)}
							</div>
						)}
					</div>
				)}

				{/* ======================================================== */}
				{/* 5. LIVE SYSTEM PROMPT PREVIEW                             */}
				{/* ======================================================== */}
				{(filter === "all" || filter === "prompt") && (
					<div
						style={{
							background: "var(--bg-elevated)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							overflow: "hidden",
							...(filter === "prompt"
								? {
										flex: 1,
										display: "flex",
										flexDirection: "column",
										minHeight: 0,
									}
								: { flexShrink: 0 }),
						}}
					>
						<div
							onClick={() => {
								if (filter === "prompt") {
									setIsPromptExpanded(!isPromptExpanded)
								} else {
									toggleSection("prompt")
								}
							}}
							style={{
								padding:
									filter === "prompt" || openSections.prompt
										? "9px 10px"
										: "10px 10px 12px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								cursor: "pointer",
								userSelect: "none",
								flexShrink: 0,
								borderBottom:
									filter === "prompt" || openSections.prompt
										? "1px solid var(--border-muted)"
										: "none",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<span
									style={{
										fontSize: 8,
										color: "var(--dim)",
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										lineHeight: 1,
										transform:
											filter === "prompt" || openSections.prompt
												? "rotate(90deg)"
												: "rotate(0deg)",
										transition: "transform 0.15s ease",
									}}
								>
									&#9654;
								</span>
								<span
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: "var(--text)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										lineHeight: 1,
									}}
								>
									Live System Prompt
								</span>
							</div>

							<div
								style={{ display: "flex", alignItems: "center", gap: 6 }}
								onClick={(e) => e.stopPropagation()}
							>
								{activePrompt && (
									<button
										onClick={handleCopyPrompt}
										style={{
											fontSize: 9,
											color: promptCopied ? "var(--success)" : "var(--muted)",
											background: "var(--bg-surface)",
											padding: "2px 6px",
											borderRadius: 3,
											border: "1px solid var(--border-muted)",
											cursor: "pointer",
										}}
									>
										{promptCopied ? "✓ Copied" : "Copy"}
									</button>
								)}
								<span
									style={{
										fontSize: 9,
										color: "var(--dim)",
										fontFamily: "monospace",
									}}
								>
									{activePrompt
										? `${Math.round(activePrompt.length / 4)} tok`
										: ""}
								</span>
							</div>
						</div>

						{(filter === "prompt" || openSections.prompt) && (
							<div
								style={{
									padding: "8px 10px 10px",
									...(filter === "prompt"
										? {
												flex: 1,
												display: "flex",
												flexDirection: "column",
												minHeight: 0,
											}
										: {}),
								}}
							>
								{loadingPrompt ? (
									<div
										style={{
											padding: 12,
											textAlign: "center",
											color: "var(--muted)",
											fontSize: 10,
										}}
									>
										Loading system prompt...
									</div>
								) : activePrompt ? (
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											...(filter === "prompt"
												? {
														flex: 1,
														minHeight: 0,
													}
												: {}),
										}}
									>
										<div
											style={{
												fontSize: 9,
												color: "var(--dim)",
												marginBottom: 6,
												display: "flex",
												justifyContent: "space-between",
												flexShrink: 0,
											}}
										>
											<span>
												Characters: {activePrompt.length.toLocaleString()}
											</span>
											<span>
												Estimated tokens: ~
												{Math.round(activePrompt.length / 4).toLocaleString()}
											</span>
										</div>
										<pre
											style={{
												fontSize: 10,
												color: "var(--muted)",
												background: "var(--bg)",
												padding: "10px 12px 36px",
												borderRadius: 4,
												border: "1px solid var(--border-muted)",
												overflowY: "auto",
												overflowX: "hidden",
												lineHeight: 1.5,
												whiteSpace: "pre-wrap",
												wordBreak: "break-word",
												fontFamily: "'SF Mono', 'Fira Code', monospace",
												margin: 0,
												...(filter === "prompt"
													? {
															flex: 1,
															minHeight: 0,
														}
													: {
															maxHeight: 360,
														}),
											}}
										>
											{activePrompt}
										</pre>
									</div>
								) : (
									<div
										style={{
											padding: 12,
											textAlign: "center",
											color: "var(--dim)",
											fontSize: 10,
										}}
									>
										No active prompt context available.
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
