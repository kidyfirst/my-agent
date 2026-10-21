import type { MessageContent } from "../types/ipc"

export interface ParsedThinkingResult {
	extractedThinking: string
	cleanText: string
	isStreamingThinking: boolean
}

/**
 * Extract thinking tags (<think>, <thought>, <reasoning>, <thinking>) from raw text.
 * Handles both closed tags and unclosed tags during active streaming.
 */
export function extractThinkingFromText(rawText: string): ParsedThinkingResult {
	if (!rawText || typeof rawText !== "string") {
		return { extractedThinking: "", cleanText: "", isStreamingThinking: false }
	}

	const thinkingParts: string[] = []

	// Match closed thinking tags: <think>...</think>, <thought>...</thought>, etc.
	const tagRegex = /<(think|thought|reasoning|thinking)>([\s\S]*?)<\/\1>/gi
	const withoutClosed = rawText.replace(tagRegex, (_match, _tag, content) => {
		const trimmed = String(content || "").trim()
		if (trimmed) {
			thinkingParts.push(trimmed)
		}
		return ""
	})

	// Check for unclosed thinking tag at the end (active streaming)
	const unclosedMatch = withoutClosed.match(
		/<(think|thought|reasoning|thinking)>([\s\S]*)$/i,
	)
	let isStreamingThinking = false
	let cleanText = ""

	if (unclosedMatch) {
		isStreamingThinking = true
		const streamingContent = String(unclosedMatch[2] || "").trim()
		if (streamingContent) {
			thinkingParts.push(streamingContent)
		}
		cleanText = withoutClosed.slice(0, unclosedMatch.index).trim()
	} else {
		cleanText = withoutClosed.trim()
	}

	return {
		extractedThinking: thinkingParts.join("\n\n"),
		cleanText,
		isStreamingThinking,
	}
}

/**
 * Normalizes message content into an array of MessageContent objects.
 * Handles strings, primitive arrays, parts arrays, and object variants.
 */
export function normalizeMessageContent(
	rawContent: unknown,
	fallbackText?: string,
): MessageContent[] {
	if (typeof rawContent === "string") {
		const trimmed = rawContent.trim()
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				const parsed = JSON.parse(trimmed)
				return normalizeMessageContent(parsed, fallbackText)
			} catch {}
		}
		return [{ type: "text", text: rawContent }]
	}

	if (Array.isArray(rawContent)) {
		const blocks: MessageContent[] = []
		for (const item of rawContent) {
			if (typeof item === "string") {
				blocks.push({ type: "text", text: item })
			} else if (item && typeof item === "object") {
				const obj = item as Record<string, unknown>
				const type = String(obj.type || "").toLowerCase()
				if (type === "data-user-message" && obj.data) {
					const d = obj.data as any
					const userText =
						typeof d.contents === "string"
							? d.contents
							: typeof d.content === "string"
								? d.content
								: typeof d.text === "string"
									? d.text
									: ""
					if (userText) {
						blocks.push({
							type: "text",
							text: userText,
						})
						continue
					}
				}
				if (type === "user") {
					const userText =
						typeof obj.text === "string"
							? obj.text
							: typeof obj.content === "string"
								? obj.content
								: ""
					if (userText) {
						blocks.push({
							type: "text",
							text: userText,
						})
						continue
					}
				}
				if (type === "text-delta" && typeof obj.text === "string") {
					blocks.push({
						type: "text",
						text: obj.text,
					})
					continue
				}
				if (type === "file") {
					const mediaType = String(obj.mediaType || obj.mimeType || "")
					const filename = String(obj.filename || obj.name || "")
					const isImage =
						mediaType.startsWith("image/") ||
						/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(filename)
					if (isImage) {
						blocks.push({
							type: "image",
							data: (obj.data as string) || (obj.image as string) || "",
							mimeType: mediaType || "image/png",
							name: filename || "image.png",
							url:
								(obj.url as string) ||
								(typeof obj.data === "string" && obj.data.startsWith("data:")
									? (obj.data as string)
									: undefined),
						})
						continue
					}
					blocks.push({
						type: "file",
						data: obj.data as string,
						name: filename || "attachment",
						mimeType: mediaType || "text/plain",
						size: obj.size as number | undefined,
					})
					continue
				}
				if (type === "image") {
					const mediaType = String(obj.mimeType || obj.mediaType || "image/png")
					const filename = String(obj.name || obj.filename || "image.png")
					blocks.push({
						type: "image",
						data: (obj.data as string) || (obj.image as string) || "",
						mimeType: mediaType,
						name: filename,
						url:
							(obj.url as string) ||
							(typeof obj.data === "string" && obj.data.startsWith("data:")
								? (obj.data as string)
								: undefined),
					})
					continue
				}
				if (!type) {
					if (obj.text != null || obj.content != null || obj.value != null) {
						blocks.push({
							type: "text",
							text: String(obj.text ?? obj.content ?? obj.value ?? ""),
						})
					} else {
						blocks.push(obj as MessageContent)
					}
				} else {
					blocks.push(obj as MessageContent)
				}
			}
		}
		if (blocks.length > 0) return blocks
	}

	if (rawContent && typeof rawContent === "object") {
		const rc = rawContent as Record<string, unknown>
		if (Array.isArray(rc.parts)) {
			return normalizeMessageContent(rc.parts, fallbackText)
		}
		if (rc.text != null || rc.content != null || rc.value != null) {
			const textVal = rc.text ?? rc.content ?? rc.value
			if (typeof textVal === "string") {
				return [{ type: "text", text: textVal }]
			}
			if (Array.isArray(textVal)) {
				return normalizeMessageContent(textVal, fallbackText)
			}
		}
		if (rc.type) {
			return [rc as MessageContent]
		}
	}

	if (fallbackText) {
		return [{ type: "text", text: String(fallbackText) }]
	}

	return []
}

export interface ExtractedMessageDetails {
	text: string
	thinking: string
	isStreamingThinking: boolean
	hasRedactedThinking: boolean
}

/**
 * Extracts unified text, thinking, and streaming state from a message's content.
 */
export function extractMessageDetails(
	rawContent: unknown,
	fallbackText?: string,
): ExtractedMessageDetails {
	const contentArray = normalizeMessageContent(rawContent, fallbackText)
	const rawTextParts: string[] = []
	const structuredThinkingParts: string[] = []
	let hasRedactedThinking = false

	for (const block of contentArray) {
		const b = block as Record<string, unknown>
		const type = String(b.type || "")
			.toLowerCase()
			.replace(/[-_]/g, "")

		if (type === "thinking" || type === "reasoning" || type === "thought") {
			const thinkText = String(
				b.thinking ?? b.reasoning ?? b.thought ?? b.text ?? b.content ?? "",
			).trim()
			if (thinkText) {
				structuredThinkingParts.push(thinkText)
			}
		} else if (type === "redactedthinking") {
			hasRedactedThinking = true
		} else if (
			type === "text" ||
			type === "output" ||
			type === "message" ||
			type === ""
		) {
			const textVal = String(b.text ?? b.content ?? b.value ?? "")
			if (textVal) {
				rawTextParts.push(textVal)
			}
		}
	}

	const rawCombinedText = rawTextParts.join("")
	const { extractedThinking, cleanText, isStreamingThinking } =
		extractThinkingFromText(rawCombinedText)

	const allThinking = [
		...structuredThinkingParts,
		...(extractedThinking ? [extractedThinking] : []),
	].join("\n\n")

	return {
		text: cleanText,
		thinking: allThinking,
		isStreamingThinking,
		hasRedactedThinking,
	}
}
