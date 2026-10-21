import { useRef, useState, useCallback, useEffect, useMemo } from "react"
import {
	useSlashAutocomplete,
	type SlashCommand,
} from "./SlashCommandAutocomplete"
import { MessageQueueBar } from "./MessageQueueBar"
import { useAvailableModels, type ModelInfo } from "./ModelSelector"
import type { AttachedFile, QueuedMessage } from "../types/chat"

export type { AttachedFile }

export type PermissionMode = "default" | "auto-approve" | "read-only"

interface EditorInputProps {
	onSend: (content: string, files?: AttachedFile[]) => void
	onQueue?: (content: string, files?: AttachedFile[]) => void
	onAbort: () => void
	isAgentActive: boolean
	modeId: string
	onBuiltinCommand?: (name: string) => void
	queue?: QueuedMessage[]
	isQueuePaused?: boolean
	onResumeQueue?: () => void
	onSteerQueued?: (item: QueuedMessage) => void
	onDeleteQueued?: (id: string) => void
	onReorderQueue?: (newQueue: QueuedMessage[]) => void
	onClearQueue?: () => void
	currentModelId?: string
	onSelectModel?: (modelId: string) => void
	permissionMode?: PermissionMode
	onSelectPermissionMode?: (mode: PermissionMode) => void
}

