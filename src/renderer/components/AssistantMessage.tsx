import React, { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message } from "../types/ipc"
import { extractMessageDetails } from "../utils/messageParser"
import { FilesChangedBar } from "./FilesChangedBar"
import { ImagePreviewModal } from "./ImagePreviewModal"

interface AssistantMessageProps {
	message: Message & { isStreaming?: boolean }
	onOpenDiff?: (path: string) => void
	isAgentActive?: boolean
}

interface CodeBlockProps {
	children: React.ReactNode
	className?: string
}

function CodeBlock({ children, className }: CodeBlockProps) {
	const [copied, setCopied] = useState(false)
	const match = /language-(\w+)/.exec(className || "")
	const lang = match ? match[1] : ""
	const rawCode = String(children).replace(/\n$/, "")

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(rawCode)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (e) {
			console.error("Failed to copy code snippet", e)
		}
	}

	return (
		<div
			style={{
				margin: "12px 0",
				borderRadius: 6,
				border: "1px solid var(--border-muted)",
				background: "var(--bg-surface)",
				overflow: "hidden",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "5px 12px",
					background: "var(--bg-elevated)",
					borderBottom: "1px solid var(--border-muted)",
					fontSize: 11,
					color: "var(--muted)",
					fontFamily: "var(--font-mono, 'SF Mono', Monaco, monospace)",
					userSelect: "none",
				}}
			>
				<span style={{ textTransform: "lowercase", fontWeight: 500 }}>
					{lang || "code"}
				</span>
				<button
					type="button"
					onClick={handleCopy}
					title={copied ? "Copied" : "Copy code"}
					aria-label={copied ? "Copied" : "Copy code"}
					style={{
						background: "none",
						border: "none",
						color: copied ? "var(--success)" : "var(--muted)",
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						gap: 4,
						fontSize: 11,
						padding: "2px 6px",
						borderRadius: 3,
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
							: "var(--muted)"
						e.currentTarget.style.backgroundColor = "transparent"
					}}
				>
					{copied ? (
						<>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
							<span>Copied</span>
						</>
					) : (
						<>
							<svg
								width="12"
								height="12"
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
							<span>Copy</span>
						</>
					)}
				</button>
			</div>
			<pre
				style={{
					margin: 0,
					padding: "10px 14px",
					overflowX: "auto",
					background: "transparent",
					border: "none",
					fontSize: 12,
					lineHeight: 1.5,
					fontFamily: "var(--font-mono, 'SF Mono', Monaco, monospace)",
				}}
			>
				<code className={className} style={{ background: "none", padding: 0 }}>
					{children}
				</code>
			</pre>
		</div>
	)
}

