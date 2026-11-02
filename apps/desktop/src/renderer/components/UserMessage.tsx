import { useState, useEffect, useRef, memo } from "react"
import type { Message, MessageContent } from "../types/ipc"
import { normalizeMessageContent } from "../utils/messageParser"
import { ImagePreviewModal } from "./ImagePreviewModal"

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
	const contentRef = useRef<HTMLDivElement>(null)

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
	const displayText = cleanedText || text

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
		const textToCopy = displayText || text
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
		// Spacing lives in padding rather than margin so the pinned card's
		// background reaches the very top edge; otherwise scrolled content
		// shows through the gap above it.
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
					{displayText}

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
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="var(--muted)"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
										style={{ flexShrink: 0 }}
									>
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
										<polyline points="14 2 14 8 20 8" />
									</svg>
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
								<img
									key={i}
									src={img.src}
									alt={img.name || "User attachment"}
									title={img.name || "Click to zoom"}
									onClick={(e) => {
										e.stopPropagation()
										setPreviewImage(img.src)
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
							<svg
								width="10"
								height="10"
								viewBox="0 0 10 10"
								fill="none"
								stroke="var(--muted)"
								strokeWidth="1.3"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{ marginBottom: 2 }}
							>
								<path d="M2 3.5L5 6.5L8 3.5" />
							</svg>
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
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					) : (
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					)}
				</button>
			</div>

			{/* Fullscreen image preview modal */}
			<ImagePreviewModal
				src={previewImage}
				onClose={() => setPreviewImage(null)}
			/>
		</div>
	)
})
