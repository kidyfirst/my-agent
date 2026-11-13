import React, { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message } from "../types/ipc"
import { extractMessageDetails } from "../utils/messageParser"
import { FilesChangedBar } from "./FilesChangedBar"
import { ImagePreviewModal } from "./ImagePreviewModal"
import { MessageFeedback } from "./MessageFeedback"
import { openLibraryPreview } from "../utils/library"
import { openFileTab } from "../utils/fileTab"
import { FileIcon, CheckIcon, CopyIcon } from "./icons"

function resolveLibraryItemId(
	href?: string | null,
	linkText?: string | null,
): string | null {
	if (href) {
		const lowerHref = href.toLowerCase().trim()

		// 1. Explicit library scheme: library://<itemId> or library:<itemId>
		if (lowerHref.startsWith("library://")) {
			return decodeURIComponent(href.slice("library://".length).trim())
		}
		if (lowerHref.startsWith("library:")) {
			return decodeURIComponent(href.slice("library:".length).trim())
		}

		// 2. Direct path containing /my-library/
		const myLibIdx = lowerHref.indexOf("/my-library/")
		if (myLibIdx !== -1) {
			return decodeURIComponent(
				href.slice(myLibIdx + "/my-library/".length).trim(),
			)
		}
	}

	return null
}

const OFFICE_DOC_EXT_REGEX =
	/\.(docx|doc|pptx|ppt|xlsx|xls|pdf)$/i

const PROJECT_FILE_EXT_REGEX =
	/\.(md|markdown|txt|json|ts|tsx|js|jsx|css|scss|sass|less|html|htm|vue|svelte|py|go|rs|java|c|cpp|h|hpp|sh|bash|zsh|yaml|yml|toml|sql|env|csv|tsv|xml|graphql|svg)$/i

function getChildrenText(children: React.ReactNode): string {
	if (typeof children === "string") return children
	if (typeof children === "number") return String(children)
	if (Array.isArray(children)) return children.map(getChildrenText).join("")
	if (React.isValidElement(children) && (children.props as any)?.children) {
		return getChildrenText((children.props as any).children)
	}
	return ""
}

function getOfficeDocFilename(val: unknown): string | null {
	if (!val) return null
	if (typeof val === "string") {
		const trimmed = val.trim()
		if (
			OFFICE_DOC_EXT_REGEX.test(trimmed) &&
			trimmed.length < 250 &&
			!trimmed.includes("\n")
		) {
			return trimmed
		}
	}
	return null
}

function getProjectFilename(val: unknown): string | null {
	if (!val) return null
	if (typeof val === "string") {
		const trimmed = val.trim()
		if (
			PROJECT_FILE_EXT_REGEX.test(trimmed) &&
			trimmed.length < 250 &&
			!/[\s\n]/.test(trimmed)
		) {
			return trimmed
		}
	}
	return null
}

function isPureTextNode(node: any): boolean {
	return Boolean(
		node &&
			Array.isArray(node.children) &&
			node.children.length === 1 &&
			node.children[0].type === "text",
	)
}

function LibraryDocumentChip({
	itemId,
	children,
}: {
	itemId: string
	children?: React.ReactNode
}) {
	// Guard against any nested LibraryDocumentChips
	if (
		React.isValidElement(children) &&
		((children.props as any)?.["data-library-chip"] === "true" ||
			(children.props as any)?.role === "button")
	) {
		return children
	}

	return (
		<span
			data-library-chip="true"
			role="button"
			tabIndex={0}
			onClick={(e) => {
				e.preventDefault()
				e.stopPropagation()
				openLibraryPreview(itemId)
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					e.stopPropagation()
					openLibraryPreview(itemId)
				}
			}}
			title={`Click to preview "${itemId}" in Library`}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				padding: "1px 8px",
				margin: "1px 2px",
				fontSize: "0.95em",
				fontFamily: "var(--font-mono)",
				color: "var(--accent)",
				backgroundColor: "var(--selected-bg)",
				border: "1px solid var(--border-accent)",
				borderRadius: 5,
				cursor: "pointer",
				verticalAlign: "baseline",
				lineHeight: 1.4,
				fontWeight: 600,
				transition: "all 0.15s ease",
				userSelect: "none",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.filter = "brightness(0.95)"
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.filter = "none"
			}}
		>
			<FileIcon size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
			<span>{children || itemId}</span>
		</span>
	)
}

