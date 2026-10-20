import type { Message, MessageContent } from "../types/ipc"
import { normalizeMessageContent } from "../utils/messageParser"

interface UserMessageProps {
	message: Message
}

export function UserMessage({ message }: UserMessageProps) {
	const contentArray = normalizeMessageContent(message.content, (message as any).text)

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

	const images = contentArray.filter(
		(c: MessageContent) => c.type === "image",
	)

	return (
		<div
			style={{
				display: "flex",
				justifyContent: "flex-end",
				margin: "8px 0",
			}}
		>
			<div
				style={{
					padding: "10px 14px",
					background: "var(--user-message-bg)",
					border: "1px solid var(--border-muted)",
					borderRadius: 8,
					color: "var(--user-message-text)",
					fontSize: 13,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					maxWidth: "70%",
					textAlign: "left",
				}}
			>
				{text}
				{images && images.length > 0 && (
					<div
						style={{
							marginTop: 8,
							display: "flex",
							gap: 8,
							flexWrap: "wrap",
							justifyContent: "flex-end",
						}}
					>
						{images.map((img: MessageContent, i: number) => {
							const imgData = img as unknown as {
								mimeType?: string
								data?: string
								url?: string
							}
							const src = imgData.url
								? imgData.url
								: imgData.data
								? `data:${imgData.mimeType || "image/png"};base64,${imgData.data}`
								: ""
							if (!src) return null
							return (
								<img
									key={i}
									src={src}
									style={{
										maxWidth: 300,
										maxHeight: 200,
										borderRadius: 6,
										border: "1px solid var(--border-muted)",
									}}
								/>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}
