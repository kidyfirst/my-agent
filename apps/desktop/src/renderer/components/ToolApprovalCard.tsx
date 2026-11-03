import React, { useState, useEffect, useCallback, useMemo } from "react"

export interface PendingApprovalData {
	threadId?: string
	toolCallId: string
	toolName: string
	args: unknown
	category?: string | null
	categoryLabel?: string | null
}

export interface ToolApprovalCardProps {
	approval: PendingApprovalData
	onRespond: (options: {
		decision: "approve" | "decline"
		scope: "once" | "conversation" | "project" | "global"
		toolCallId: string
		threadId?: string
		toolName?: string
		category?: string | null
		args?: unknown
	}) => void
	onDecline?: () => void
}

function extractCommandInfo(args: unknown): {
	commandText: string
	url?: string
} {
	if (args && typeof args === "object") {
		const obj = args as Record<string, unknown>
		if (typeof obj.command === "string") {
			const cmd = obj.command
			const urlMatch = cmd.match(/https?:\/\/[^\s'"]+/)
			return { commandText: cmd, url: urlMatch ? urlMatch[0] : undefined }
		}
		if (typeof obj.cmd === "string") {
			const cmd = obj.cmd
			const urlMatch = cmd.match(/https?:\/\/[^\s'"]+/)
			return { commandText: cmd, url: urlMatch ? urlMatch[0] : undefined }
		}
	}
	if (typeof args === "string") {
		const urlMatch = args.match(/https?:\/\/[^\s'"]+/)
		return { commandText: args, url: urlMatch ? urlMatch[0] : undefined }
	}
	try {
		return { commandText: JSON.stringify(args, null, 2) }
	} catch {
		return { commandText: String(args) }
	}
}

function getActionTitle(toolName: string, args: unknown): string {
	if (args && typeof args === "object") {
		const obj = args as Record<string, unknown>
		if (typeof obj.command === "string") {
			const cmd = obj.command.trim()
			const createProjMatch = cmd.match(/projects\/create.*?"name":"([^"]+)"/)
			if (createProjMatch) {
				return `Allow a2a create project ${createProjMatch[1]}?`
			}
			const a2aMethodMatch = cmd.match(/"method":"([^"]+)"/)
			if (a2aMethodMatch) {
				return `Allow a2a ${a2aMethodMatch[1]}?`
			}
			const words = cmd.split(/\s+/)
			const firstWord = words[0]
			if (
				["git", "npm", "pnpm", "yarn", "curl", "python", "node", "sh", "bash"].includes(
					firstWord,
				)
			) {
				const shortCmd = words.slice(0, 3).join(" ")
				return `Allow ${shortCmd}?`
			}
		}
	}
	const readable = toolName.replace(/_/g, " ")
	return `Allow ${readable}?`
}

function getActionDescription(
	toolName: string,
	args: unknown,
	category?: string | null,
	categoryLabel?: string | null,
): string {
	if (args && typeof args === "object") {
		const obj = args as Record<string, unknown>
		if (typeof obj.description === "string" && obj.description) {
			return obj.description
		}
		if (typeof obj.command === "string") {
			if (
				obj.command.includes("127.0.0.1") ||
				obj.command.includes("localhost") ||
				obj.command.includes("/a2a")
			) {
				return "Calls a local server not spawned in this session to create a new project directory outside the workspace."
			}
			return "Executes a shell command in the system terminal environment."
		}
	}
	if (categoryLabel) {
		return `${categoryLabel} tool execution requires your permission.`
	}
	if (category) {
		return `${category} operation requires your permission.`
	}
	return "This action requires your confirmation before proceeding."
}

function renderCodeTokens(text: string) {
	// Simple syntax styling: highlight curl, flags, URLs, strings
	const tokens = text.split(/([A-Za-z0-9_-]+:|https?:\/\/[^\s'"]+|-[a-zA-Z0-9-]+|'[^']*'|"[^"]*"|\bcurl\b)/g)

	return tokens.map((part, index) => {
		if (part === "curl") {
			return (
				<span key={index} style={{ color: "var(--error)", fontWeight: 600 }}>
					{part}
				</span>
			)
		}
		if (part.startsWith("-")) {
			return (
				<span key={index} style={{ color: "var(--warning)", fontWeight: 500 }}>
					{part}
				</span>
			)
		}
		if (part.startsWith("http://") || part.startsWith("https://")) {
			return (
				<span key={index} style={{ color: "var(--accent)", textDecoration: "underline" }}>
					{part}
				</span>
			)
		}
		if ((part.startsWith("'") && part.endsWith("'")) || (part.startsWith('"') && part.endsWith('"'))) {
			return (
				<span key={index} style={{ color: "var(--success)" }}>
					{part}
				</span>
			)
		}
		return <span key={index}>{part}</span>
	})
}

function truncateMiddle(text: string, maxLen = 36): string {
	const cleaned = text.trim().replace(/\s+/g, " ")
	if (cleaned.length <= maxLen) return cleaned

	const ellipsis = "..."
	const keep = maxLen - ellipsis.length
	let headLen = Math.ceil(keep / 2)
	let tailLen = Math.floor(keep / 2)

	// Snap head to space or path separator if close
	const headSlice = cleaned.slice(0, headLen)
	const lastHeadSep = Math.max(
		headSlice.lastIndexOf(" "),
		headSlice.lastIndexOf("/"),
	)
	if (lastHeadSep > headLen - 6 && lastHeadSep > 6) {
		headLen = lastHeadSep
	}

	// Snap tail to space or path separator if close
	const tailStart = cleaned.length - tailLen
	const tailSlice = cleaned.slice(tailStart)
	const firstTailSep = tailSlice.search(/[\s/]/)
	if (firstTailSep > 0 && firstTailSep < 6) {
		tailLen -= firstTailSep + 1
	}

	const head = cleaned.slice(0, headLen).trim()
	const tail = cleaned.slice(cleaned.length - tailLen).trim()
	return `${head}${ellipsis}${tail}`
}

function renderActionText(
	commandText: string,
	url?: string,
) {
	// If URL exists, render with clickable-look icon
	if (url && commandText.includes(url)) {
		const parts = commandText.split(url)
		return (
			<>
				{parts[0]}
				<span style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 2 }}>
					{url}
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
						<line x1="7" y1="17" x2="17" y2="7" />
						<polyline points="7 7 17 7 17 17" />
					</svg>
				</span>
				{parts.slice(1).join(url)}
			</>
		)
	}
	return commandText
}

export function ToolApprovalCard({
	approval,
	onRespond,
	onDecline,
}: ToolApprovalCardProps) {
	const [selectedOption, setSelectedOption] = useState<number>(1)
	const [hoveredOption, setHoveredOption] = useState<number | null>(null)

	const { commandText, url } = useMemo(
		() => extractCommandInfo(approval.args),
		[approval.args],
	)

	const displayCommand = useMemo(
		() => truncateMiddle(commandText, 36),
		[commandText],
	)

	const title = useMemo(
		() => getActionTitle(approval.toolName, approval.args),
		[approval.toolName, approval.args],
	)

	const description = useMemo(
		() =>
			getActionDescription(
				approval.toolName,
				approval.args,
				approval.category,
				approval.categoryLabel,
			),
		[approval.toolName, approval.args, approval.category, approval.categoryLabel],
	)

	const executeOption = useCallback(
		(optionIndex: number) => {
			if (optionIndex === 1) {
				onRespond({
					decision: "approve",
					scope: "once",
					toolCallId: approval.toolCallId,
					threadId: approval.threadId,
					toolName: approval.toolName,
					category: approval.category,
					args: approval.args,
				})
			} else if (optionIndex === 2) {
				onRespond({
					decision: "approve",
					scope: "conversation",
					toolCallId: approval.toolCallId,
					threadId: approval.threadId,
					toolName: approval.toolName,
					category: approval.category,
					args: approval.args,
				})
			} else if (optionIndex === 3) {
				onRespond({
					decision: "approve",
					scope: "project",
					toolCallId: approval.toolCallId,
					threadId: approval.threadId,
					toolName: approval.toolName,
					category: approval.category,
					args: approval.args,
				})
			} else if (optionIndex === 4) {
				onRespond({
					decision: "approve",
					scope: "global",
					toolCallId: approval.toolCallId,
					threadId: approval.threadId,
					toolName: approval.toolName,
					category: approval.category,
					args: approval.args,
				})
			} else if (optionIndex === 5) {
				onRespond({
					decision: "decline",
					scope: "once",
					toolCallId: approval.toolCallId,
					threadId: approval.threadId,
					toolName: approval.toolName,
					category: approval.category,
					args: approval.args,
				})
				onDecline?.()
			}
		},
		[approval, onRespond, onDecline],
	)

	const handleSkip = useCallback(() => {
		onRespond({
			decision: "decline",
			scope: "once",
			toolCallId: approval.toolCallId,
			threadId: approval.threadId,
			toolName: approval.toolName,
			category: approval.category,
			args: approval.args,
		})
		onDecline?.()
	}, [approval, onRespond, onDecline])

	const handleSubmit = useCallback(() => {
		executeOption(selectedOption)
	}, [executeOption, selectedOption])

	// Listen for keyboard hotkeys (1-5, Enter, Escape) ONLY when user is NOT typing in an input/textarea
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null
			const tag = target?.tagName
			if (
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				target?.isContentEditable
			) {
				return
			}

			if (e.key === "1") {
				e.preventDefault()
				setSelectedOption(1)
			} else if (e.key === "2") {
				e.preventDefault()
				setSelectedOption(2)
			} else if (e.key === "3") {
				e.preventDefault()
				setSelectedOption(3)
			} else if (e.key === "4") {
				e.preventDefault()
				setSelectedOption(4)
			} else if (e.key === "5" || e.key === "n" || e.key === "N") {
				e.preventDefault()
				setSelectedOption(5)
			} else if (e.key === "Enter") {
				e.preventDefault()
				handleSubmit()
			} else if (e.key === "Escape") {
				e.preventDefault()
				handleSkip()
			}
		}

		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [handleSubmit, handleSkip])

	const optionLabels = [
		{
			num: 1,
			label: "Yes, allow this time",
			title: "Yes, allow this time",
			isNo: false,
		},
		{
			num: 2,
			label: (
				<>
					Yes, and always allow &apos;{renderActionText(displayCommand, url)}&apos;{" "}
					<span style={{ whiteSpace: "nowrap" }}>in this conversation</span>
				</>
			),
			title: `Yes, and always allow '${commandText}' in this conversation`,
			isNo: false,
		},
		{
			num: 3,
			label: (
				<>
					Yes, and always allow &apos;{renderActionText(displayCommand, url)}&apos;{" "}
					<span style={{ whiteSpace: "nowrap" }}>in this project</span>
				</>
			),
			title: `Yes, and always allow '${commandText}' in this project`,
			isNo: false,
		},
		{
			num: 4,
			label: (
				<>
					Yes, and always allow &apos;{renderActionText(displayCommand, url)}&apos;
				</>
			),
			title: `Yes, and always allow '${commandText}'`,
			isNo: false,
		},
		{
			num: 5,
			label: (
				<>
					No <span style={{ color: "var(--muted)", fontWeight: 400 }}>(tell the agent what to do instead)</span>
				</>
			),
			title: "No (tell the agent what to do instead)",
			isNo: true,
		},
	]

	return (
		<div
			data-testid="tool-approval-card"
			style={{
				position: "relative",
				background: "var(--bg)",
				border: "1px solid var(--border)",
				borderRadius: 14,
				padding: "16px 20px 14px 20px",
				marginBottom: 12,
				boxShadow: "var(--shadow-popover)",
				zIndex: 10,
				display: "flex",
				flexDirection: "column",
				minHeight: 0,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					gap: 10,
					marginBottom: 4,
					flexShrink: 0,
				}}
			>
				{/* Tool icon with dot */}
				<div
					style={{
						width: 22,
						height: 22,
						borderRadius: 6,
						background: "var(--bg-surface)",
						border: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--text)",
						flexShrink: 0,
						marginTop: 1,
						position: "relative",
					}}
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="4 17 10 11 4 5" />
						<line x1="12" y1="19" x2="20" y2="19" />
					</svg>
					<span
						style={{
							position: "absolute",
							top: -2,
							right: -2,
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: "var(--accent)",
						}}
					/>
				</div>

				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							fontSize: 14,
							fontWeight: 600,
							color: "var(--text)",
							lineHeight: 1.3,
						}}
					>
						{title}
					</div>
					<div
						style={{
							fontSize: 12,
							color: "var(--muted)",
							lineHeight: 1.4,
							marginTop: 3,
						}}
					>
						{description}
					</div>
				</div>
			</div>

			<div
				style={{
					minHeight: 0,
				}}
			>
				{/* Code block preview */}
				<div
					title={commandText}
					style={{
						background: "var(--bg-surface)",
						border: "1px solid var(--border-muted)",
						borderRadius: 8,
						padding: "10px 14px",
						margin: "12px 0 14px 0",
						fontFamily: "Fira Code, SF Mono, Consolas, monospace",
						fontSize: 12,
						lineHeight: 1.5,
						color: "var(--tool-output, var(--text))",
						maxHeight: 160,
						overflowY: "auto",
						overscrollBehavior: "contain",
						wordBreak: "break-all",
						whiteSpace: "pre-wrap",
					}}
				>
					{renderCodeTokens(commandText)}
				</div>

				{/* 5 Options */}
				<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
					{optionLabels.map((opt) => {
						const isSelected = selectedOption === opt.num
						const isHovered = hoveredOption === opt.num

						return (
							<div
								key={opt.num}
								role="button"
								tabIndex={0}
								title={opt.title}
								onClick={() => {
									setSelectedOption(opt.num)
									executeOption(opt.num)
								}}
								onMouseEnter={() => setHoveredOption(opt.num)}
								onMouseLeave={() => setHoveredOption(null)}
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: 10,
									padding: "6px 10px",
									borderRadius: 8,
									cursor: "pointer",
									background: isSelected
										? "var(--selected-bg)"
										: isHovered
											? "var(--bg-hover)"
											: "transparent",
									transition: "background 0.12s ease",
									userSelect: "none",
								}}
							>
								{/* Number badge */}
								<div
									style={{
										width: 20,
										height: 20,
										borderRadius: 4,
										background: "var(--bg-surface)",
										border: "1px solid var(--border-muted)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: 11,
										fontWeight: 600,
										color: "var(--muted)",
										flexShrink: 0,
										marginTop: 1,
									}}
								>
									{opt.num}
								</div>

								{/* Label */}
								<div
									title={opt.title}
									style={{
										fontSize: 13,
										fontWeight: opt.isNo ? 500 : isSelected ? 500 : 400,
										color: "var(--text)",
										lineHeight: 1.45,
										flex: 1,
										minWidth: 0,
										wordBreak: "break-word",
									}}
								>
									{opt.label}
								</div>
							</div>
						)
					})}
				</div>
			</div>

			{/* Footer: Skip & Submit */}
			<div
				style={{
					display: "flex",
					justifyContent: "flex-end",
					alignItems: "center",
					gap: 12,
					marginTop: 12,
					paddingTop: 8,
					flexShrink: 0,
				}}
			>
				<button
					type="button"
					onClick={handleSkip}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--muted)",
						fontSize: 13,
						fontWeight: 500,
						padding: "6px 14px",
						borderRadius: 6,
						cursor: "pointer",
						transition: "color 0.15s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = "var(--text)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = "var(--muted)"
					}}
				>
					Skip
				</button>

				<button
					type="button"
					onClick={handleSubmit}
					style={{
						background: "var(--accent)",
						color: "var(--on-accent)",
						border: "none",
						borderRadius: 6,
						padding: "6px 18px",
						fontSize: 13,
						fontWeight: 500,
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						boxShadow: "var(--shadow-popover)",
					}}
				>
					Submit ↵
				</button>
			</div>
		</div>
	)
}