function ProjectFileChip({
	filePath,
	onOpenFile,
	children,
}: {
	filePath: string
	onOpenFile?: (path: string) => void
	children?: React.ReactNode
}) {
	// Guard against any nested chips
	if (
		React.isValidElement(children) &&
		((children.props as any)?.["data-file-chip"] === "true" ||
			(children.props as any)?.["data-library-chip"] === "true" ||
			(children.props as any)?.role === "button")
	) {
		return children
	}

	const handleOpen = (e: React.SyntheticEvent) => {
		e.preventDefault()
		e.stopPropagation()
		if (onOpenFile) {
			onOpenFile(filePath)
		} else {
			openFileTab(filePath)
		}
	}

	return (
		<span
			data-file-chip="true"
			role="button"
			tabIndex={0}
			onClick={handleOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					handleOpen(e)
				}
			}}
			title={`Click to open "${filePath}" in editor tab`}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				padding: "1px 8px",
				margin: "1px 2px",
				fontSize: "0.95em",
				fontFamily: "var(--font-mono)",
				color: "var(--accent)",
				backgroundColor: "var(--selected-bg)",
				border: "1px solid var(--border-accent)",
				borderRadius: 5,
				cursor: "pointer",
				verticalAlign: "baseline",
				lineHeight: 1.4,
				fontWeight: 600,
				transition: "all 0.15s ease",
				userSelect: "none",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.filter = "brightness(0.95)"
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.filter = "none"
			}}
		>
			<FileIcon size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
			<span>{children || filePath}</span>
		</span>
	)
}

