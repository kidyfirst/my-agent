import { useState, useEffect, useRef, useMemo, memo } from "react"
import { createPortal } from "react-dom"
import type { Message, MessageContent } from "../types/ipc"
import { normalizeMessageContent } from "../utils/messageParser"
import { ImagePreviewModal } from "./ImagePreviewModal"
import {
	FileIcon,
	ChevronDownIcon,
	CheckIcon,
	CopyIcon,
	ImageOffIcon,
	ZapIcon,
} from "./icons"

export interface ParsedSkillMessage {
	skillName: string
	skillScope?: "project" | "global"
	skillDescription?: string
	skillInstructions?: string
	userQuestion: string
}

export function parseSkillMessage(text: string): ParsedSkillMessage | null {
	if (!text) return null

	// Match: # Activated Skill: <name> (<scope> skill)
	const activatedMatch = text.match(
		/^# Activated Skill:\s*([^\n(]+)(?:\s*\((project|global)\s*skill\))?/i,
	)

	if (activatedMatch) {
		const skillName = activatedMatch[1].trim()
		if (!skillName) return null
		const skillScope =
			(activatedMatch[2]?.toLowerCase() as "project" | "global") || "global"

		// Extract description
		const descMatch = text.match(/\nDescription:\s*([^\n]+)/i)
		const skillDescription = descMatch ? descMatch[1].trim() : undefined

		// Extract instructions
		const instructionsMatch = text.match(
			/\n## Skill Instructions\s*\n([\s\S]*?)(?=\n## User Task|$)/i,
		)
		const skillInstructions = instructionsMatch
			? instructionsMatch[1].trim()
			: undefined

		// Extract user task / question
		const userTaskMatch = text.match(/\n## User Task\s*\n([\s\S]*)$/i)
		const userQuestion = userTaskMatch ? userTaskMatch[1].trim() : ""

		return {
			skillName,
			skillScope,
			skillDescription,
			skillInstructions,
			userQuestion,
		}
	}

	return null
}

export function UserMessageSkillCard({
	parsedSkill,
}: {
	parsedSkill: ParsedSkillMessage
}) {
	const [hovered, setHovered] = useState(false)
	const [popoverPos, setPopoverPos] = useState<{
		top: number
		left: number
	} | null>(null)
	const anchorRef = useRef<HTMLDivElement>(null)
	const isProject = parsedSkill.skillScope === "project"

	const updatePos = () => {
		if (anchorRef.current && typeof window !== "undefined") {
			const rect = anchorRef.current.getBoundingClientRect()
			const maxWidth = Math.min(360, window.innerWidth - 24)
			let left = rect.left
			if (left + maxWidth > window.innerWidth - 12) {
				left = window.innerWidth - 12 - maxWidth
			}
			if (left < 12) left = 12

			const maxHeight = 240
			let top = rect.bottom + 6
			if (
				top + maxHeight > window.innerHeight - 12 &&
				rect.top > maxHeight + 12
			) {
				top = rect.top - 6 - maxHeight
			}

			setPopoverPos({
				top: Math.max(12, top),
				left,
			})
		}
	}

	const handleMouseEnter = () => {
		updatePos()
		setHovered(true)
	}

	const handleMouseLeave = () => {
		setHovered(false)
	}

	useEffect(() => {
		if (!hovered) return
		const handleDismiss = () => setHovered(false)
		window.addEventListener("scroll", handleDismiss, true)
		window.addEventListener("resize", handleDismiss)
		return () => {
			window.removeEventListener("scroll", handleDismiss, true)
			window.removeEventListener("resize", handleDismiss)
		}
	}, [hovered])

	return (
		<div
			ref={anchorRef}
			style={{
				position: "relative",
				display: "inline-block",
				marginBottom: 6,
			}}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onClick={(e) => e.stopPropagation()}
		>
			{/* Pill Badge */}
			<div
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					padding: "2px 8px",
					borderRadius: 6,
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					cursor: "pointer",
					userSelect: "none",
					transition: "background 0.15s, border-color 0.15s",
					maxWidth: "100%",
				}}
			>
				<ZapIcon
					size={12}
					style={{
						color: "var(--accent)",
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						fontWeight: 600,
						fontSize: 12,
						color: "var(--text)",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{parsedSkill.skillName}
				</span>
			</div>

			{/* Floating Hover Preview Card rendered in document.body via portal */}
			{hovered &&
				(typeof document !== "undefined"
					? createPortal(
							<div
								style={{
									position: "fixed",
									top: popoverPos?.top ?? 0,
									left: popoverPos?.left ?? 0,
									zIndex: 99999,
									width: "max-content",
									minWidth: 200,
									maxWidth: "min(360px, calc(100vw - 24px))",
									maxHeight: 240,
									boxSizing: "border-box",
									overflowY: "auto",
									overflowX: "hidden",
									wordBreak: "break-word",
									overflowWrap: "anywhere",
									scrollbarWidth: "thin",
									scrollbarColor: "var(--border) transparent",
									background: "var(--bg-elevated)",
									border: "1px solid var(--border)",
									borderRadius: 8,
									boxShadow: "var(--shadow-popover)",
									padding: "10px 12px",
									display: "flex",
									flexDirection: "column",
									gap: 8,
									pointerEvents: "auto",
									cursor: "default",
								}}
								onMouseEnter={() => setHovered(true)}
								onMouseLeave={() => setHovered(false)}
							>
								<div
									style={{
										display: "flex",
										alignItems: "flex-start",
										justifyContent: "space-between",
										gap: 8,
										minWidth: 0,
									}}
								>
									<span
										style={{
											fontSize: 13,
											fontWeight: 600,
											color: "var(--text)",
											wordBreak: "break-word",
											overflowWrap: "anywhere",
											lineHeight: 1.35,
											flex: 1,
											minWidth: 0,
										}}
									>
										{parsedSkill.skillName}
									</span>
									<span
										style={{
											fontSize: 10,
											fontWeight: 500,
											padding: "1px 5px",
											borderRadius: 4,
											border: isProject
												? "1px solid var(--border-accent)"
												: "1px solid var(--tool-border-success)",
											background: isProject
												? "var(--selected-bg)"
												: "var(--tool-success-bg)",
											color: isProject ? "var(--accent)" : "var(--success)",
											fontFamily: isProject ? "var(--font-mono)" : "inherit",
											flexShrink: 0,
											whiteSpace: "nowrap",
										}}
									>
										{isProject ? "project skill" : "global skill"}
									</span>
								</div>

								{parsedSkill.skillDescription && (
									<div
										style={{
											fontSize: 11,
											color: "var(--muted)",
											lineHeight: 1.45,
											wordBreak: "break-word",
											overflowWrap: "anywhere",
											whiteSpace: "pre-wrap",
										}}
									>
										{parsedSkill.skillDescription}
									</div>
								)}
							</div>,
							document.body,
						)
					: null)}
		</div>
	)
}

interface UserMessageProps {
	message: Message
	/**
	 * Pin the message to the top of the scroll viewport so the latest prompt stays
	 * visible. Disabled when the message is nested inside a bounded block (replay
	 * containers), where sticking would lift it out of that block's border.
	 */
	pinned?: boolean
}

/** Collapsed content height; + 20px bubble padding = 80px total. */
const COLLAPSED_CONTENT_HEIGHT = 60
const IMAGE_HEIGHT = 60

export const UserMessage = memo(function UserMessage({
	message,
	pinned = true,
}: UserMessageProps) {
	const [copied, setCopied] = useState(false)
	const [previewImage, setPreviewImage] = useState<string | null>(null)
	const [expanded, setExpanded] = useState(false)
	const [overflowing, setOverflowing] = useState(false)
	const [isStuck, setIsStuck] = useState(false)
	const contentRef = useRef<HTMLDivElement>(null)
	const sentinelRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!pinned || expanded) {
			setIsStuck(false)
			return
		}
		const sentinel = sentinelRef.current
		if (!sentinel) return

		if (typeof IntersectionObserver === "undefined") {
			setIsStuck(true)
			return
		}

		const scrollParent = sentinel.closest(
			"[data-chat-scroll-container='true']",
		)
		if (!scrollParent) return

		const observer = new IntersectionObserver(
			([entry]) => {
				const rootTop = entry.rootBounds ? entry.rootBounds.top : 0
				const stuck =
					!entry.isIntersecting && entry.boundingClientRect.top < rootTop
				setIsStuck(stuck)
			},
			{
				root: scrollParent,
				threshold: [0, 1],
			},
		)

		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [pinned, expanded])

	const contentArray = normalizeMessageContent(
		message.content,
		(message as any).text,
	)

	const textParts = contentArray.filter(
		(c: MessageContent) => !c.type || c.type === "text",
	)
	const text =
		textParts.length > 0
			? textParts
					.map(
						(c: MessageContent) =>
							(c as unknown as { text?: string; content?: string }).text ??
							(c as unknown as { content?: string }).content ??
							"",
					)
					.join("")
			: typeof message.content === "string"
				? message.content
				: (message as any).text
					? String((message as any).text)
					: ""

	// 1. Collect images from contentArray, attachments, and files
	const rawImages: Array<{ src: string; name?: string }> = []
	const seenImageKeys = new Set<string>()

	for (const c of contentArray) {
		const isImg =
			c.type === "image" ||
			(c.type === "file" &&
				(String(c.mediaType || c.mimeType || "").startsWith("image/") ||
					/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(
						String(c.name || c.filename || ""),
					)))

		if (isImg) {
			const imgData = c as unknown as {
				mimeType?: string
				mediaType?: string
				data?: string
				url?: string
				name?: string
				filename?: string
			}
			const src = imgData.url
				? imgData.url
				: imgData.data
					? imgData.data.startsWith("data:")
						? imgData.data
						: `data:${imgData.mimeType || imgData.mediaType || "image/png"};base64,${imgData.data}`
					: ""
			const key = src.slice(0, 100) || imgData.name || ""
			if (src && !seenImageKeys.has(key)) {
				seenImageKeys.add(key)
				rawImages.push({ src, name: imgData.name || imgData.filename })
			}
		}
	}

	if (Array.isArray(message.attachments)) {
		for (const att of message.attachments) {
			const isImg =
				att.type === "image" ||
				att.mimeType?.startsWith("image/") ||
				/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(att.name)
			if (isImg) {
				const src =
					att.url ||
					att.preview ||
					(att.data
						? att.data.startsWith("data:")
							? att.data
							: `data:${att.mimeType || "image/png"};base64,${att.data}`
						: "")
				const key = src.slice(0, 100) || att.name
				if (src && !seenImageKeys.has(key)) {
					seenImageKeys.add(key)
					rawImages.push({ src, name: att.name })
				}
			}
		}
	}

	// 2. Collect non-image file attachments
	const rawFiles: Array<{ name: string; size?: number; mimeType?: string }> = []
	const seenFileNames = new Set<string>()

	for (const c of contentArray) {
		if (c.type === "file") {
			const mediaType = String(c.mediaType || c.mimeType || "")
			const name = String(c.name || c.filename || "Attachment")
			const isImg =
				mediaType.startsWith("image/") ||
				/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)
			if (!isImg && !seenFileNames.has(name)) {
				seenFileNames.add(name)
				rawFiles.push({
					name,
					mimeType: mediaType,
					size: c.size as number | undefined,
				})
			}
		}
	}

	if (Array.isArray(message.attachments)) {
		for (const att of message.attachments) {
			const isImg =
				att.type === "image" ||
				att.mimeType?.startsWith("image/") ||
				/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(att.name)
			if (!isImg && !seenFileNames.has(att.name)) {
				seenFileNames.add(att.name)
				rawFiles.push({ name: att.name, mimeType: att.mimeType })
			}
		}
	}

	// 3. Clean inlined file tags from displayed text if present
	const cleanedText = text
		? text
				.replace(/<file name="([^"]+)">[\s\S]*?<\/file>/g, (_, fname) => {
					if (!seenFileNames.has(fname)) {
						seenFileNames.add(fname)
						rawFiles.push({ name: fname })
					}
					return ""
				})
				.trim()
		: ""
	// Parse skill metadata if message was generated from an activated skill
	const parsedSkill = useMemo(() => {
		return parseSkillMessage(text)
	}, [text])

	const displayText = useMemo(() => {
		if (parsedSkill) {
			return parsedSkill.userQuestion
		}
		return cleanedText || text
	}, [parsedSkill, cleanedText, text])

	// Detect whether the content exceeds the collapsed height so we can show
	// a "click to expand" affordance and enable the toggle.
	useEffect(() => {
		const el = contentRef.current
		if (!el) return
		setOverflowing(el.scrollHeight > COLLAPSED_CONTENT_HEIGHT + 1)
	}, [displayText, rawFiles.length, rawImages.length])

	const handleBubbleClick = () => {
		if (!overflowing) return
		// Don't toggle while the user is selecting text
		if (window.getSelection()?.toString()) return
		setExpanded((v) => !v)
	}

	const handleCopy = async () => {
		const textToCopy = parsedSkill
			? parsedSkill.userQuestion
				? `/${parsedSkill.skillName} ${parsedSkill.userQuestion}`
				: `/${parsedSkill.skillName}`
			: displayText || text
		if (!textToCopy) return
		try {
			await navigator.clipboard.writeText(textToCopy)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error("Failed to copy user message:", err)
		}
	}

	const formatTime = (iso?: string) => {
		if (!iso) return ""
		try {
			const date = new Date(iso)
			if (isNaN(date.getTime())) return ""
			return date.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			})
		} catch {
			return ""
		}
	}

	const timeStr = formatTime(message.createdAt)

	return (
		<>
			{pinned && !expanded && (
				<div
					ref={sentinelRef}
					data-testid="sticky-sentinel"
					aria-hidden="true"
					style={{
						height: 1,
						marginBottom: -1,
						pointerEvents: "none",
						visibility: "hidden",
					}}
				/>
			)}
			{/* Spacing lives in padding rather than margin so the pinned card's
			    background reaches the very top edge; otherwise scrolled content
			    shows through the gap above it. */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					// Negative side margins + matching padding bleed the sticky
					// background over the column's side padding, so no strip of the
					// scrolled content peeks out beside the pinned card. The bubble
					// itself keeps exactly the same box.
					margin: pinned ? "0 -24px" : "0",
					padding: pinned ? "10px 24px 14px" : "2px 0 8px",
					minWidth: 0,
					maxWidth: "none",
					// Collapsed user messages stick to the top of the scroll viewport so
					// the latest one in view stays visible; a newer one paints over it.
					// Nested messages must not stick — the fade would leave the turn box.
					position: pinned && !expanded ? "sticky" : undefined,
					top: pinned && !expanded ? 0 : undefined,
					zIndex: pinned && !expanded ? 20 : undefined,
					background: pinned && !expanded ? "var(--bg)" : undefined,
				}}
			>
			<div
				style={{
					padding: "10px 14px",
					background: "var(--user-message-bg)",
					border: "1px solid var(--border-muted)",
					borderRadius: "14px 14px 2px 14px",
					color: "var(--user-message-text)",
					fontSize: 13,
					lineHeight: 1.5,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					overflowWrap: "anywhere",
					maxWidth: "75%",
					textAlign: "left",
					boxShadow: "var(--shadow-sm)",
					cursor: overflowing ? "pointer" : undefined,
				}}
				onClick={handleBubbleClick}
			>
				<div
					ref={contentRef}
					style={{
						maxHeight: expanded ? undefined : COLLAPSED_CONTENT_HEIGHT,
						overflow: "hidden",
						position: "relative",
					}}
				>
					{parsedSkill && <UserMessageSkillCard parsedSkill={parsedSkill} />}

					{displayText ? (
						<div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
							{displayText}
						</div>
					) : null}

					{/* Non-image file chips */}
					{rawFiles.length > 0 && (
						<div
							style={{
								marginTop: displayText ? 8 : 0,
								display: "flex",
								gap: 6,
								flexWrap: "wrap",
								justifyContent: "flex-end",
							}}
						>
							{rawFiles.map((file, i) => (
								<div
									key={i}
									title={file.name}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										padding: "4px 8px",
										borderRadius: 6,
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										fontSize: 11,
										color: "var(--text)",
										maxWidth: 220,
									}}
								>
									<FileIcon
										size={14}
										stroke="var(--muted)"
										strokeWidth={1.5}
										style={{ flexShrink: 0 }}
									/>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{file.name}
									</span>
								</div>
							))}
						</div>
					)}

					{/* Image attachments */}
					{rawImages.length > 0 && (
						<div
							style={{
								marginTop: displayText || rawFiles.length > 0 ? 8 : 0,
								display: "flex",
								gap: 8,
								flexWrap: "wrap",
								justifyContent: "flex-end",
							}}
						>
							{rawImages.map((img, i) => (
								<ImageAttachmentItem
									key={i}
									src={img.src}
									name={img.name}
									onZoom={setPreviewImage}
								/>
							))}
						</div>
					)}

					{overflowing && !expanded && (
						<div
							style={{
								position: "absolute",
								left: 0,
								right: 0,
								bottom: 0,
								height: 24,
								display: "flex",
								alignItems: "flex-end",
								justifyContent: "center",
								background:
									"linear-gradient(to bottom, transparent, var(--user-message-bg))",
								pointerEvents: "none",
							}}
						>
							<ChevronDownIcon
								size={10}
								stroke="var(--muted)"
								strokeWidth={1.5}
								style={{ marginBottom: 2 }}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Sub-bar below bubble aligned right: timestamp + copy button */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginTop: 4,
					marginRight: 2,
					fontSize: 11,
					color: "var(--dim)",
					userSelect: "none",
				}}
			>
				{timeStr && <span>{timeStr}</span>}
				<button
					type="button"
					onClick={handleCopy}
					title={copied ? "Copied" : "Copy"}
					aria-label={copied ? "Copied" : "Copy message"}
					style={{
						background: "none",
						border: "none",
						padding: "2px 4px",
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						color: copied ? "var(--success)" : "var(--dim)",
						borderRadius: 4,
						transition: "color 0.15s, background-color 0.15s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = copied
							? "var(--success)"
							: "var(--text)"
						e.currentTarget.style.backgroundColor = "var(--bg-hover)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = copied
							? "var(--success)"
							: "var(--dim)"
						e.currentTarget.style.backgroundColor = "transparent"
					}}
				>
					{copied ? (
						<CheckIcon size={13} strokeWidth={2} />
					) : (
						<CopyIcon size={13} strokeWidth={2} />
					)}
				</button>
			</div>

			{/* Fullscreen image preview modal */}
			<ImagePreviewModal
				src={previewImage}
				onClose={() => setPreviewImage(null)}
			/>

			{/* Gradient fade under sticky header */}
			{pinned && !expanded && (
				<div
					data-testid="sticky-fade-bottom"
					aria-hidden="true"
					style={{
						position: "absolute",
						top: "100%",
						left: 0,
						right: 0,
						height: 24,
						background: "linear-gradient(to bottom, var(--bg), transparent)",
						pointerEvents: "none",
						opacity: isStuck ? 1 : 0,
						transition: "opacity 0.2s ease",
					}}
				/>
			)}
		</div>
		</>
	)
})