export const AssistantMessage = React.memo(function AssistantMessage({
	message,
	onOpenDiff,
	isAgentActive,
}: AssistantMessageProps) {
	const [showThinking, setShowThinking] = useState(false)
	const [copiedAnswer, setCopiedAnswer] = useState(false)
	const [previewImage, setPreviewImage] = useState<string | null>(null)

	const { text, thinking, isStreamingThinking, hasRedactedThinking } =
		extractMessageDetails(message.content, (message as any).text)

	const isError =
		message.stopReason === "error" || Boolean(message.errorMessage)
	const displayText =
		text ||
		(isError
			? message.errorMessage || "An error occurred during generation"
			: "")
	const isActivelyStreaming = Boolean(message.isStreaming)
	const lineCount = thinking ? thinking.split("\n").length : 0

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

	const handleCopyAnswer = async () => {
		if (!displayText) return
		try {
			await navigator.clipboard.writeText(displayText)
			setCopiedAnswer(true)
			setTimeout(() => setCopiedAnswer(false), 2000)
		} catch (err) {
			console.error("Failed to copy assistant answer:", err)
		}
	}

	return (
		<div
			style={{
				padding: "8px 0",
				lineHeight: 1.6,
				minWidth: 0,
				maxWidth: "100%",
				overflowWrap: "anywhere",
				wordBreak: "break-word",
			}}
		>
			{/* Thinking block with Antigravity style preview */}
			{(thinking || isStreamingThinking || hasRedactedThinking) && (
				<div style={{ marginBottom: 8 }}>
					<button
						type="button"
						onClick={() => setShowThinking(!showThinking)}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 8,
							padding: "3px 0",
							cursor: "pointer",
							fontSize: 13,
							background: "none",
							border: "none",
							color: "inherit",
							textAlign: "left",
						}}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: "#8b5cf6",
								flexShrink: 0,
								animation: isActivelyStreaming
									? "pulse 1.2s ease-in-out infinite"
									: undefined,
							}}
						/>
						<span style={{ color: "var(--muted)", fontWeight: 500 }}>
							Thinking...
						</span>
						{!showThinking && lineCount > 1 && (
							<span style={{ fontSize: 11, color: "var(--dim)" }}>
								({lineCount} lines)
							</span>
						)}
					</button>

					{/* Expanded thinking container */}
					{showThinking && thinking && (
						<div
							style={{
								marginTop: 4,
								paddingLeft: 14,
							}}
						>
							<div
								style={{
									padding: "6px 10px",
									background: "var(--bg-surface)",
									border: "1px solid var(--border-muted)",
									borderRadius: 6,
									color: "var(--thinking-text, var(--muted))",
									fontSize: 12,
									fontFamily: "var(--font-mono, monospace)",
									lineHeight: 1.5,
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
									maxHeight: 300,
									overflowY: "auto",
								}}
							>
								{thinking}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Active streaming placeholder when no text or thinking has arrived yet */}
			{isActivelyStreaming && !text && !thinking && !isStreamingThinking && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						color: "var(--muted)",
						fontSize: 13,
						padding: "6px 0",
					}}
				>
					<span
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: "var(--accent)",
							animation: "pulse 1.2s ease-in-out infinite",
						}}
					/>
					<span>Thinking...</span>
				</div>
			)}

			{/* Main text with streaming cursor */}
			{displayText && (
				<div
					className={isError ? "markdown-body is-error" : "markdown-body"}
					style={isError ? { color: "var(--error, #ef4444)" } : undefined}
				>
					<Markdown
						remarkPlugins={[remarkGfm]}
						components={{
							pre({ children }) {
								const codeElement = React.isValidElement(children)
									? children
									: null
								if (codeElement && codeElement.props) {
									const { className, children: codeChildren } =
										codeElement.props as {
											className?: string
											children?: React.ReactNode
										}
									return (
										<CodeBlock className={className}>{codeChildren}</CodeBlock>
									)
								}
								return <pre>{children}</pre>
							},
							img({ src, alt }) {
								if (!src) return null
								return (
									<img
										src={src}
										alt={alt || "Image"}
										title="Click to preview"
										onClick={() => setPreviewImage(src)}
										style={{
											maxWidth: "100%",
											maxHeight: 360,
											borderRadius: 8,
											border: "1px solid var(--border-muted)",
											cursor: "pointer",
											margin: "8px 0",
											transition: "opacity 0.15s",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.opacity = "0.9"
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.opacity = "1"
										}}
									/>
								)
							},
						}}
					>
						{displayText}
					</Markdown>
					{isActivelyStreaming && !isStreamingThinking && (
						<span
							style={{
								display: "inline-block",
								width: 2,
								height: 14,
								background: "var(--accent)",
								marginLeft: 2,
								animation: "blink 1s step-end infinite",
							}}
						/>
					)}
					<style>{`
						@keyframes blink {
							0%, 100% { opacity: 1; }
							50% { opacity: 0; }
						}
						@keyframes pulse {
							0%, 100% { opacity: 0.3; }
							50% { opacity: 1; }
						}
						.markdown-body {
							overflow-wrap: anywhere;
							word-break: break-word;
						}
						.markdown-body.is-error,
						.markdown-body.is-error p,
						.markdown-body.is-error li,
						.markdown-body.is-error span,
						.markdown-body.is-error strong,
						.markdown-body.is-error em,
						.markdown-body.is-error h1,
						.markdown-body.is-error h2,
						.markdown-body.is-error h3 {
							color: var(--error, #ef4444);
						}
						.markdown-body h1, .markdown-body h2, .markdown-body h3 {
							color: var(--text);
							margin: 16px 0 8px;
							font-weight: 600;
						}
						.markdown-body h1 { font-size: 18px; }
						.markdown-body h2 { font-size: 15px; }
						.markdown-body h3 { font-size: 14px; }
						.markdown-body p { margin: 6px 0; }
						.markdown-body ul, .markdown-body ol {
							padding-left: 20px;
							margin: 6px 0;
						}
						.markdown-body li { margin: 2px 0; }
						.markdown-body blockquote {
							border-left: 3px solid var(--border-muted);
							padding-left: 12px;
							color: var(--muted);
							margin: 8px 0;
						}
						.markdown-body table {
							border-collapse: collapse;
							margin: 8px 0;
							display: block;
							max-width: 100%;
							overflow-x: auto;
						}
						.markdown-body th, .markdown-body td {
							border: 1px solid var(--border);
							padding: 6px 10px;
							font-size: 12px;
						}
						.markdown-body th {
							background: var(--bg-surface);
							font-weight: 600;
						}
						.markdown-body hr {
							border: none;
							border-top: 1px solid var(--border-muted);
							margin: 12px 0;
						}
						.markdown-body strong { font-weight: 600; }
						.markdown-body code {
							background: var(--bg-surface);
							padding: 2px 5px;
							border-radius: 4px;
							font-family: var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
							font-size: 12px;
							overflow-wrap: anywhere;
							word-break: break-word;
						}
					`}</style>
				</div>
			)}

			{/* Files changed bar (Codex-style review card) */}
			{message.changedFiles && message.changedFiles.length > 0 && (
				<FilesChangedBar
					files={message.changedFiles}
					messageId={message.id}
					isLive={Boolean(isAgentActive && message.isStreaming)}
					onOpenDiff={onOpenDiff}
				/>
			)}

			{/* Assistant footer toolbar: timestamp + copy entire answer */}
			{(displayText ||
				(message.changedFiles && message.changedFiles.length > 0)) &&
				!isActivelyStreaming && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginTop: 8,
							fontSize: 11,
							color: "var(--dim)",
							userSelect: "none",
						}}
					>
						{timeStr && <span>{timeStr}</span>}
						<button
							type="button"
							onClick={handleCopyAnswer}
							title={copiedAnswer ? "Copied" : "Copy response"}
							aria-label={copiedAnswer ? "Copied" : "Copy response"}
							style={{
								background: "none",
								border: "none",
								padding: "2px 6px",
								cursor: "pointer",
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
								color: copiedAnswer ? "var(--success)" : "var(--dim)",
								borderRadius: 4,
								fontSize: 11,
								transition: "color 0.15s, background-color 0.15s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = copiedAnswer
									? "var(--success)"
									: "var(--text)"
								e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = copiedAnswer
									? "var(--success)"
									: "var(--dim)"
								e.currentTarget.style.backgroundColor = "transparent"
							}}
						>
							{copiedAnswer ? (
								<>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
									<span>Copied</span>
								</>
							) : (
								<>
									<svg
										width="12"
										height="12"
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
								</>
							)}
						</button>
					</div>
				)}

			<ImagePreviewModal
				src={previewImage}
				onClose={() => setPreviewImage(null)}
			/>
		</div>
	)
})
