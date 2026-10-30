import { useRef, useState, useCallback, useEffect, useMemo } from "react"
import {
	useSlashAutocomplete,
	BUILTIN_COMMAND_NAMES,
	type SlashCommand,
} from "./SlashCommandAutocomplete"
import {
	useFileMentionAutocomplete,
	FileAttachmentBadge,
	extractAtMentionQuery,
} from "./FileMentionAutocomplete"
import { MessageQueueBar } from "./MessageQueueBar"
import { useAvailableModels, type ModelInfo } from "./ModelSelector"
import { ImagePreviewModal } from "./ImagePreviewModal"
import {
	CURATED_CHAT_MODELS,
	getProviderThinkingLevels,
	type ThinkingLevelOption,
} from "../../constants/models"
import type { AttachedFile, QueuedMessage } from "../types/chat"

export type { AttachedFile }

export type PermissionMode = "default" | "auto-approve" | "read-only"

interface EditorInputProps {
	onSend: (content: string, files?: AttachedFile[]) => void
	onQueue?: (content: string, files?: AttachedFile[]) => void
	onAbort: () => void
	isAgentActive: boolean
	modeId: string
	onSelectMode?: (modeId: string) => void
	onOpenGraphViewer?: () => void
	onOpenModelSelector?: () => void
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
	thinkingLevel?: string
	onSelectThinkingLevel?: (level: string) => void
	permissionMode?: PermissionMode
	onSelectPermissionMode?: (mode: PermissionMode) => void
	isRecording?: boolean
	onToggleRecording?: () => void
	isReplaying?: boolean
	onStopReplay?: () => void
	projectRootPath?: string | null
	openFiles?: string[]
}

const MODE_OPTIONS = [
	{
		id: "react",
		label: "ReAct",
		description: "Autonomous iterative execution with real-time tool calls",
		color: "var(--mode-react)",
	},
	{
		id: "plan",
		label: "Plan & Solve",
		description: "Two-phase plan creation followed by step-by-step execution",
		color: "var(--mode-plan)",
	},
	{
		id: "fast",
		label: "Fast",
		description: "Direct answers with read-only file and web tools, no edits",
		color: "var(--mode-fast)",
	},
]

const modeColors: Record<string, string> = {
	react: "var(--mode-react)",
	fast: "var(--mode-fast)",
	plan: "var(--mode-plan)",
	build: "var(--mode-build)",
	chat: "var(--mode-fast)",
}

const modeDisplayNames: Record<string, string> = {
	react: "ReAct",
	fast: "Fast",
	plan: "Plan & Solve",
	build: "ReAct",
	chat: "Fast",
}

function resolveModelThinkingLevels(
	modelId?: string,
): ThinkingLevelOption[] | null {
	if (!modelId) return null
	return getProviderThinkingLevels(modelId)
}

function formatThinkingDisplay(level?: string): string {
	if (!level || level === "off") return "Off"
	if (level === "low") return "Low"
	if (level === "medium") return "Medium"
	if (level === "high") return "High"
	if (level === "xhigh") return "Max"
	return level.charAt(0).toUpperCase() + level.slice(1)
}

function formatModelDisplayName(
	modelId?: string,
	models?: ModelInfo[],
): string {
	if (!modelId) return "Select Model"
	const matched =
		models?.find((m) => m.id === modelId) ||
		CURATED_CHAT_MODELS.find((m) => m.id === modelId)
	if (matched?.name) return matched.name
	return modelId.includes("/") ? modelId.split("/")[1] : modelId
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

/** One icon per permission mode, shared by the trigger and the option list. */
function PermissionIcon({
	mode,
	size = 12,
	color,
}: {
	mode: PermissionMode
	size?: number
	color?: string
}) {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none" as const,
		stroke: "currentColor",
		strokeWidth: 2,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		style: color ? { color } : undefined,
	}
	if (mode === "auto-approve") {
		return (
			<svg {...common}>
				<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
			</svg>
		)
	}
	if (mode === "read-only") {
		return (
			<svg {...common}>
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
				<path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
		)
	}
	return (
		<svg {...common}>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
		</svg>
	)
}