function formatModelDisplayName(
	modelId?: string,
	models?: ModelInfo[],
): string {
	if (!modelId) return "Select Model"
	const matched = models?.find((m) => m.id === modelId)
	if (matched?.name) return matched.name
	const id = modelId.toLowerCase()
	if (id.includes("claude-3-7-sonnet")) return "Claude 3.7 Sonnet"
	if (id.includes("claude-3-5-sonnet")) return "Claude 3.5 Sonnet"
	if (id.includes("claude-3-5-haiku")) return "Claude 3.5 Haiku"
	if (id.includes("deepseek-reasoner")) return "DeepSeek R1"
	if (id.includes("deepseek-chat")) return "DeepSeek V3"
	if (id.includes("gemini-3.8-flash")) return "Gemini 3.8 Flash High"
	if (id.includes("gemini-2.5-pro")) return "Gemini 2.5 Pro"
	if (id.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash"
	if (id.includes("gpt-4o-mini")) return "GPT-4o Mini"
	if (id.includes("gpt-4o")) return "GPT-4o"
	if (id.includes("o3-mini")) return "o3-mini"
	if (id.includes("o1")) return "o1"
	const raw = modelId.includes("/") ? modelId.split("/")[1] : modelId
	return raw.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const PERMISSION_OPTIONS: Array<{
	id: PermissionMode
	label: string
	description: string
}> = [
	{
		id: "default",
		label: "Default",
		description: "Ask before file edits or terminal commands",
	},
	{
		id: "auto-approve",
		label: "Auto-Approve",
		description: "Automatically allow all file edits and commands",
	},
	{
		id: "read-only",
		label: "Read-Only",
		description: "Plan mode — inspect only, prevent edits",
	},
]

export function EditorInput({
	onSend,
	onQueue,
	onAbort,
	isAgentActive,
	modeId: _modeId,
	onBuiltinCommand,
	queue,
	isQueuePaused,
	onResumeQueue,
	onSteerQueued,
	onDeleteQueued,
	onReorderQueue,
	onClearQueue,
	currentModelId,
	onSelectModel,
	permissionMode = "default",
	onSelectPermissionMode,
}: EditorInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const modelMenuRef = useRef<HTMLDivElement>(null)
	const permissionMenuRef = useRef<HTMLDivElement>(null)
	const composerRef = useRef<HTMLDivElement>(null)

	const [value, setValue] = useState("")
	const [showSlashMenu, setShowSlashMenu] = useState(false)
	const [slashFilter, setSlashFilter] = useState("")
	const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null)
	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
	const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
	const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false)
	const [modelSearch, setModelSearch] = useState("")
	const [isHoveringAction, setIsHoveringAction] = useState(false)
	const [isFocused, setIsFocused] = useState(false)
	const [isDraggingOver, setIsDraggingOver] = useState(false)

	const { models } = useAvailableModels()

	const handleEditQueued = useCallback(
		(item: QueuedMessage) => {
			setValue(item.content)
			if (item.files && item.files.length > 0) {
				setAttachedFiles(item.files)
			}
			if (onDeleteQueued) {
				onDeleteQueued(item.id)
			}
			setTimeout(() => {
				if (textareaRef.current) {
					textareaRef.current.focus()
					textareaRef.current.style.height = "auto"
					const newHeight = Math.min(textareaRef.current.scrollHeight, 200)
					textareaRef.current.style.height = newHeight + "px"
				}
			}, 0)
		},
		[onDeleteQueued],
	)

	useEffect(() => {
		textareaRef.current?.focus()
	}, [isAgentActive])

	// Close menus on outside click
	useEffect(() => {
		if (!isModelMenuOpen && !isPermissionMenuOpen) return
		const handleClickOutside = (e: MouseEvent) => {
			if (
				modelMenuRef.current &&
				!modelMenuRef.current.contains(e.target as Node)
			) {
				setIsModelMenuOpen(false)
			}
			if (
				permissionMenuRef.current &&
				!permissionMenuRef.current.contains(e.target as Node)
			) {
				setIsPermissionMenuOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [isModelMenuOpen, isPermissionMenuOpen])

	const processImageFile = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			const dataUrl = reader.result as string
			const base64 = dataUrl.split(",")[1]
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "image",
					name: file.name,
					mimeType: file.type,
					data: base64,
					preview: dataUrl,
				},
			])
		}
		reader.readAsDataURL(file)
	}, [])

	const processNonImageFile = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			const textContent = reader.result as string
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "file",
					name: file.name,
					mimeType: file.type || "text/plain",
					data: textContent,
					preview: "",
				},
			])
		}
		reader.readAsText(file)
	}, [])

	const processIncomingFile = useCallback(
		(file: File) => {
			if (
				file.type.startsWith("image/") ||
				/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name)
			) {
				processImageFile(file)
			} else {
				processNonImageFile(file)
			}
		},
		[processImageFile, processNonImageFile],
	)

	const processClipboardFiles = useCallback(
		(data: DataTransfer | null) => {
			if (!data) return false
			let hasFiles = false
			if (data.files && data.files.length > 0) {
				for (const file of Array.from(data.files)) {
					hasFiles = true
					processIncomingFile(file)
				}
				return hasFiles
			}
			for (const item of Array.from(data.items || [])) {
				if (item.kind === "file") {
					const file = item.getAsFile()
					if (file) {
						hasFiles = true
						processIncomingFile(file)
					}
				}
			}
			return hasFiles
		},
		[processIncomingFile],
	)

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		if (e.dataTransfer.types.includes("Files")) {
			setIsDraggingOver(true)
		}
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(false)
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			setIsDraggingOver(false)
			const files = Array.from(e.dataTransfer.files || [])
			for (const file of files) {
				processIncomingFile(file)
			}
		},
		[processIncomingFile],
	)

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			if (processClipboardFiles(e.clipboardData)) e.preventDefault()
		},
		[processClipboardFiles],
	)

	// Allow pasting attachments when the focus is anywhere in the composer area,
	// not just inside the textarea.
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const target = e.target as HTMLElement | null
			const tag = target?.tagName
			if (target?.isContentEditable || tag === "TEXTAREA" || tag === "INPUT") {
				return
			}
			const active = document.activeElement as HTMLElement | null
			const inComposer =
				!active ||
				active === document.body ||
				Boolean(composerRef.current?.contains(active))
			if (!inComposer) return
			if (processClipboardFiles(e.clipboardData)) e.preventDefault()
		}
		window.addEventListener("paste", onPaste)
		return () => window.removeEventListener("paste", onPaste)
	}, [processClipboardFiles])

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files || [])
			for (const file of files) {
				if (file.type.startsWith("image/")) {
					processImageFile(file)
				} else {
					processNonImageFile(file)
				}
			}
			e.target.value = ""
		},
		[processImageFile, processNonImageFile],
	)

	const handleSlashSelect = useCallback(
		(cmd: SlashCommand) => {
			setShowSlashMenu(false)
			setSlashFilter("")
			if (cmd.builtin) {
				setValue("")
				onBuiltinCommand?.(cmd.name)
				return
			}
			setActiveCommand(cmd)
			setValue("")
			textareaRef.current?.focus()
		},
		[onBuiltinCommand],
	)

	const slash = useSlashAutocomplete(
		slashFilter,
		showSlashMenu,
		handleSlashSelect,
		() => setShowSlashMenu(false),
	)

	const handleSubmit = useCallback(() => {
		const trimmed = value.trim()
		if (!trimmed && !activeCommand && attachedFiles.length === 0) return

		let fullContent = trimmed
		if (activeCommand) {
			fullContent = `/${activeCommand.name} ${trimmed}`.trim()
		}

		if (isAgentActive && onQueue) {
			onQueue(fullContent, attachedFiles.length > 0 ? attachedFiles : undefined)
		} else {
			onSend(fullContent, attachedFiles.length > 0 ? attachedFiles : undefined)
		}

		setValue("")
		setActiveCommand(null)
		setAttachedFiles([])
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto"
			textareaRef.current.style.overflowY = "hidden"
		}
	}, [value, activeCommand, attachedFiles, isAgentActive, onQueue, onSend])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (showSlashMenu && slash.handleKeyDown(e)) {
				return
			}

			if (e.key === "Backspace" && activeCommand && value === "") {
				e.preventDefault()
				setActiveCommand(null)
				return
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				handleSubmit()
			}
			if (e.key === "Escape" && isAgentActive) {
				onAbort()
			}
		},
		[
			showSlashMenu,
			slash,
			activeCommand,
			value,
			isAgentActive,
			handleSubmit,
			onAbort,
		],
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newVal = e.target.value
			setValue(newVal)

			if (!activeCommand && newVal.startsWith("/") && !newVal.includes("\n")) {
				setShowSlashMenu(true)
				setSlashFilter(newVal.slice(1).split(" ")[0])
			} else {
				setShowSlashMenu(false)
			}

			const ta = e.target
			ta.style.height = "auto"
			const newHeight = Math.min(ta.scrollHeight, 200)
			ta.style.height = newHeight + "px"
			ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden"
		},
		[activeCommand],
	)

	const hasContent = Boolean(
		value.trim() || activeCommand || attachedFiles.length > 0,
	)

	const currentModelDisplayName = useMemo(
		() => formatModelDisplayName(currentModelId, models),
		[currentModelId, models],
	)

	const permissionLabel = useMemo(() => {
		const found = PERMISSION_OPTIONS.find((p) => p.id === permissionMode)
		return found ? found.label : "Default"
	}, [permissionMode])

	const connectedModels = useMemo(() => {
		return models.filter((m) => m.hasAuth)
	}, [models])

	const filteredModels = useMemo(() => {
		if (!modelSearch.trim()) return connectedModels
		const q = modelSearch.toLowerCase()
		return connectedModels.filter(
			(m) =>
				m.name.toLowerCase().includes(q) ||
				m.id.toLowerCase().includes(q) ||
				m.provider.toLowerCase().includes(q),
		)
	}, [connectedModels, modelSearch])

	const groupedModels = useMemo(() => {
		return filteredModels.reduce(
			(acc, m) => {
				const provider =
					m.provider || (m.id.includes("/") ? m.id.split("/")[0] : "other")
				const capitalized = provider.charAt(0).toUpperCase() + provider.slice(1)
				if (!acc[capitalized]) acc[capitalized] = []
				acc[capitalized].push(m)
				return acc
			},
			{} as Record<string, ModelInfo[]>,
		)
	}, [filteredModels])

	return (
		<div
			ref={composerRef}
			style={{
				padding: "10px 24px 16px",
				borderTop: "1px solid var(--border-muted)",
				flexShrink: 0,
				background: "var(--bg)",
			}}
		>
			{queue && queue.length > 0 && (
				<MessageQueueBar
					queue={queue}
					isAgentActive={isAgentActive}
					isQueuePaused={isQueuePaused}
					onResumeQueue={onResumeQueue}
					onSteerQueued={onSteerQueued || (() => {})}
					onDeleteQueued={onDeleteQueued || (() => {})}
					onEditQueued={handleEditQueued}
					onReorderQueue={onReorderQueue || (() => {})}
					onClearQueue={onClearQueue || (() => {})}
				/>
			)}
			<div
				style={{
					position: "relative",
					background: "var(--bg-surface)",
					border: isDraggingOver
						? "1px dashed var(--accent)"
						: isFocused
						? "1px solid var(--accent)"
						: "1px solid var(--border)",
					borderRadius: 16,
					padding: "12px 14px 10px",
					boxShadow: isDraggingOver
						? "0 0 12px rgba(109, 40, 217, 0.2)"
						: isFocused
						? "0 2px 8px rgba(109, 40, 217, 0.08)"
						: "0 1px 4px rgba(0, 0, 0, 0.04)",
					display: "flex",
					flexDirection: "column",
					gap: 8,
					transition: "border-color 0.15s, box-shadow 0.15s",
				}}
				onFocus={() => setIsFocused(true)}
				onBlur={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node)) {
						setIsFocused(false)
					}
				}}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{slash.element}

				{/* Attachment previews */}
				{attachedFiles.length > 0 && (
					<div
						style={{
							display: "flex",
							gap: 8,
							paddingBottom: 8,
							borderBottom: "1px solid var(--border-muted)",
							overflowX: "auto",
						}}
					>
						{attachedFiles.map((file, i) => (
							<div
								key={i}
								style={{
									position: "relative",
									flexShrink: 0,
								}}
							>
								{file.type === "image" ? (
									<img
										src={file.preview}
										alt={file.name}
										style={{
											height: 52,
											maxWidth: 100,
											objectFit: "cover",
											borderRadius: 8,
											border: "1px solid var(--border-muted)",
										}}
									/>
								) : (
									<div
										title={file.name}
										style={{
											height: 52,
											minWidth: 70,
											maxWidth: 110,
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											justifyContent: "center",
											gap: 3,
											padding: "4px 8px",
											borderRadius: 8,
											border: "1px solid var(--border-muted)",
											background: "var(--bg-elevated)",
										}}
									>
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="var(--muted)"
											strokeWidth="1.5"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
											<polyline points="14 2 14 8 20 8" />
										</svg>
										<span
											style={{
												fontSize: 10,
												color: "var(--muted)",
												maxWidth: 90,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{file.name}
										</span>
									</div>
								)}
								<button
									type="button"
									onClick={() =>
										setAttachedFiles((prev) =>
											prev.filter((_, idx) => idx !== i),
										)
									}
									style={{
										position: "absolute",
										top: -5,
										right: -5,
										width: 16,
										height: 16,
										borderRadius: "50%",
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										color: "var(--text)",
										fontSize: 10,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: "pointer",
										lineHeight: 1,
										padding: 0,
									}}
								>
									&times;
								</button>
							</div>
						))}
					</div>
				)}

				{/* Active slash command chip */}
				{activeCommand && (
					<span
						onClick={() => {
							setActiveCommand(null)
							textareaRef.current?.focus()
						}}
						style={{
							alignSelf: "flex-start",
							display: "inline-flex",
							alignItems: "center",
							gap: 4,
							padding: "2px 8px",
							background: "var(--accent)" + "22",
							color: "var(--accent)",
							borderRadius: 4,
							fontSize: 12,
							fontFamily: "var(--font-mono, monospace)",
							fontWeight: 500,
							cursor: "pointer",
							lineHeight: 1.5,
						}}
					>
						/{activeCommand.name}
						<span style={{ fontSize: 10, opacity: 0.6 }}>&times;</span>
					</span>
				)}

				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					placeholder="Ask anything, / for actions"
					rows={1}
					style={{
						width: "100%",
						background: "transparent",
						border: "none",
						outline: "none",
						color: "var(--text)",
						fontSize: 14,
						fontFamily: "inherit",
						lineHeight: 1.5,
						resize: "none",
						minHeight: 24,
						maxHeight: 200,
						overflowX: "hidden",
						overflowY: "hidden",
						padding: 0,
						boxSizing: "border-box",
					}}
				/>

				{/* Bottom Bar */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginTop: 4,
						userSelect: "none",
					}}
				>
					{/* Left: Attach button & Model Selector */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							position: "relative",
						}}
					>
						{/* Attach button */}
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							title="Attach files or images"
							style={{
								width: 28,
								height: 28,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 6,
								background: "transparent",
								border: "none",
								color: "var(--muted)",
								cursor: "pointer",
								transition: "background-color 0.15s, color 0.15s",
								padding: 0,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = "var(--text)"
								e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = "var(--muted)"
								e.currentTarget.style.backgroundColor = "transparent"
							}}
						>
							<svg
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
						</button>
						<input
							ref={fileInputRef}
							type="file"
							multiple
							onChange={handleFileSelect}
							style={{ display: "none" }}
						/>

						{/* Model selector trigger button */}
						<button
							type="button"
							onClick={() => {
								setIsModelMenuOpen(!isModelMenuOpen)
								setIsPermissionMenuOpen(false)
							}}
							title="Select model for this conversation"
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
								padding: "4px 8px",
								borderRadius: 6,
								background: isModelMenuOpen ? "var(--bg-hover)" : "transparent",
								border: "none",
								color: "var(--text)",
								fontSize: 13,
								fontWeight: 500,
								cursor: "pointer",
								fontFamily: "inherit",
								transition: "background-color 0.15s",
							}}
							onMouseEnter={(e) => {
								if (!isModelMenuOpen)
									e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								if (!isModelMenuOpen)
									e.currentTarget.style.backgroundColor = "transparent"
							}}
						>
							<span>{currentModelDisplayName}</span>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{
									color: "var(--muted)",
									transform: isModelMenuOpen ? "rotate(180deg)" : "none",
									transition: "transform 0.15s",
								}}
							>
								<polyline points="18 15 12 9 6 15" />
							</svg>
						</button>

						{/* Upward Model Popover */}
						{isModelMenuOpen && (
							<div
								ref={modelMenuRef}
								style={{
									position: "absolute",
									bottom: "calc(100% + 10px)",
									left: 0,
									width: 300,
									maxHeight: 340,
									background: "var(--bg-elevated)",
									border: "1px solid var(--border)",
									borderRadius: 12,
									boxShadow: "0 10px 28px rgba(0, 0, 0, 0.2)",
									display: "flex",
									flexDirection: "column",
									zIndex: 200,
									overflow: "hidden",
								}}
							>
								<div
									style={{
										padding: "8px 10px",
										borderBottom: "1px solid var(--border-muted)",
									}}
								>
									<input
										type="text"
										value={modelSearch}
										onChange={(e) => setModelSearch(e.target.value)}
										placeholder="Search models..."
										autoFocus
										style={{
											width: "100%",
											padding: "6px 10px",
											background: "var(--bg-surface)",
											border: "1px solid var(--border)",
											borderRadius: 6,
											color: "var(--text)",
											fontSize: 12,
											outline: "none",
											boxSizing: "border-box",
										}}
									/>
								</div>
								<div style={{ overflowY: "auto", flex: 1, padding: "6px 4px" }}>
									{Object.keys(groupedModels).length === 0 ? (
										<div
											style={{
												padding: "16px 10px",
												textAlign: "center",
												fontSize: 12,
												color: "var(--dim)",
											}}
										>
											{connectedModels.length === 0
												? "No connected models"
												: "No matching models"}
											{connectedModels.length === 0 && (
												<div
													style={{
														marginTop: 4,
														fontSize: 11,
														color: "var(--muted)",
													}}
												>
													Please configure API keys in Settings
												</div>
											)}
										</div>
									) : (
										Object.entries(groupedModels).map(
											([provider, providerModels]) => (
												<div key={provider} style={{ marginBottom: 6 }}>
													<div
														style={{
															fontSize: 11,
															fontWeight: 600,
															color: "var(--dim)",
															padding: "4px 8px 2px",
															textTransform: "uppercase",
															letterSpacing: "0.5px",
														}}
													>
														{provider}
													</div>
													{providerModels.map((m) => {
														const isSelected = m.id === currentModelId
														return (
															<button
																key={m.id}
																type="button"
																onClick={() => {
																	onSelectModel?.(m.id)
																	setIsModelMenuOpen(false)
																	setModelSearch("")
																}}
																style={{
																	width: "100%",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "space-between",
																	padding: "6px 8px",
																	borderRadius: 6,
																	background: isSelected
																		? "var(--bg-hover)"
																		: "transparent",
																	border: "none",
																	color: isSelected
																		? "var(--accent)"
																		: "var(--text)",
																	fontSize: 12,
																	cursor: "pointer",
																	textAlign: "left",
																	transition: "background-color 0.1s",
																}}
																onMouseEnter={(e) => {
																	if (!isSelected)
																		e.currentTarget.style.backgroundColor =
																			"var(--bg-hover)"
																}}
																onMouseLeave={(e) => {
																	if (!isSelected)
																		e.currentTarget.style.backgroundColor =
																			"transparent"
																}}
															>
																<div
																	style={{
																		display: "flex",
																		flexDirection: "column",
																		minWidth: 0,
																	}}
																>
																	<span
																		style={{
																			fontWeight: isSelected ? 600 : 400,
																			overflow: "hidden",
																			textOverflow: "ellipsis",
																			whiteSpace: "nowrap",
																		}}
																	>
																		{m.name || m.id}
																	</span>
																</div>
																{isSelected && (
																	<svg
																		width="14"
																		height="14"
																		viewBox="0 0 24 24"
																		fill="none"
																		stroke="currentColor"
																		strokeWidth="2.5"
																		strokeLinecap="round"
																		strokeLinejoin="round"
																	>
																		<polyline points="20 6 9 17 4 12" />
																	</svg>
																)}
															</button>
														)
													})}
												</div>
											),
										)
									)}
								</div>
							</div>
						)}
					</div>

					{/* Right: Permission Pill & Action Button */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							position: "relative",
						}}
					>
						{/* Permission pill button */}
						<button
							type="button"
							onClick={() => {
								setIsPermissionMenuOpen(!isPermissionMenuOpen)
								setIsModelMenuOpen(false)
							}}
							title="Conversation permission mode"
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "4px 10px",
								borderRadius: 9999,
								background: isPermissionMenuOpen
									? "var(--bg-hover)"
									: "var(--bg)",
								border: "1px solid var(--border)",
								color: "var(--text)",
								fontSize: 12,
								cursor: "pointer",
								fontFamily: "inherit",
								boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
								transition: "background-color 0.15s, border-color 0.15s",
							}}
							onMouseEnter={(e) => {
								if (!isPermissionMenuOpen)
									e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								if (!isPermissionMenuOpen)
									e.currentTarget.style.backgroundColor = "var(--bg)"
							}}
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{ color: "var(--muted)" }}
							>
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
							</svg>
							<span style={{ fontWeight: 500 }}>{permissionLabel}</span>
							<svg
								width="11"
								height="11"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{
									color: "var(--muted)",
									transform: isPermissionMenuOpen ? "rotate(180deg)" : "none",
									transition: "transform 0.15s",
								}}
							>
								<polyline points="18 15 12 9 6 15" />
							</svg>
						</button>

						{/* Upward Permission Popover */}
						{isPermissionMenuOpen && (
							<div
								ref={permissionMenuRef}
								style={{
									position: "absolute",
									bottom: "calc(100% + 10px)",
									right: 40,
									width: 250,
									background: "var(--bg-elevated)",
									border: "1px solid var(--border)",
									borderRadius: 12,
									boxShadow: "0 10px 28px rgba(0, 0, 0, 0.2)",
									padding: 6,
									display: "flex",
									flexDirection: "column",
									gap: 2,
									zIndex: 200,
								}}
							>
								{PERMISSION_OPTIONS.map((opt) => {
									const isSelected = permissionMode === opt.id
									return (
										<button
											key={opt.id}
											type="button"
											onClick={() => {
												onSelectPermissionMode?.(opt.id)
												setIsPermissionMenuOpen(false)
											}}
											style={{
												width: "100%",
												display: "flex",
												alignItems: "flex-start",
												gap: 10,
												padding: "8px 10px",
												borderRadius: 8,
												background: isSelected
													? "var(--bg-hover)"
													: "transparent",
												border: "none",
												color: "var(--text)",
												cursor: "pointer",
												textAlign: "left",
												transition: "background-color 0.1s",
											}}
											onMouseEnter={(e) => {
												if (!isSelected)
													e.currentTarget.style.backgroundColor =
														"var(--bg-hover)"
											}}
											onMouseLeave={(e) => {
												if (!isSelected)
													e.currentTarget.style.backgroundColor = "transparent"
											}}
										>
											<div
												style={{
													marginTop: 2,
													color: isSelected ? "var(--accent)" : "var(--muted)",
												}}
											>
												{opt.id === "default" && (
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
													</svg>
												)}
												{opt.id === "auto-approve" && (
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
													</svg>
												)}
												{opt.id === "read-only" && (
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<rect
															x="3"
															y="11"
															width="18"
															height="11"
															rx="2"
															ry="2"
														/>
														<path d="M7 11V7a5 5 0 0 1 10 0v4" />
													</svg>
												)}
											</div>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														justifyContent: "space-between",
													}}
												>
													<span
														style={{
															fontSize: 12,
															fontWeight: isSelected ? 600 : 500,
														}}
													>
														{opt.label}
													</span>
													{isSelected && (
														<svg
															width="13"
															height="13"
															viewBox="0 0 24 24"
															fill="none"
															stroke="var(--accent)"
															strokeWidth="2.5"
															strokeLinecap="round"
															strokeLinejoin="round"
														>
															<polyline points="20 6 9 17 4 12" />
														</svg>
													)}
												</div>
												<div
													style={{
														fontSize: 11,
														color: "var(--dim)",
														marginTop: 2,
														lineHeight: 1.3,
													}}
												>
													{opt.description}
												</div>
											</div>
										</button>
									)
								})}
							</div>
						)}

						{/* Action Button: Send or Stop */}
						<div
							style={{ position: "relative" }}
							onMouseEnter={() => setIsHoveringAction(true)}
							onMouseLeave={() => setIsHoveringAction(false)}
						>
							{/* Floating tooltip "Send Message ↵" when hovering active send button */}
							{isHoveringAction && hasContent && (
								<div
									style={{
										position: "absolute",
										bottom: "calc(100% + 8px)",
										right: 0,
										whiteSpace: "nowrap",
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										color: "var(--text)",
										fontSize: 11,
										fontWeight: 500,
										padding: "4px 8px",
										borderRadius: 6,
										boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
										pointerEvents: "none",
										zIndex: 50,
										display: "flex",
										alignItems: "center",
										gap: 4,
									}}
								>
									<span>Send Message</span>
									<span style={{ fontSize: 10, opacity: 0.7 }}>↵</span>
								</div>
							)}

							{hasContent ? (
								<button
									type="button"
									onClick={handleSubmit}
									title={
										isAgentActive ? "Queue message (Enter)" : "Send Message ↵"
									}
									aria-label={isAgentActive ? "Queue message" : "Send message"}
									style={{
										width: 32,
										height: 32,
										borderRadius: "50%",
										background: "#1a73e8",
										border: "none",
										color: "#ffffff",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: "pointer",
										boxShadow: "0 2px 6px rgba(26, 115, 232, 0.35)",
										transition: "background-color 0.15s, transform 0.1s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = "#1557b0"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "#1a73e8"
									}}
									onMouseDown={(e) => {
										e.currentTarget.style.transform = "scale(0.95)"
									}}
									onMouseUp={(e) => {
										e.currentTarget.style.transform = "scale(1)"
									}}
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<line x1="5" y1="12" x2="19" y2="12" />
										<polyline points="12 5 19 12 12 19" />
									</svg>
								</button>
							) : isAgentActive ? (
								<button
									type="button"
									onClick={onAbort}
									title="Stop generation (Esc)"
									aria-label="Stop generation"
									style={{
										width: 32,
										height: 32,
										borderRadius: "50%",
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: "pointer",
										transition: "background-color 0.15s, border-color 0.15s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											"rgba(239, 68, 68, 0.1)"
										e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "var(--bg-elevated)"
										e.currentTarget.style.borderColor = "var(--border)"
									}}
								>
									<div
										style={{
											width: 10,
											height: 10,
											background: "#ef4444",
											borderRadius: 2,
										}}
									/>
								</button>
							) : (
								<button
									type="button"
									disabled
									aria-label="Send message disabled"
									style={{
										width: 32,
										height: 32,
										borderRadius: "50%",
										background: "var(--bg-elevated)",
										border: "none",
										color: "var(--dim)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: "default",
										opacity: 0.5,
									}}
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<line x1="5" y1="12" x2="19" y2="12" />
										<polyline points="12 5 19 12 12 19" />
									</svg>
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