function ImageAttachmentItem({
	src,
	name,
	onZoom,
}: {
	src: string
	name?: string
	onZoom: (src: string) => void
}) {
	const [hasError, setHasError] = useState(false)

	if (hasError) {
		return (
			<div
				title={`图片已失效或本地文件不存在: ${name || src}`}
				style={{
					height: IMAGE_HEIGHT,
					minWidth: 100,
					maxWidth: 220,
					borderRadius: 8,
					border: "1px dashed var(--border-muted)",
					background: "var(--bg-elevated)",
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 10px",
					fontSize: 11,
					color: "var(--muted)",
					userSelect: "none",
				}}
			>
				<ImageOffIcon
					size={14}
					strokeWidth={1.5}
					style={{ flexShrink: 0, opacity: 0.7 }}
				/>
				<span
					style={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{name || "图片缺失"}
				</span>
			</div>
		)
	}

	return (
		<img
			src={src}
			alt={name || "User attachment"}
			title={name || "Click to zoom"}
			onError={() => setHasError(true)}
			onClick={(e) => {
				e.stopPropagation()
				onZoom(src)
			}}
			style={{
				height: IMAGE_HEIGHT,
				width: "auto",
				maxWidth: "100%",
				borderRadius: 8,
				border: "1px solid var(--border-muted)",
				cursor: "pointer",
				objectFit: "contain",
				transition: "opacity 0.15s, transform 0.1s",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.opacity = "0.9"
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.opacity = "1"
			}}
		/>
	)
}