export function EditorInput({
	onSend,
	onQueue,
	onAbort,
	isAgentActive,
	modeId = "react",
	onSelectMode,
	onOpenGraphViewer,
	onOpenModelSelector,
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
	thinkingLevel = "medium",
	onSelectThinkingLevel,
	permissionMode = "default",
	onSelectPermissionMode,
	isRecording = false,
	onToggleRecording,
	isReplaying = false,
	onStopReplay,
	projectRootPath,
	openFiles,
}: EditorInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const modelMenuRef = useRef<HTMLDivElement>(null)
	const modelCardRef = useRef<HTMLDivElement>(null)
	const modeMenuRef = useRef<HTMLDivElement>(null)
	const permissionMenuRef = useRef<HTMLDivElement>(null)
	const bottomBarRef = useRef<HTMLDivElement>(null)
	const composerRef = useRef<HTMLDivElement>(null)
	const [bottomBarWidth, setBottomBarWidth] = useState<number>(0)

	const isComposingRef = useRef(false)
	const isSubmittingRef = useRef(false)
	const [value, setValue] = useState("")
	const [showSlashMenu, setShowSlashMenu] = useState(false)
	const [slashFilter, setSlashFilter] = useState("")
	const [showAtMenu, setShowAtMenu] = useState(false)
	const [atFilter, setAtFilter] = useState("")
	const [atRange, setAtRange] = useState<{ start: number; end: number } | null>(
		null,
	)
	const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null)
	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
	const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
	const [showThinkingSlider, setShowThinkingSlider] = useState(false)
	const [isThinkingDragging, setIsThinkingDragging] = useState(false)
	const thinkingSliderRef = useRef<HTMLDivElement>(null)
	const thinkingBadgeRef = useRef<HTMLSpanElement>(null)
	const thinkingTrackRef = useRef<HTMLDivElement>(null)
	const [isModeMenuOpen, setIsModeMenuOpen] = useState(false)
	const [hoveredModelId, setHoveredModelId] = useState<string | null>(null)
	const [hoveredSubmenuTop, setHoveredSubmenuTop] = useState(0)
	const flyoutCloseTimerRef = useRef<NodeJS.Timeout | null>(null)
	const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false)
	const [modelSearch, setModelSearch] = useState("")
	const [busyPrompt, setBusyPrompt] = useState<string | null>(null)
	const busyPromptTimerRef = useRef<NodeJS.Timeout | null>(null)
	const [isHoveringAction, setIsHoveringAction] = useState(false)
	const [isFocused, setIsFocused] = useState(false)
	const [isDraggingOver, setIsDraggingOver] = useState(false)
	const [previewImage, setPreviewImage] = useState<string | null>(null)

	const showBusyPrompt = useCallback((msg: string) => {
		if (busyPromptTimerRef.current) {
			clearTimeout(busyPromptTimerRef.current)
		}
		setBusyPrompt(msg)
		busyPromptTimerRef.current = setTimeout(() => {
			setBusyPrompt(null)
			busyPromptTimerRef.current = null
		}, 3000)
	}, [])

	useEffect(() => {
		return () => {
			if (busyPromptTimerRef.current) {
				clearTimeout(busyPromptTimerRef.current)
			}
		}
	}, [])

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
		if (
			!isModelMenuOpen &&
			!isPermissionMenuOpen &&
			!isModeMenuOpen &&
			!showThinkingSlider
		)
			return
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node
			if (modelMenuRef.current && !modelMenuRef.current.contains(target)) {
				setIsModelMenuOpen(false)
				setHoveredModelId(null)
			}
			if (
				thinkingSliderRef.current &&
				!thinkingSliderRef.current.contains(target) &&
				(!thinkingBadgeRef.current ||
					!thinkingBadgeRef.current.contains(target))
			) {
				setShowThinkingSlider(false)
			}
			if (modeMenuRef.current && !modeMenuRef.current.contains(target)) {
				setIsModeMenuOpen(false)
			}
			if (
				permissionMenuRef.current &&
				!permissionMenuRef.current.contains(target)
			) {
				setIsPermissionMenuOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [
		isModelMenuOpen,
		isPermissionMenuOpen,
		isModeMenuOpen,
		showThinkingSlider,
	])

	// Close thinking slider on Escape key
	useEffect(() => {
		if (!showThinkingSlider) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setShowThinkingSlider(false)
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [showThinkingSlider])

	// Observe bottom bar width for responsive compact styling of option buttons
	useEffect(() => {
		const el = bottomBarRef.current
		if (!el) return
		if (typeof ResizeObserver === "undefined") return

		const updateWidth = () => {
			const rect = el.getBoundingClientRect()
			if (rect.width > 0) {
				setBottomBarWidth(rect.width)
			}
		}

		updateWidth()

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const w = entry.contentRect.width
				if (w > 0) {
					setBottomBarWidth(w)
				}
			}
		})
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	const handleModelMouseEnter = (
		mId: string,
		e: React.MouseEvent<HTMLButtonElement>,
	) => {
		if (flyoutCloseTimerRef.current) {
			clearTimeout(flyoutCloseTimerRef.current)
			flyoutCloseTimerRef.current = null
		}
		const levels = resolveModelThinkingLevels(mId)
		if (!levels || levels.length === 0) {
			setHoveredModelId(null)
			return
		}
		const rowRect = e.currentTarget.getBoundingClientRect()
		const cardRect = modelCardRef.current?.getBoundingClientRect()
		const calculatedTop = cardRect ? rowRect.top - cardRect.top : 0
		const flyoutHeight = levels.length * 34 + 16
		const cardHeight = cardRect?.height || 340
		const maxTop = Math.max(0, cardHeight - flyoutHeight)
		const clampedTop = Math.max(0, Math.min(calculatedTop, maxTop))
		setHoveredModelId(mId)
		setHoveredSubmenuTop(clampedTop)
	}

	const handleModelMouseLeave = () => {
		if (flyoutCloseTimerRef.current) clearTimeout(flyoutCloseTimerRef.current)
		flyoutCloseTimerRef.current = setTimeout(() => {
			setHoveredModelId(null)
		}, 150)
	}

	const handleFlyoutMouseEnter = () => {
		if (flyoutCloseTimerRef.current) {
			clearTimeout(flyoutCloseTimerRef.current)
			flyoutCloseTimerRef.current = null
		}
	}

	const handleFlyoutMouseLeave = () => {
		if (flyoutCloseTimerRef.current) clearTimeout(flyoutCloseTimerRef.current)
		flyoutCloseTimerRef.current = setTimeout(() => {
			setHoveredModelId(null)
		}, 150)
	}

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
			const filePath = (file as unknown as { path?: string }).path
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "file",
					name: file.name,
					path: filePath,
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
				// Unknown builtin names are ignored rather than sent as text
				if (BUILTIN_COMMAND_NAMES.has(cmd.name)) {
					setValue("")
					onBuiltinCommand?.(cmd.name)
				}
				return
			}
			setActiveCommand(cmd)
			setValue("")
			textareaRef.current?.focus()
		},
		[onBuiltinCommand],
	)

	const handleFileSelectFromAt = useCallback(
		(filePath: string) => {
			if (atRange) {
				const before = value.slice(0, atRange.start)
				const after = value.slice(atRange.end)
				setValue(before + after)
				requestAnimationFrame(() => {
					if (textareaRef.current) {
						textareaRef.current.focus()
						const newPos = before.length
						textareaRef.current.setSelectionRange(newPos, newPos)
					}
				})
			}
			setShowAtMenu(false)
			setAtFilter("")
			setAtRange(null)

			const fileName = filePath.split("/").pop() || filePath
			const fullPath = projectRootPath
				? `${projectRootPath.replace(/\/+$/, "")}/${filePath.replace(/^\/+/, "")}`
				: filePath

			if (
				attachedFiles.some(
					(f) => f.path === fullPath || f.relativePath === filePath,
				)
			) {
				return
			}

			window.api
				.invoke({ type: "readFileContents", path: filePath })
				.then((res) => {
					const content = (res as { content?: string })?.content ?? ""
					setAttachedFiles((prev) => [
						...prev,
						{
							type: "file",
							name: fileName,
							path: fullPath,
							relativePath: filePath,
							mimeType: "text/plain",
							data: content,
							preview: "",
						},
					])
				})
				.catch((err) => {
					console.error("Failed to read file for attachment:", err)
					setAttachedFiles((prev) => [
						...prev,
						{
							type: "file",
							name: fileName,
							path: fullPath,
							relativePath: filePath,
							mimeType: "text/plain",
							data: "",
							preview: "",
						},
					])
				})
		},
		[atRange, value, projectRootPath, attachedFiles],
	)

	const atMention = useFileMentionAutocomplete({
		filter: atFilter,
		visible: showAtMenu,
		onSelect: handleFileSelectFromAt,
		onClose: () => {
			setShowAtMenu(false)
			setAtFilter("")
			setAtRange(null)
		},
		projectRootPath,
		openFiles,
	})

	const slash = useSlashAutocomplete(
		slashFilter,
		showSlashMenu,
		handleSlashSelect,
		() => setShowSlashMenu(false),
	)

	const handleSubmit = useCallback(() => {
		if (isSubmittingRef.current) return
		const trimmed = value.trim()
		if (!trimmed && !activeCommand && attachedFiles.length === 0) return

		isSubmittingRef.current = true
		setTimeout(() => {
			isSubmittingRef.current = false
		}, 150)

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
			if (showAtMenu && atMention.handleKeyDown(e)) {
				return
			}

			if (showSlashMenu && slash.handleKeyDown(e)) {
				return
			}

			if (e.key === "Backspace" && activeCommand && value === "") {
				e.preventDefault()
				setActiveCommand(null)
				return
			}

			if (
				e.key === "Backspace" &&
				!activeCommand &&
				value === "" &&
				attachedFiles.length > 0
			) {
				e.preventDefault()
				setAttachedFiles((prev) => prev.slice(0, -1))
				return
			}

			if (e.key === "Enter" && !e.shiftKey) {
				if (
					e.nativeEvent.isComposing ||
					isComposingRef.current ||
					e.keyCode === 229
				) {
					return
				}
				e.preventDefault()
				handleSubmit()
			}
			if (e.key === "Escape" && isAgentActive) {
				onAbort()
			}
		},
		[
			showAtMenu,
			atMention,
			showSlashMenu,
			slash,
			activeCommand,
			value,
			attachedFiles.length,
			isAgentActive,
			handleSubmit,
			onAbort,
		],
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newVal = e.target.value
			setValue(newVal)

			const cursorPos = e.target.selectionStart ?? newVal.length
			const textBeforeCursor = newVal.slice(0, cursorPos)

			if (!activeCommand && newVal.startsWith("/") && !newVal.includes("\n")) {
				setShowSlashMenu(true)
				setSlashFilter(newVal.slice(1).split(" ")[0])
				setShowAtMenu(false)
				setAtFilter("")
				setAtRange(null)
			} else {
				setShowSlashMenu(false)
				const atQuery = extractAtMentionQuery(textBeforeCursor)
				if (atQuery) {
					setShowAtMenu(true)
					setAtFilter(atQuery.filter)
					setAtRange(atQuery.range)
				} else {
					setShowAtMenu(false)
					setAtFilter("")
					setAtRange(null)
				}
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

	const currentModelThinkingLevels = useMemo(
		() => resolveModelThinkingLevels(currentModelId),
		[currentModelId],
	)

	const currentThinkingDisplay = useMemo(() => {
		if (
			!currentModelThinkingLevels ||
			currentModelThinkingLevels.length === 0
		) {
			return null
		}
		return formatThinkingDisplay(thinkingLevel)
	}, [currentModelThinkingLevels, thinkingLevel])

	const activeThinkingLevels = useMemo(
		() => currentModelThinkingLevels ?? [],
		[currentModelThinkingLevels],
	)

	const currentLevelIndex = useMemo(() => {
		if (!activeThinkingLevels || activeThinkingLevels.length === 0) return 0
		const idx = activeThinkingLevels.findIndex(
			(l) => l.id === (thinkingLevel || "off"),
		)
		return Math.max(0, idx)
	}, [activeThinkingLevels, thinkingLevel])

	const numThinkingSteps = activeThinkingLevels.length
	const thinkingStepInterval =
		numThinkingSteps > 1 ? 214 / (numThinkingSteps - 1) : 0

	const handleSetThinkingLevel = useCallback(
		(newLevel: string) => {
			if (isAgentActive) {
				showBusyPrompt("当前会话有任务在执行，无法切换思考强度")
				return
			}
			if (onSelectThinkingLevel) {
				onSelectThinkingLevel(newLevel)
			} else {
				;(
					window as unknown as { api?: { invoke?: (arg: unknown) => void } }
				).api?.invoke?.({
					type: "setThinkingLevel",
					level: newLevel,
				})
			}
		},
		[isAgentActive, onSelectThinkingLevel, showBusyPrompt],
	)

	const updateLevelFromPointer = useCallback(
		(clientX: number) => {
			if (!thinkingTrackRef.current || numThinkingSteps <= 1) return
			const rect = thinkingTrackRef.current.getBoundingClientRect()
			const thumbRadius = 13
			const availableWidth = rect.width - thumbRadius * 2
			const x = Math.max(
				0,
				Math.min(availableWidth, clientX - rect.left - thumbRadius),
			)
			const step = Math.round((x / availableWidth) * (numThinkingSteps - 1))
			const target = activeThinkingLevels[step]
			if (target && target.id !== thinkingLevel) {
				handleSetThinkingLevel(target.id)
			}
		},
		[
			activeThinkingLevels,
			handleSetThinkingLevel,
			numThinkingSteps,
			thinkingLevel,
		],
	)

	const modelFontSize = useMemo(() => {
		const totalLen =
			currentModelDisplayName.length +
			(currentThinkingDisplay ? currentThinkingDisplay.length + 1 : 0)
		if (totalLen > 22) return 11
		if (totalLen > 16) return 11.5
		if (totalLen > 12) return 12
		return 12.5
	}, [currentModelDisplayName, currentThinkingDisplay])

	const currentModeConfig = useMemo(() => {
		return MODE_OPTIONS.find((m) => m.id === modeId) || MODE_OPTIONS[0]
	}, [modeId])

	const modeFontSize = useMemo(() => {
		const len = currentModeConfig.label.length
		if (len > 14) return 11
		if (len > 9) return 11.5
		if (len > 6) return 12
		return 12.5
	}, [currentModeConfig.label])

	const hoveredLevels = useMemo(
		() => resolveModelThinkingLevels(hoveredModelId || undefined),
		[hoveredModelId],
	)

	const permissionLabel = useMemo(() => {
		const found = PERMISSION_OPTIONS.find((p) => p.id === permissionMode)
		return found ? found.label : "Default"
	}, [permissionMode])

	const permissionFontSize = useMemo(() => {
		const len = permissionLabel.length
		if (len > 14) return 11
		if (len > 9) return 11.5
		if (len > 6) return 12
		return 12.5
	}, [permissionLabel])

	// When space is tight, option selectors with icons (such as permission) collapse to show only the icon
	const isPermissionCompact = useMemo(() => {
		if (!bottomBarWidth) return false
		if (bottomBarWidth < 460) return true

		const modelLen =
			currentModelDisplayName.length +
			(currentThinkingDisplay ? currentThinkingDisplay.length + 1 : 0)
		const modeLen = currentModeConfig.label.length
		const permLen = permissionLabel.length

		const estimatedModelWidth = 32 + modelLen * 7.2
		const estimatedModeWidth = 32 + modeLen * 7.2
		const estimatedPermWidth = 36 + permLen * 7.2

		// 32 (attach) + 6 + 6 + 6 + 32 (send) + 20 (safety margin) = 102
		const totalNeededWidth =
			102 + estimatedModelWidth + estimatedModeWidth + estimatedPermWidth

		return bottomBarWidth < totalNeededWidth
	}, [
		bottomBarWidth,
		currentModelDisplayName,
		currentThinkingDisplay,
		currentModeConfig.label,
		permissionLabel,
	])

	const connectedModels = useMemo(() => {
		return models.filter((m) => Boolean(m.hasAuth))
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
				padding: "10px 24px",
				borderTop: "1px solid var(--border-muted)",
				flexShrink: 0,
				background: "var(--bg)",
			}}
		>
			<div
				style={{
					maxWidth: 800,
					width: "100%",
					margin: "0 auto",
					position: "relative",
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
				{busyPrompt && (
					<div
						style={{
							position: "absolute",
							bottom: "calc(100% + 8px)",
							left: "50%",
							transform: "translateX(-50%)",
							padding: "6px 14px",
							background: "var(--bg)",
							border: "1px solid var(--tool-border-error)",
							color: "var(--error)",
							borderRadius: 8,
							fontSize: 12,
							fontWeight: 500,
							boxShadow: "var(--shadow-popover)",
							display: "flex",
							alignItems: "center",
							gap: 6,
							zIndex: 250,
							whiteSpace: "nowrap",
							pointerEvents: "none",
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ flexShrink: 0 }}
						>
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
						<span>{busyPrompt}</span>
					</div>
				)}
				<div
					style={{
						position: "relative",
						background: "var(--bg)",
						border: isDraggingOver
							? "1px dashed var(--accent)"
							: isFocused
								? "1px solid var(--accent)"
								: "1px solid var(--border)",
						borderRadius: 16,
						padding: "6px 14px",
						boxShadow: isDraggingOver
							? "0 0 12px color-mix(in srgb, var(--accent) 20%, transparent)"
							: isFocused
								? "0 2px 8px color-mix(in srgb, var(--accent) 8%, transparent)"
								: "var(--shadow-sm)",
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
					{atMention.element}
					{slash.element}

					{/* Attachment previews */}
					{attachedFiles.length > 0 && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 6,
								paddingBottom: 4,
							}}
						>
							{/* Image attachments */}
							{attachedFiles.some((f) => f.type === "image") && (
								<div
									style={{
										display: "flex",
										gap: 8,
										overflowX: "auto",
										paddingBottom: 2,
									}}
								>
									{attachedFiles
										.filter((f) => f.type === "image")
										.map((file, i) => (
											<div
												key={i}
												style={{
													position: "relative",
													flexShrink: 0,
												}}
											>
												<img
													src={file.preview}
													alt={file.name}
													title="Click to preview"
													onClick={() => setPreviewImage(file.preview)}
													style={{
														height: 52,
														maxWidth: 100,
														objectFit: "cover",
														borderRadius: 8,
														border: "1px solid var(--border-muted)",
														cursor: "pointer",
														transition: "opacity 0.15s",
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.opacity = "0.85"
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.opacity = "1"
													}}
												/>
												<button
													type="button"
													onClick={() =>
														setAttachedFiles((prev) =>
															prev.filter((f) => f !== file),
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

							{/* File attachments rendered as sleek badges with hover path tooltip */}
							{attachedFiles.some((f) => f.type === "file") && (
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 6,
										alignItems: "center",
									}}
								>
									{attachedFiles
										.filter((f) => f.type === "file")
										.map((file) => (
											<FileAttachmentBadge
												key={file.path || file.relativePath || file.name}
												file={file}
												projectRootPath={projectRootPath}
												onRemove={() =>
													setAttachedFiles((prev) =>
														prev.filter((f) => f !== file),
													)
												}
											/>
										))}
								</div>
							)}
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
								fontFamily: "var(--font-mono)",
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
						onCompositionStart={() => {
							isComposingRef.current = true
						}}
						onCompositionEnd={() => {
							setTimeout(() => {
								isComposingRef.current = false
							}, 20)
						}}
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
						ref={bottomBarRef}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							flexWrap: "nowrap",
							gap: 6,
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
								flexWrap: "nowrap",
								minWidth: 0,
							}}
						>
							{/* Attach button */}
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								title="Attach files or images"
								style={{
									width: 32,
									height: 32,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									borderRadius: 8,
									background: "transparent",
									border: "none",
									color: "var(--muted)",
									cursor: "pointer",
									transition: "background-color 0.15s, color 0.15s",
									padding: 0,
									boxSizing: "border-box",
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

							{/* Model Selector Wrapper */}
							<div style={{ position: "relative" }} ref={modelMenuRef}>
								{/* Model selector trigger button */}
								<button
									type="button"
									onClick={() => {
										setIsModelMenuOpen(!isModelMenuOpen)
										setShowThinkingSlider(false)
										setIsModeMenuOpen(false)
										setIsPermissionMenuOpen(false)
										setHoveredModelId(null)
									}}
									title={`Model: ${currentModelDisplayName}${currentThinkingDisplay ? ` (${currentThinkingDisplay})` : ""}`}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 5,
										height: 32,
										padding: "0 8px",
										boxSizing: "border-box",
										borderRadius: 8,
										background:
											isModelMenuOpen || showThinkingSlider
												? "var(--bg-hover)"
												: "transparent",
										border: "none",
										color: "var(--text)",
										fontSize: modelFontSize,
										fontWeight: 500,
										cursor: "pointer",
										fontFamily: "inherit",
										lineHeight: 1,
										whiteSpace: "nowrap",
										flexShrink: 0,
										transition: "background-color 0.15s",
									}}
									onMouseEnter={(e) => {
										if (!isModelMenuOpen && !showThinkingSlider)
											e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									}}
									onMouseLeave={(e) => {
										if (!isModelMenuOpen && !showThinkingSlider)
											e.currentTarget.style.backgroundColor = "transparent"
									}}
								>
									<span style={{ whiteSpace: "nowrap" }}>
										{currentModelDisplayName}
									</span>
									{currentThinkingDisplay && (
										<span
											ref={thinkingBadgeRef}
											role="button"
											tabIndex={0}
											onClick={(e) => {
												e.stopPropagation()
												if (isAgentActive) {
													showBusyPrompt(
														"当前会话有任务在执行，无法切换思考强度",
													)
													return
												}
												setShowThinkingSlider((prev) => !prev)
												setIsModelMenuOpen(false)
												setIsModeMenuOpen(false)
												setIsPermissionMenuOpen(false)
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault()
													e.stopPropagation()
													if (isAgentActive) {
														showBusyPrompt(
															"当前会话有任务在执行，无法切换思考强度",
														)
														return
													}
													setShowThinkingSlider((prev) => !prev)
													setIsModelMenuOpen(false)
													setIsModeMenuOpen(false)
													setIsPermissionMenuOpen(false)
												}
											}}
											onMouseEnter={(e) => {
												e.stopPropagation()
												e.currentTarget.style.backgroundColor =
													"var(--bg-elevated)"
												e.currentTarget.style.color = "var(--text)"
											}}
											onMouseLeave={(e) => {
												e.stopPropagation()
												if (!showThinkingSlider) {
													e.currentTarget.style.backgroundColor = "transparent"
													e.currentTarget.style.color = "var(--muted)"
												}
											}}
											title={
												isAgentActive
													? "当前会话有任务在执行，无法切换思考强度"
													: `Thinking effort: ${thinkingLevel || "off"} (点击调整推理强度)`
											}
											style={{
												color: showThinkingSlider
													? "var(--accent)"
													: "var(--muted)",
												background: showThinkingSlider
													? "var(--bg-elevated)"
													: "transparent",
												fontSize: Math.max(11, modelFontSize - 0.5),
												fontWeight: 500,
												whiteSpace: "nowrap",
												padding: "2px 6px",
												borderRadius: 6,
												cursor: "pointer",
												transition: "all 0.15s ease",
											}}
										>
											{currentThinkingDisplay}
										</span>
									)}
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
											flexShrink: 0,
										}}
									>
										<polyline points="18 15 12 9 6 15" />
									</svg>
								</button>

								{/* Upward Thinking Slider Popover */}
								{showThinkingSlider && activeThinkingLevels.length > 0 && (
									<div
										ref={thinkingSliderRef}
										style={{
											position: "absolute",
											bottom: "calc(100% + 10px)",
											left: 0,
											backgroundColor: "var(--bg-surface)",
											border: "1px solid var(--border)",
											borderRadius: 14,
											padding: "12px 16px",
											boxShadow: "var(--shadow-popover)",
											zIndex: 200,
											display: "flex",
											flexDirection: "column",
											gap: 10,
											width: 272,
											boxSizing: "border-box",
										}}
										onClick={(e) => e.stopPropagation()}
									>
										{/* Header row */}
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												alignItems: "center",
												fontSize: 11,
											}}
										>
											<span style={{ fontWeight: 600, color: "var(--text)" }}>
												Thinking Level
											</span>
											<span
												style={{
													fontWeight: 600,
													color: "var(--accent)",
													textTransform: "capitalize",
												}}
											>
												{activeThinkingLevels[currentLevelIndex]?.label ??
													thinkingLevel}
											</span>
										</div>

										{/* Track */}
										<div
											ref={thinkingTrackRef}
											onPointerDown={(e) => {
												setIsThinkingDragging(true)
												updateLevelFromPointer(e.clientX)
												e.currentTarget.setPointerCapture(e.pointerId)
											}}
											onPointerMove={(e) => {
												if (isThinkingDragging)
													updateLevelFromPointer(e.clientX)
											}}
											onPointerUp={(e) => {
												if (isThinkingDragging) {
													setIsThinkingDragging(false)
													try {
														e.currentTarget.releasePointerCapture(e.pointerId)
													} catch {}
												}
											}}
											onPointerCancel={(e) => {
												if (isThinkingDragging) {
													setIsThinkingDragging(false)
													try {
														e.currentTarget.releasePointerCapture(e.pointerId)
													} catch {}
												}
											}}
											style={{
												position: "relative",
												width: 240,
												height: 28,
												borderRadius: 9999,
												background: "var(--bg-elevated)",
												border: "1px solid var(--border)",
												overflow: "hidden",
												cursor: "pointer",
												userSelect: "none",
												touchAction: "none",
												display: "flex",
												alignItems: "center",
											}}
										>
											{/* Filled active portion */}
											<div
												style={{
													position: "absolute",
													left: 0,
													top: 0,
													bottom: 0,
													width:
														currentLevelIndex === 0
															? 0
															: 13 + currentLevelIndex * thinkingStepInterval,
													background: "var(--accent)",
													borderRadius: 9999,
													transition: isThinkingDragging
														? "none"
														: "width 0.15s ease",
												}}
											/>

											{/* Step dots */}
											{activeThinkingLevels.map((lvl, idx) => (
												<span
													key={lvl.id}
													style={{
														position: "absolute",
														left: 13 + idx * thinkingStepInterval - 2.5,
														top: "calc(50% - 2.5px)",
														width: 5,
														height: 5,
														borderRadius: "50%",
														background:
															idx < currentLevelIndex ||
															(idx === currentLevelIndex &&
																currentLevelIndex > 0)
																? "color-mix(in srgb, var(--on-accent) 85%, transparent)"
																: "var(--dim)",
														pointerEvents: "none",
														transition: "background 0.15s ease",
													}}
												/>
											))}

											{/* White circular knob */}
											<div
												style={{
													position: "absolute",
													left: currentLevelIndex * thinkingStepInterval,
													top: 1,
													width: 26,
													height: 26,
													borderRadius: "50%",
													background: "var(--on-accent)",
													boxShadow: "var(--shadow-sm)",
													pointerEvents: "none",
													transition: isThinkingDragging
														? "none"
														: "left 0.15s ease",
												}}
											/>
										</div>

										{/* Labels below */}
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												fontSize: 10,
												padding: "0 4px",
											}}
										>
											{activeThinkingLevels.map((lvl, idx) => (
												<span
													key={lvl.id}
													onClick={() => handleSetThinkingLevel(lvl.id)}
													style={{
														cursor: "pointer",
														fontWeight: idx === currentLevelIndex ? 600 : 400,
														color:
															idx === currentLevelIndex
																? "var(--accent)"
																: "var(--muted)",
														minWidth: 28,
														textAlign: "center",
														padding: "2px 4px",
														borderRadius: 4,
														transition: "color 0.15s, background-color 0.15s",
													}}
													onMouseEnter={(e) => {
														if (idx !== currentLevelIndex) {
															e.currentTarget.style.color = "var(--text)"
															e.currentTarget.style.backgroundColor =
																"var(--bg-hover)"
														}
													}}
													onMouseLeave={(e) => {
														if (idx !== currentLevelIndex) {
															e.currentTarget.style.color = "var(--muted)"
															e.currentTarget.style.backgroundColor =
																"transparent"
														}
													}}
												>
													{lvl.label}
												</span>
											))}
										</div>
									</div>
								)}

								{/* Upward Model Popover */}
								{isModelMenuOpen && (
									<div
										ref={modelCardRef}
										style={{
											position: "absolute",
											bottom: "calc(100% + 10px)",
											left: 0,
											display: "flex",
											alignItems: "flex-start",
											zIndex: 200,
										}}
									>
										<div
											style={{
												width: 300,
												maxHeight: 340,
												background: "var(--bg)",
												border: "1px solid var(--border)",
												borderRadius: 12,
												boxShadow: "var(--shadow-popover)",
												display: "flex",
												flexDirection: "column",
												overflow: "hidden",
											}}
										>
											<div
												style={{
													padding: "8px 10px",
													borderBottom: "1px solid var(--border)",
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
											{busyPrompt && (
												<div
													style={{
														margin: "6px 8px 0",
														padding: "6px 10px",
														borderRadius: 6,
														background: "var(--tool-error-bg)",
														border: "1px solid var(--tool-border-error)",
														color: "var(--error)",
														fontSize: 11,
														fontWeight: 500,
														lineHeight: 1.4,
														display: "flex",
														alignItems: "center",
														gap: 6,
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
														style={{ flexShrink: 0 }}
													>
														<circle cx="12" cy="12" r="10" />
														<line x1="12" y1="8" x2="12" y2="12" />
														<line x1="12" y1="16" x2="12.01" y2="16" />
													</svg>
													<span>{busyPrompt}</span>
												</div>
											)}
											<div
												onScroll={() => {
													if (hoveredModelId) setHoveredModelId(null)
												}}
												style={{
													overflowY: "auto",
													flex: 1,
													padding: 6,
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
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
															<div
																key={provider}
																style={{
																	display: "flex",
																	flexDirection: "column",
																	gap: 2,
																}}
															>
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
																<div
																	style={{
																		display: "flex",
																		flexDirection: "column",
																		gap: 2,
																	}}
																>
																	{providerModels.map((m) => {
																		const isSelected = m.id === currentModelId
																		const mThinkingLevels =
																			resolveModelThinkingLevels(m.id)
																		const supportsThinking = Boolean(
																			mThinkingLevels &&
																			mThinkingLevels.length > 0,
																		)
																		const isHovered = hoveredModelId === m.id
																		return (
																			<button
																				key={m.id}
																				type="button"
																				onClick={() => {
																					if (isAgentActive) {
																						showBusyPrompt(
																							"当前会话有任务在执行，无法切换模型",
																						)
																						return
																					}
																					onSelectModel?.(m.id)
																					setIsModelMenuOpen(false)
																					setHoveredModelId(null)
																					setModelSearch("")
																				}}
																				onMouseEnter={(e) => {
																					handleModelMouseEnter(m.id, e)
																				}}
																				onMouseLeave={handleModelMouseLeave}
																				title={
																					isAgentActive
																						? "当前会话有任务在执行，无法切换模型"
																						: m.name || m.id
																				}
																				style={{
																					width: "100%",
																					display: "flex",
																					alignItems: "center",
																					justifyContent: "space-between",
																					padding: "7px 10px",
																					borderRadius: 8,
																					background:
																						isSelected || isHovered
																							? "var(--bg-hover)"
																							: "transparent",
																					border: "none",
																					color: isSelected
																						? "var(--accent)"
																						: "var(--text)",
																					fontSize: 12,
																					cursor: isAgentActive
																						? "not-allowed"
																						: "pointer",
																					opacity:
																						isAgentActive && !isSelected
																							? 0.75
																							: 1,
																					textAlign: "left",
																					transition:
																						"background-color 0.1s, opacity 0.1s",
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
																							fontWeight: isSelected
																								? 600
																								: 400,
																							overflow: "hidden",
																							textOverflow: "ellipsis",
																							whiteSpace: "nowrap",
																						}}
																					>
																						{m.name || m.id}
																					</span>
																				</div>
																				<div
																					style={{
																						display: "flex",
																						alignItems: "center",
																						gap: 4,
																						flexShrink: 0,
																					}}
																				>
																					{supportsThinking ? (
																						<>
																							<span
																								style={{
																									fontSize: 11,
																									color: "var(--muted)",
																									fontWeight: 400,
																								}}
																							>
																								{isSelected
																									? formatThinkingDisplay(
																											thinkingLevel,
																										)
																									: "High"}
																							</span>
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
																								}}
																							>
																								<polyline points="9 18 15 12 9 6" />
																							</svg>
																						</>
																					) : (
																						isSelected && (
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
																						)
																					)}
																				</div>
																			</button>
																		)
																	})}
																</div>
															</div>
														),
													)
												)}
											</div>
											{onOpenModelSelector && (
												<div
													style={{
														padding: 6,
														borderTop: "1px solid var(--border)",
													}}
												>
													<button
														type="button"
														onClick={() => {
															setIsModelMenuOpen(false)
															setHoveredModelId(null)
															onOpenModelSelector()
														}}
														title="Model Catalog & Settings"
														style={{
															width: "100%",
															display: "flex",
															alignItems: "center",
															justifyContent: "space-between",
															padding: "7px 10px",
															borderRadius: 8,
															background: "transparent",
															border: "none",
															color: "var(--dim)",
															fontSize: 12,
															cursor: "pointer",
															textAlign: "left",
															transition: "background-color 0.1s, color 0.1s",
															minWidth: 0,
														}}
														onMouseEnter={(e) => {
															e.currentTarget.style.backgroundColor =
																"var(--bg-hover)"
															e.currentTarget.style.color = "var(--text)"
														}}
														onMouseLeave={(e) => {
															e.currentTarget.style.backgroundColor =
																"transparent"
															e.currentTarget.style.color = "var(--dim)"
														}}
													>
														<div
															style={{
																display: "flex",
																alignItems: "center",
																gap: 6,
																minWidth: 0,
																overflow: "hidden",
																flex: 1,
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
																style={{ flexShrink: 0 }}
															>
																<path d="M12 20v-6M6 20V10M18 20V4" />
															</svg>
															<span
																style={{
																	overflow: "hidden",
																	textOverflow: "ellipsis",
																	whiteSpace: "nowrap",
																}}
															>
																Model Catalog & Settings
															</span>
														</div>
														<svg
															width="12"
															height="12"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															style={{ flexShrink: 0, marginLeft: 6 }}
														>
															<polyline points="9 18 15 12 9 6" />
														</svg>
													</button>
												</div>
											)}
										</div>

										{/* Secondary Flyout Submenu for Thinking Effort */}
										{hoveredModelId &&
											hoveredLevels &&
											hoveredLevels.length > 0 && (
												<div
													onMouseEnter={handleFlyoutMouseEnter}
													onMouseLeave={handleFlyoutMouseLeave}
													style={{
														position: "absolute",
														left: "calc(100% + 8px)",
														top: hoveredSubmenuTop,
														minWidth: 130,
														background: "var(--bg)",
														border: "1px solid var(--border)",
														borderRadius: 12,
														boxShadow: "var(--shadow-popover)",
														padding: 6,
														display: "flex",
														flexDirection: "column",
														gap: 2,
														zIndex: 210,
													}}
												>
													{/* Invisible hover bridge to prevent mouseleave when crossing 8px gap */}
													<div
														style={{
															position: "absolute",
															left: -12,
															top: -4,
															width: 14,
															height: "calc(100% + 8px)",
														}}
													/>
													{hoveredLevels.map((lvl) => {
														const isLvlSelected =
															hoveredModelId === currentModelId
																? (thinkingLevel || "medium") === lvl.id
																: false
														return (
															<button
																key={lvl.id}
																type="button"
																onClick={() => {
																	if (isAgentActive) {
																		showBusyPrompt(
																			"当前会话有任务在执行，无法切换模型",
																		)
																		return
																	}
																	onSelectModel?.(hoveredModelId)
																	onSelectThinkingLevel?.(lvl.id)
																	setIsModelMenuOpen(false)
																	setHoveredModelId(null)
																	setModelSearch("")
																}}
																title={
																	isAgentActive
																		? "当前会话有任务在执行，无法切换模型"
																		: undefined
																}
																style={{
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "space-between",
																	padding: "7px 10px",
																	borderRadius: 8,
																	background: isLvlSelected
																		? "var(--bg-hover)"
																		: "transparent",
																	border: "none",
																	color: isLvlSelected
																		? "var(--accent)"
																		: "var(--text)",
																	fontSize: 12,
																	cursor: isAgentActive
																		? "not-allowed"
																		: "pointer",
																	opacity:
																		isAgentActive && !isLvlSelected ? 0.75 : 1,
																	textAlign: "left",
																	width: "100%",
																	gap: 12,
																	transition:
																		"background-color 0.1s, opacity 0.1s",
																}}
																onMouseEnter={(e) => {
																	if (!isLvlSelected)
																		e.currentTarget.style.backgroundColor =
																			"var(--bg-hover)"
																}}
																onMouseLeave={(e) => {
																	if (!isLvlSelected)
																		e.currentTarget.style.backgroundColor =
																			"transparent"
																}}
															>
																<span>{lvl.label}</span>
																{isLvlSelected && (
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
											)}
									</div>
								)}
							</div>

							{/* Mode Selector */}
							<div style={{ position: "relative" }} ref={modeMenuRef}>
								<button
									type="button"
									onClick={() => {
										setIsModeMenuOpen(!isModeMenuOpen)
										setIsModelMenuOpen(false)
										setShowThinkingSlider(false)
										setIsPermissionMenuOpen(false)
										setHoveredModelId(null)
									}}
									title={`Execution Mode: ${currentModeConfig.label}`}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										height: 32,
										padding: "0 8px",
										boxSizing: "border-box",
										borderRadius: 8,
										background: isModeMenuOpen
											? "var(--bg-hover)"
											: "transparent",
										border: "none",
										color: "var(--text)",
										fontSize: modeFontSize,
										fontWeight: 500,
										cursor: "pointer",
										fontFamily: "inherit",
										lineHeight: 1,
										whiteSpace: "nowrap",
										flexShrink: 0,
										transition: "background-color 0.15s",
									}}
									onMouseEnter={(e) => {
										if (!isModeMenuOpen)
											e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									}}
									onMouseLeave={(e) => {
										if (!isModeMenuOpen)
											e.currentTarget.style.backgroundColor = "transparent"
									}}
								>
									<span style={{ whiteSpace: "nowrap" }}>
										{currentModeConfig.label}
									</span>
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
											transform: isModeMenuOpen ? "rotate(180deg)" : "none",
											transition: "transform 0.15s",
											flexShrink: 0,
										}}
									>
										<polyline points="18 15 12 9 6 15" />
									</svg>
								</button>

								{/* Mode Popover */}
								{isModeMenuOpen && (
									<div
										style={{
											position: "absolute",
											bottom: "calc(100% + 10px)",
											left: 0,
											width: 280,
											background: "var(--bg)",
											border: "1px solid var(--border)",
											borderRadius: 12,
											boxShadow: "var(--shadow-popover)",
											padding: 6,
											display: "flex",
											flexDirection: "column",
											gap: 2,
											zIndex: 200,
										}}
									>
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
											Execution Mode
										</div>
										{busyPrompt && (
											<div
												style={{
													margin: "2px 4px 4px",
													padding: "6px 10px",
													borderRadius: 6,
													background: "var(--tool-error-bg)",
													border: "1px solid var(--tool-border-error)",
													color: "var(--error)",
													fontSize: 11,
													fontWeight: 500,
													lineHeight: 1.4,
													display: "flex",
													alignItems: "center",
													gap: 6,
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
													style={{ flexShrink: 0 }}
												>
													<circle cx="12" cy="12" r="10" />
													<line x1="12" y1="8" x2="12" y2="12" />
													<line x1="12" y1="16" x2="12.01" y2="16" />
												</svg>
												<span>{busyPrompt}</span>
											</div>
										)}
										{MODE_OPTIONS.map((opt) => {
											const isSelected = opt.id === modeId
											return (
												<button
													key={opt.id}
													type="button"
													onClick={() => {
														if (isAgentActive) {
															showBusyPrompt(
																"当前会话有任务在执行，无法切换执行模式",
															)
															return
														}
														onSelectMode?.(opt.id)
														setIsModeMenuOpen(false)
													}}
													title={
														isAgentActive
															? "当前会话有任务在执行，无法切换执行模式"
															: `${opt.label}: ${opt.description}`
													}
													style={{
														width: "100%",
														display: "flex",
														alignItems: "flex-start",
														justifyContent: "space-between",
														padding: "6px 8px",
														borderRadius: 6,
														background: isSelected
															? "var(--bg-hover)"
															: "transparent",
														border: "none",
														color: isSelected ? "var(--accent)" : "var(--text)",
														fontSize: 12,
														cursor: isAgentActive ? "not-allowed" : "pointer",
														opacity: isAgentActive && !isSelected ? 0.75 : 1,
														textAlign: "left",
														gap: 8,
														transition: "background-color 0.1s, opacity 0.1s",
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
															gap: 2,
															minWidth: 0,
														}}
													>
														<div
															style={{
																display: "flex",
																alignItems: "center",
																gap: 6,
															}}
														>
															<span
																style={{
																	fontWeight: isSelected ? 600 : 500,
																	whiteSpace: "nowrap",
																}}
															>
																{opt.label}
															</span>
														</div>
														<span
															style={{
																fontSize: 11,
																color: "var(--dim)",
																lineHeight: "1.3",
															}}
														>
															{opt.description}
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
															style={{ flexShrink: 0, marginTop: 2 }}
														>
															<polyline points="20 6 9 17 4 12" />
														</svg>
													)}
												</button>
											)
										})}

										{onOpenGraphViewer && (
											<>
												<div
													style={{
														height: 1,
														backgroundColor: "var(--border)",
														margin: "4px -6px",
													}}
												/>
												<button
													type="button"
													onClick={() => {
														setIsModeMenuOpen(false)
														onOpenGraphViewer()
													}}
													title="View Execution Graph Topology..."
													style={{
														width: "100%",
														display: "flex",
														alignItems: "center",
														justifyContent: "space-between",
														padding: "7px 10px",
														borderRadius: 8,
														background: "transparent",
														border: "none",
														color: "var(--dim)",
														fontSize: 12,
														cursor: "pointer",
														textAlign: "left",
														transition: "background-color 0.1s, color 0.1s",
														minWidth: 0,
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.backgroundColor =
															"var(--bg-hover)"
														e.currentTarget.style.color = "var(--text)"
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.backgroundColor =
															"transparent"
														e.currentTarget.style.color = "var(--dim)"
													}}
												>
													<div
														style={{
															display: "flex",
															alignItems: "center",
															gap: 6,
															minWidth: 0,
															overflow: "hidden",
															flex: 1,
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
															style={{ flexShrink: 0 }}
														>
															<circle cx="6" cy="6" r="3" />
															<circle cx="18" cy="18" r="3" />
															<circle cx="18" cy="6" r="3" />
															<path d="M8.5 7.5L15.5 16.5" />
															<path d="M8.5 6h7" />
														</svg>
														<span
															style={{
																overflow: "hidden",
																textOverflow: "ellipsis",
																whiteSpace: "nowrap",
															}}
														>
															View Execution Graph Topology...
														</span>
													</div>
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
														style={{ flexShrink: 0, marginLeft: 6 }}
													>
														<polyline points="9 18 15 12 9 6" />
													</svg>
												</button>
											</>
										)}
									</div>
								)}
							</div>
						</div>

						{/* Right: Permission Pill & Action Button */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								position: "relative",
								flexWrap: "nowrap",
								flexShrink: 0,
							}}
						>
							{/* Permission pill button */}
							<button
								type="button"
								onClick={() => {
									setIsPermissionMenuOpen(!isPermissionMenuOpen)
									setIsModelMenuOpen(false)
									setShowThinkingSlider(false)
									setIsModeMenuOpen(false)
									setHoveredModelId(null)
								}}
								title={`Permission: ${permissionLabel}`}
								aria-label={`Permission: ${permissionLabel}`}
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: isPermissionCompact ? "center" : "flex-start",
									gap: isPermissionCompact ? 0 : 5,
									width: isPermissionCompact ? 32 : "auto",
									height: 32,
									padding: isPermissionCompact ? 0 : "0 8px",
									boxSizing: "border-box",
									borderRadius: 8,
									background: isPermissionMenuOpen
										? "var(--bg-hover)"
										: "transparent",
									border: "none",
									color:
										isPermissionCompact && !isPermissionMenuOpen
											? "var(--muted)"
											: "var(--text)",
									fontSize: permissionFontSize,
									fontWeight: 500,
									cursor: "pointer",
									fontFamily: "inherit",
									lineHeight: 1,
									whiteSpace: "nowrap",
									flexShrink: 0,
									transition: "background-color 0.15s, color 0.15s",
								}}
								onMouseEnter={(e) => {
									if (!isPermissionMenuOpen) {
										e.currentTarget.style.backgroundColor = "var(--bg-hover)"
										e.currentTarget.style.color = "var(--text)"
									}
								}}
								onMouseLeave={(e) => {
									if (!isPermissionMenuOpen) {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = isPermissionCompact
											? "var(--muted)"
											: "var(--text)"
									}
								}}
							>
								<PermissionIcon
									mode={permissionMode}
									size={isPermissionCompact ? 15 : 12}
									color={isPermissionCompact ? "currentColor" : "var(--muted)"}
								/>
								{!isPermissionCompact && (
									<>
										<span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
											{permissionLabel}
										</span>
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
												transform: isPermissionMenuOpen
													? "rotate(180deg)"
													: "none",
												transition: "transform 0.15s",
												flexShrink: 0,
											}}
										>
											<polyline points="18 15 12 9 6 15" />
										</svg>
									</>
								)}
							</button>

							{/* Upward Permission Popover */}
							{isPermissionMenuOpen && (
								<div
									ref={permissionMenuRef}
									style={{
										position: "absolute",
										bottom: "calc(100% + 10px)",
										right: isPermissionCompact ? 38 : 40,
										width: 250,
										background: "var(--bg)",
										border: "1px solid var(--border)",
										borderRadius: 12,
										boxShadow: "var(--shadow-popover)",
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
												title={`${opt.label}: ${opt.description}`}
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
														e.currentTarget.style.backgroundColor =
															"transparent"
												}}
											>
												<div
													style={{
														marginTop: 2,
														color: isSelected
															? "var(--accent)"
															: "var(--muted)",
													}}
												>
													<PermissionIcon mode={opt.id} size={14} />
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
											boxShadow: "var(--shadow-sm)",
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
										aria-label={
											isAgentActive ? "Queue message" : "Send message"
										}
										style={{
											width: 32,
											height: 32,
											borderRadius: "50%",
											background: "var(--action)",
											border: "none",
											color: "var(--on-accent)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											cursor: "pointer",
											boxShadow:
												"0 2px 6px color-mix(in srgb, var(--action) 35%, transparent)",
											transition: "background-color 0.15s, transform 0.1s",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.backgroundColor =
												"var(--action-hover)"
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor = "var(--action)"
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
												"color-mix(in srgb, var(--error) 10%, transparent)"
											e.currentTarget.style.borderColor =
												"color-mix(in srgb, var(--error) 30%, transparent)"
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor =
												"var(--bg-elevated)"
											e.currentTarget.style.borderColor = "var(--border)"
										}}
									>
										<div
											style={{
												width: 10,
												height: 10,
												background: "var(--error)",
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

			<ImagePreviewModal
				src={previewImage}
				onClose={() => setPreviewImage(null)}
			/>
		</div>
	)
}
