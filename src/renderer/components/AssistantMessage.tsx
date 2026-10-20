import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message } from "../types/ipc"
import { extractMessageDetails } from "../utils/messageParser"

interface AssistantMessageProps {
	message: Message & { isStreaming?: boolean }
}

export function AssistantMessage({ message }: AssistantMessageProps) {
	const [showThinking, setShowThinking] = useState(false)

	const {
		text,
		thinking,
		isStreamingThinking,
		hasRedactedThinking,
	} = extractMessageDetails(message.content, (message as any).text)

	const isError = message.stopReason === "error" || Boolean(message.errorMessage)
	const isActivelyStreaming = Boolean(message.isStreaming)
	const lineCount = thinking ? thinking.split("\n").length : 0

	return (
		<div style={{ padding: "8px 0", lineHeight: 1.6 }}>
			{/* Thinking block with collapsible preview */}
			{(thinking || isStreamingThinking || hasRedactedThinking) && (
				<div style={{ marginBottom: 8 }}>
					<button
						type="button"
						onClick={() => setShowThinking(!showThinking)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "4px 0",
							cursor: "pointer",
							fontSize: 13,
							background: "none",
							border: "none",
							color: "inherit",
							width: "100%",
							textAlign: "left",
						}}
					>
						<span
							style={{
								fontSize: 12,
								flexShrink: 0,
								width: 16,
								textAlign: "center",
								color: "var(--muted)",
							}}
						>
							{showThinking ? "▾" : "▸"}
						</span>
						<span
							style={{
								fontSize: 13,
								flexShrink: 0,
								color: "var(--muted)",
							}}
						>
							⚙️
						</span>
						<span style={{ color: "var(--muted)", fontWeight: 500 }}>
							Thinking
						</span>

						{/* Active pulsing dot when actively streaming thinking */}
						{isActivelyStreaming && isStreamingThinking && (
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: "var(--accent)",
									animation: "pulse 1.2s ease-in-out infinite",
									flexShrink: 0,
								}}
							/>
						)}

						{/* Line count badge when collapsed and lines > 1 */}
						{!showThinking && lineCount > 1 && (
							<span
								style={{
									fontSize: 11,
									color: "var(--dim)",
									flexShrink: 0,
								}}
							>
								({lineCount} lines)
							</span>
						)}

						{/* Collapsed one-line preview */}
						{!showThinking && thinking && (
							<span
								style={{
									background: "var(--bg-surface)",
									padding: "1px 8px",
									borderRadius: 4,
									fontFamily:
										"var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace)",
									fontSize: 12,
									color: "var(--thinking-text)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flex: 1,
									minWidth: 0,
								}}
							>
								{thinking.replace(/\n/g, " ").slice(0, 120)}
								{thinking.length > 120 ? "\u2026" : ""}
							</span>
						)}

						{/* Redacted thinking badge */}
						{hasRedactedThinking && (
							<span
								style={{
									fontSize: 11,
									color: "var(--dim)",
									fontStyle: "italic",
									flexShrink: 0,
									marginLeft: "auto",
								}}
							>
								🔒 Redacted
							</span>
						)}
					</button>

					{/* Expanded thinking container */}
					{showThinking && (
						<div
							style={{
								marginTop: 6,
								marginLeft: 24,
								padding: "8px 12px",
								borderRadius: 6,
								background: "var(--bg-surface)",
								border: "1px solid var(--border-muted)",
								color: "var(--thinking-text)",
								fontFamily:
									"var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace)",
								fontSize: 12,
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								lineHeight: 1.5,
								maxHeight: 400,
								overflowY: "auto",
							}}
						>
							{thinking}
							{isActivelyStreaming && isStreamingThinking && (
								<span
									style={{
										display: "inline-block",
										width: 2,
										height: 12,
										background: "var(--accent)",
										marginLeft: 2,
										verticalAlign: "middle",
										animation: "blink 1s step-end infinite",
									}}
								/>
							)}
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
						padding: "4px 0",
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
					<span>Thinking…</span>
				</div>
			)}

			{/* Main text or streaming cursor */}
			{(text || (isActivelyStreaming && !isStreamingThinking)) && (
				<div className="markdown-body">
					{text ? <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown> : null}
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
						}
						.markdown-body pre {
							background: var(--bg-surface);
							padding: 10px 12px;
							border-radius: 6px;
							border: 1px solid var(--border-muted);
							overflow-x: auto;
							margin: 8px 0;
						}
						.markdown-body pre code {
							background: none;
							padding: 0;
							border-radius: 0;
						}
					`}</style>
				</div>
			)}

			{/* Error callout banner */}
			{isError && (
				<div
					style={{
						padding: "8px 12px",
						marginTop: text || thinking ? 8 : 4,
						marginBottom: 4,
						borderRadius: 6,
						background: "rgba(239, 68, 68, 0.08)",
						border: "1px solid rgba(239, 68, 68, 0.25)",
						color: "#ef4444",
						fontSize: 13,
						lineHeight: 1.5,
					}}
				>
					{message.errorMessage ||
						(text ? null : "An error occurred during generation")}
				</div>
			)}
		</div>
	)
}