export interface AssistantMessageProps {
	message: Message & { isStreaming?: boolean }
	onOpenDiff?: (path: string) => void
	onOpenFile?: (path: string) => void
	isAgentActive?: boolean
	/**
	 * True when this answer sits directly under its turn header (the collapsed
	 * "Worked for 3.9s" line). The header already supplies the gap, so the
	 * answer drops its own top padding and first-paragraph margin — otherwise
	 * the two stack and the answer floats well below the header while the
	 * timestamp underneath stays tight.
	 */
	flushTop?: boolean
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
					fontFamily: "var(--font-mono)",
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
							<CheckIcon size={12} strokeWidth={2} />
							<span>Copied</span>
						</>
					) : (
						<>
							<CopyIcon size={12} strokeWidth={2} />
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
					fontFamily: "var(--font-mono)",
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
	onOpenFile,
	isAgentActive,
	flushTop = false,
}: AssistantMessageProps) {
	const [showThinking, setShowThinking] = useState(false)
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
	const isActivelyStreaming = Boolean(
		message.isStreaming && isAgentActive !== false,
	)
	const lineCount = thinking ? thinking.split("\n").length : 0

	const formatTime = (iso?: string) => {
		try {
			const date = iso ? new Date(iso) : new Date()
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
		<div
			className={
				flushTop ? "assistant-message assistant-flush-top" : "assistant-message"
			}
			style={{
				padding: flushTop ? "0 0 8px 0" : "8px 0",
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
								background: "var(--accent-2)",
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
									color: "var(--thinking-text)",
									fontSize: 12,
									fontFamily: "var(--font-mono)",
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
					style={isError ? { color: "var(--error)" } : undefined}
				>
					<Markdown
						remarkPlugins={[remarkGfm]}
						urlTransform={(url) => url}
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
							a({ href, children, ...props }) {
								const childrenText = getChildrenText(children)
								const libId = resolveLibraryItemId(href, childrenText)
								if (libId) {
									return (
										<LibraryDocumentChip itemId={libId}>
											{children || libId}
										</LibraryDocumentChip>
									)
								}

								const officeDoc =
									(href ? getOfficeDocFilename(href) : null) ||
									getOfficeDocFilename(childrenText)
								if (officeDoc) {
									return (
										<LibraryDocumentChip itemId={officeDoc}>
											{children || officeDoc}
										</LibraryDocumentChip>
									)
								}

								const cleanHref = href
									? decodeURIComponent(
											href.replace(/^\.\//, "").replace(/^file:\/\//, "").trim(),
									  )
									: ""
								const projectPath =
									(cleanHref && getProjectFilename(cleanHref)) ||
									getProjectFilename(childrenText)

								if (
									projectPath &&
									!cleanHref.startsWith("http://") &&
									!cleanHref.startsWith("https://")
								) {
									return (
										<ProjectFileChip
											filePath={projectPath}
											onOpenFile={onOpenFile}
										>
											{children || projectPath}
										</ProjectFileChip>
									)
								}

								// External web link (e.g. https://www.gov.cn)
								return (
									<a
										href={href}
										onClick={(e) => {
											if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
												e.preventDefault()
												void (window as any).api?.invoke?.({ type: "openExternal", url: href })
											}
										}}
										target="_blank"
										rel="noopener noreferrer"
										{...props}
									>
										{children}
									</a>
								)
							},
							p({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<p {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</p>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<p {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</p>
										)
									}
								}
								return <p {...props}>{children}</p>
							},
							li({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<li {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</li>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<li {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</li>
										)
									}
								}
								return <li {...props}>{children}</li>
							},
							td({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<td {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</td>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<td {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</td>
										)
									}
								}
								return <td {...props}>{children}</td>
							},
							code({ className, children, ...props }) {
								const text = getChildrenText(children).trim()
								if (!className) {
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
												{text}
											</ProjectFileChip>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<LibraryDocumentChip itemId={officeDoc}>
												{text}
											</LibraryDocumentChip>
										)
									}
								}
								return (
									<code className={className} {...props}>
										{children}
									</code>
								)
							},
							strong({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
												{projectFile}
											</ProjectFileChip>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<LibraryDocumentChip itemId={officeDoc}>
												{officeDoc}
											</LibraryDocumentChip>
										)
									}
								}
								return <strong {...props}>{children}</strong>
							},
							h1({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<h1 {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</h1>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<h1 {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</h1>
										)
									}
								}
								return <h1 {...props}>{children}</h1>
							},
							h2({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<h2 {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</h2>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<h2 {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</h2>
										)
									}
								}
								return <h2 {...props}>{children}</h2>
							},
							h3({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<h3 {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</h3>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<h3 {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</h3>
										)
									}
								}
								return <h3 {...props}>{children}</h3>
							},
							h4({ node, children, ...props }) {
								if (isPureTextNode(node)) {
									const text = getChildrenText(children).trim()
									const projectFile = getProjectFilename(text)
									if (projectFile) {
										return (
											<h4 {...props}>
												<ProjectFileChip filePath={projectFile} onOpenFile={onOpenFile}>
													{projectFile}
												</ProjectFileChip>
											</h4>
										)
									}
									const officeDoc = getOfficeDocFilename(text)
									if (officeDoc) {
										return (
											<h4 {...props}>
												<LibraryDocumentChip itemId={officeDoc}>{officeDoc}</LibraryDocumentChip>
											</h4>
										)
									}
								}
								return <h4 {...props}>{children}</h4>
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
							color: var(--error);
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
						/* Under a turn header the header owns the gap, so the first
						   block must not add a paragraph margin of its own. */
						.assistant-flush-top .markdown-body > :first-child { margin-top: 0; }
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
							font-family: var(--font-mono);
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

			{/* Assistant footer: timestamp + action pill (copy / helpful / bad response) */}
			{(displayText ||
				(message.changedFiles && message.changedFiles.length > 0)) &&
				!isActivelyStreaming && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							marginTop: 8,
						}}
					>
						{timeStr && (
							<span
								style={{
									fontSize: 11,
									color: "var(--dim)",
									userSelect: "none",
								}}
							>
								{timeStr}
							</span>
						)}
						<MessageFeedback text={displayText} />
					</div>
				)}

			<ImagePreviewModal
				src={previewImage}
				onClose={() => setPreviewImage(null)}
			/>
		</div>
	)
})
