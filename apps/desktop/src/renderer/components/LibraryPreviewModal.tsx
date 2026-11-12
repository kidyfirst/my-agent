import React, { useState, useEffect, useRef, useCallback } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
	ImageIcon,
	DocumentIcon,
	SpreadsheetIcon,
	PresentationIcon,
	OpenFolderIcon,
	OcrIcon,
} from "./LibraryIcon"
import { OpenInDropdown } from "./OpenInDropdown"
import type { LibraryItemContent } from "@my-agent/core"
import { Icon } from "./Icon"

interface LibraryPreviewModalProps {
	itemId: string | null
	onClose: () => void
	onOcrCompleted?: (itemId: string) => void
	showToast?: (message: string, type?: "info" | "success" | "error") => void
}

function formatBytes(bytes: number): string {
	if (!bytes || bytes === 0) return "0 B"
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getColumnLetter(colIndex: number): string {
	let letter = ""
	let temp = colIndex
	while (temp >= 0) {
		letter = String.fromCharCode((temp % 26) + 65) + letter
		temp = Math.floor(temp / 26) - 1
	}
	return letter
}

export function LibraryPreviewModal({
	itemId,
	onClose,
	onOcrCompleted,
	showToast,
}: LibraryPreviewModalProps) {
	const [content, setContent] = useState<LibraryItemContent | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isAnalyzingOcr, setIsAnalyzingOcr] = useState(false)
	const [copiedText, setCopiedText] = useState(false)
	const [activeSheetIndex, setActiveSheetIndex] = useState(0)
	const [activeSlideIndex, setActiveSlideIndex] = useState(0)
	const [spreadsheetViewMode, setSpreadsheetViewMode] = useState<"grid" | "raw">("grid")
	const [htmlViewMode, setHtmlViewMode] = useState<"rendered" | "source">("rendered")
	const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)

	// Refs for synchronized scrolling
	const leftScrollRef = useRef<HTMLDivElement>(null)
	const rightScrollRef = useRef<HTMLDivElement>(null)
	const activeScrollSource = useRef<"left" | "right" | null>(null)

	useEffect(() => {
		setActiveSheetIndex(0)
		setActiveSlideIndex(0)
		setSpreadsheetViewMode("grid")
		setHtmlViewMode("rendered")
	}, [itemId])

	// Create and manage object URL for native PDF viewing
	useEffect(() => {
		if (!content?.isPdf || !content.pdfDataUrl) {
			setPdfBlobUrl(null)
			return
		}

		let active = true
		let objectUrl: string | null = null

		const createBlob = async () => {
			try {
				let blob: Blob
				try {
					const res = await fetch(content.pdfDataUrl!)
					blob = await res.blob()
				} catch {
					const raw = content.pdfDataUrl!.includes(",")
						? content.pdfDataUrl!.split(",")[1]
						: content.pdfDataUrl!
					const binary = window.atob(raw)
					const bytes = new Uint8Array(binary.length)
					for (let i = 0; i < binary.length; i++) {
						bytes[i] = binary.charCodeAt(i)
					}
					blob = new Blob([bytes], { type: "application/pdf" })
				}

				if (!active) return
				objectUrl = URL.createObjectURL(blob)
				setPdfBlobUrl(objectUrl)
			} catch (err) {
				console.error("[LibraryPreviewModal] Failed to create PDF blob URL:", err)
			}
		}

		void createBlob()

		return () => {
			active = false
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl)
			}
		}
	}, [content?.isPdf, content?.pdfDataUrl])

	useEffect(() => {
		if (!itemId) {
			setContent(null)
			setError(null)
			return
		}

		let active = true
		setLoading(true)
		setError(null)

		const fetchContent = async () => {
			try {
				const res = await (window as any).api.invoke({
					type: "getLibraryItemContent",
					id: itemId,
				})
				if (!active) return
				if (res) {
					setContent(res)
				} else {
					setError("File could not be found or previewed.")
				}
			} catch (err) {
				if (!active) return
				setError((err as Error).message || "Failed to load file preview.")
			} finally {
				if (active) setLoading(false)
			}
		}

		void fetchContent()
		return () => {
			active = false
		}
	}, [itemId])

	// Close on Escape or arrow keys for presentations
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
			} else if (content?.isPresentation) {
				const maxSlides = content.presentationData?.length || 0
				if (maxSlides > 1) {
					if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
						setActiveSlideIndex((prev) => Math.max(0, prev - 1))
					} else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
						setActiveSlideIndex((prev) => Math.min(maxSlides - 1, prev + 1))
					}
				}
			}
		}
		if (itemId) {
			window.addEventListener("keydown", handleKeyDown)
		}
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [itemId, onClose, content])

	// Proportional scroll synchronization for Markdown
	const handleLeftScroll = useCallback(() => {
		if (activeScrollSource.current !== "left") return
		const left = leftScrollRef.current
		const right = rightScrollRef.current
		if (!left || !right) return
		const maxLeft = left.scrollHeight - left.clientHeight
		const maxRight = right.scrollHeight - right.clientHeight
		if (maxLeft > 0 && maxRight > 0) {
			const ratio = left.scrollTop / maxLeft
			right.scrollTop = ratio * maxRight
		}
	}, [])

	const handleRightScroll = useCallback(() => {
		if (activeScrollSource.current !== "right") return
		const left = leftScrollRef.current
		const right = rightScrollRef.current
		if (!left || !right) return
		const maxLeft = left.scrollHeight - left.clientHeight
		const maxRight = right.scrollHeight - right.clientHeight
		if (maxLeft > 0 && maxRight > 0) {
			const ratio = right.scrollTop / maxRight
			left.scrollTop = ratio * maxRight
		}
	}, [])

	// Run OCR on current image
	const handleRunOcr = async () => {
		if (!content || !content.isImage) return
		setIsAnalyzingOcr(true)
		try {
			const res = await (window as any).api.invoke({
				type: "analyzeLibraryImage",
				id: content.item.id,
			})
			if (res?.success && res.data) {
				setContent((prev) => (prev ? { ...prev, analysis: res.data } : prev))
				onOcrCompleted?.(content.item.id)
				if (showToast) {
					showToast("OCR analysis completed successfully", "success")
				}
			} else {
				if (showToast) {
					showToast("OCR analysis failed or yielded no results", "error")
				}
			}
		} catch (err) {
			if (showToast) {
				showToast((err as Error).message || "OCR analysis failed", "error")
			}
		} finally {
			setIsAnalyzingOcr(false)
		}
	}

	// Copy OCR text
	const handleCopyOcrText = () => {
		const text = content?.analysis?.ocrText
		if (!text) return
		void navigator.clipboard.writeText(text)
		setCopiedText(true)
		setTimeout(() => setCopiedText(false), 2000)
	}

	// Reveal in folder
	const handleRevealInFolder = () => {
		if (!content) return
		void (window as any).api.invoke({
			type: "openLibraryItemInFolder",
			id: content.item.id,
		})
	}

	if (!itemId) return null

	const ext = content?.extension?.toUpperCase() || ""

	// Determine file icon
	const renderFileIcon = (size = 18) => {
		if (!content) return <DocumentIcon size={size} />
		if (content.isImage) return <ImageIcon size={size} color="var(--accent)" />
		if (content.isPdf || ext === "PDF") return <DocumentIcon size={size} color="var(--error)" />
		if (content.isSpreadsheet || ["XLS", "XLSX", "CSV", "TSV"].includes(ext)) {
			return <SpreadsheetIcon size={size} color="var(--success)" />
		}
		if (content.isPresentation || ["PPT", "PPTX", "KEY"].includes(ext)) {
			return <PresentationIcon size={size} color="var(--warning)" />
		}
		return <DocumentIcon size={size} color="var(--accent)" />
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1100,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: "var(--scrim)",
				backdropFilter: "blur(4px)",
			}}
			onClick={onClose}
		>
			<div
				style={{
					width: "min(1080px, 96vw)",
					height: "min(760px, 88vh)",
					backgroundColor: "var(--bg)",
					borderRadius: 12,
					border: "1px solid var(--border)",
					boxShadow: "var(--shadow-modal)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					position: "relative",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Modal Header */}
				<div
					style={{
						padding: "8px 12px",
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "center",
						gap: 10,
						backgroundColor: "var(--bg-surface)",
						flexShrink: 0,
					}}
				>
					{/* Left: Tile icon + file metadata */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							overflow: "hidden",
							minWidth: 0,
						}}
					>
						<div
							style={{
								width: 22,
								height: 22,
								borderRadius: 5,
								background:
									"linear-gradient(135deg, var(--accent), var(--accent-2))",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--on-accent)",
								flexShrink: 0,
							}}
						>
							{renderFileIcon(13)}
						</div>
						<span
							style={{
								fontSize: 13,
								fontWeight: 600,
								color: "var(--text)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{content?.item.name || "Loading..."}
						</span>
					</div>

					{ext && (
						<span
							style={{
								fontSize: 9,
								fontWeight: 600,
								padding: "1px 6px",
								borderRadius: 999,
								border: "1px solid var(--border-accent)",
								color: "var(--accent)",
								background: "var(--selected-bg)",
								letterSpacing: "0.3px",
								flexShrink: 0,
							}}
						>
							{ext}
						</span>
					)}

					{content && (
						<span
							style={{
								fontSize: 10,
								color: "var(--dim)",
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
								flexShrink: 0,
							}}
						>
							{formatBytes(content.item.sizeBytes)}
						</span>
					)}

					<div style={{ flex: 1 }} />

					{/* Right: Actions */}
					<OpenInDropdown
						filePath={content?.item.path ?? null}
						buttonStyle={{
							padding: "4px 10px",
							borderRadius: 5,
							background: "var(--bg-elevated)",
							color: "var(--text)",
							fontSize: 11,
							fontWeight: 500,
						}}
					/>

					<button
						type="button"
						onClick={onClose}
						title="Close (Esc)"
						style={{
							padding: 5,
							background: "transparent",
							border: "1px solid transparent",
							color: "var(--muted)",
							cursor: "pointer",
							borderRadius: 5,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Icon size={14} strokeWidth={2}>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</Icon>
					</button>
				</div>

				{/* Modal Content Body */}
				<div style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
					{loading && (
						<div
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--muted)",
								fontSize: 14,
								gap: 8,
							}}
						>
							<span>Loading preview...</span>
						</div>
					)}

					{!loading && error && (
						<div
							style={{
								flex: 1,
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--error)",
								gap: 8,
								padding: 24,
								textAlign: "center",
							}}
						>
							<span style={{ fontSize: 15, fontWeight: 600 }}>Preview Error</span>
							<span style={{ fontSize: 13, color: "var(--muted)" }}>{error}</span>
						</div>
					)}

					{!loading && !error && content && (
						<>
							{/* Case 1: Image Preview */}
							{content.isImage && (
								<div style={{ flex: 1, display: "flex", minHeight: 0, width: "100%" }}>
									{/* Left: Image Canvas */}
									<div
										style={{
											flex: 1,
											minWidth: 0,
											display: "flex",
											flexDirection: "column",
											backgroundColor: "var(--bg-surface)",
										}}
									>
										{/* Image Display Container (Fit to Window) */}
										<div
											style={{
												flex: 1,
												overflow: "auto",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												padding: 16,
											}}
										>
											{content.imageDataUrl ? (
												<img
													src={content.imageDataUrl}
													alt={content.item.name}
													style={{
														display: "block",
														borderRadius: 4,
														maxWidth: "100%",
														maxHeight: "100%",
														objectFit: "contain",
														boxShadow: "var(--shadow-sm)",
													}}
												/>
											) : (
												<div style={{ color: "var(--muted)", fontSize: 13 }}>
													Image preview unavailable
												</div>
											)}
										</div>
									</div>

									{/* Right: Recognition Content Panel */}
									<div
										style={{
											width: 340,
											flexShrink: 0,
											borderLeft: "1px solid var(--border-muted)",
											backgroundColor: "var(--bg)",
											display: "flex",
											flexDirection: "column",
											overflowY: "auto",
										}}
									>
										<div
											style={{
												padding: "14px 16px",
												borderBottom: "1px solid var(--border-muted)",
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
											}}
										>
											<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
												<OcrIcon size={15} color="var(--accent)" />
												<span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
													Recognition Content
												</span>
											</div>

											{content.analysis && (
												<button
													type="button"
													onClick={handleRunOcr}
													disabled={isAnalyzingOcr}
													title="Re-analyze image"
													style={{
														fontSize: 11,
														fontFamily: "inherit",
														padding: "3px 9px",
														borderRadius: 5,
														border: "1px solid var(--border-accent)",
														background: "var(--accent)",
														color: "var(--on-accent)",
														cursor: isAnalyzingOcr ? "default" : "pointer",
														display: "inline-flex",
														alignItems: "center",
														gap: 4,
														fontWeight: 500,
														opacity: isAnalyzingOcr ? 0.7 : 1,
													}}
												>
													{isAnalyzingOcr ? "Analyzing..." : "Re-run"}
												</button>
											)}
										</div>

										{content.analysis ? (
											<div
												style={{
													padding: 16,
													display: "flex",
													flexDirection: "column",
													gap: 16,
												}}
											>
												{/* Summary */}
												{content.analysis.summary && (
													<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
														<span
															style={{
																fontSize: 11,
																fontWeight: 600,
																textTransform: "uppercase",
																color: "var(--muted)",
																letterSpacing: "0.5px",
															}}
														>
															Summary
														</span>
														<div
															style={{
																fontSize: 13,
																lineHeight: 1.5,
																color: "var(--text)",
																backgroundColor: "var(--bg-surface)",
																borderRadius: 8,
																padding: 10,
																border: "1px solid var(--border-muted)",
															}}
														>
															{content.analysis.summary}
														</div>
													</div>
												)}

												{/* Tags */}
												{content.analysis.tags && content.analysis.tags.length > 0 && (
													<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
														<span
															style={{
																fontSize: 11,
																fontWeight: 600,
																textTransform: "uppercase",
																color: "var(--muted)",
																letterSpacing: "0.5px",
															}}
														>
															Tags
														</span>
														<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
															{content.analysis.tags.map((tag, idx) => (
																<span
																	key={idx}
																	style={{
																		fontSize: 11,
																		fontWeight: 500,
																		color: "var(--accent)",
																		backgroundColor: "var(--selected-bg)",
																		padding: "3px 8px",
																		borderRadius: 12,
																	}}
																>
																	#{tag}
																</span>
															))}
														</div>
													</div>
												)}

												{/* Extracted Text (OCR) */}
												<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
													<div
														style={{
															display: "flex",
															alignItems: "center",
															justifyContent: "space-between",
														}}
													>
														<span
															style={{
																fontSize: 11,
																fontWeight: 600,
																textTransform: "uppercase",
																color: "var(--muted)",
																letterSpacing: "0.5px",
															}}
														>
															Extracted Text
														</span>
														{content.analysis.ocrText && (
															<button
																onClick={handleCopyOcrText}
																style={{
																	background: "none",
																	border: "none",
																	color: copiedText ? "var(--success)" : "var(--accent)",
																	cursor: "pointer",
																	fontSize: 11,
																	fontWeight: 500,
																	padding: "2px 4px",
																}}
															>
																{copiedText ? "✓ Copied" : "Copy"}
															</button>
														)}
													</div>
													<div
														style={{
															fontSize: 12,
															fontFamily: "var(--font-mono)",
															lineHeight: 1.5,
															color: "var(--text)",
															backgroundColor: "var(--bg-surface)",
															borderRadius: 8,
															padding: 10,
															border: "1px solid var(--border-muted)",
															maxHeight: 240,
															overflowY: "auto",
															whiteSpace: "pre-wrap",
															wordBreak: "break-word",
														}}
													>
														{content.analysis.ocrText || (
															<span style={{ color: "var(--dim)" }}>
																No text content detected in this image.
															</span>
														)}
													</div>
												</div>

												{/* Metadata footer */}
												<div
													style={{
														marginTop: "auto",
														paddingTop: 12,
														borderTop: "1px solid var(--border-muted)",
														display: "flex",
														flexDirection: "column",
														gap: 4,
														fontSize: 11,
														color: "var(--dim)",
													}}
												>
													{content.analysis.modelUsed && (
														<div>Model: {content.analysis.modelUsed}</div>
													)}
													{content.analysis.analyzedAt && (
														<div>
															Indexed:{" "}
															{new Date(content.analysis.analyzedAt).toLocaleString()}
														</div>
													)}
												</div>
											</div>
										) : (
											/* Empty state: Not yet indexed */
											<div
												style={{
													flex: 1,
													display: "flex",
													flexDirection: "column",
													alignItems: "center",
													justifyContent: "center",
													padding: 24,
													gap: 14,
													textAlign: "center",
												}}
											>
												<div
													style={{
														width: 44,
														height: 44,
														borderRadius: 22,
														backgroundColor: "var(--bg-elevated)",
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
													}}
												>
													<OcrIcon size={22} color="var(--muted)" />
												</div>
												<div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
													No Recognition Data
												</div>
												<div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
													Run OCR and image reasoning to extract text and generate structured
													summaries.
												</div>
												<button
													onClick={handleRunOcr}
													disabled={isAnalyzingOcr}
													style={{
														marginTop: 8,
														display: "inline-flex",
														alignItems: "center",
														gap: 6,
														padding: "8px 16px",
														borderRadius: 8,
														border: "none",
														backgroundColor: "var(--accent)",
														color: "var(--on-accent)",
														fontSize: 12,
														fontWeight: 500,
														cursor: isAnalyzingOcr ? "default" : "pointer",
														opacity: isAnalyzingOcr ? 0.7 : 1,
													}}
												>
													<OcrIcon size={14} color="var(--on-accent)" />
													<span>{isAnalyzingOcr ? "Analyzing Image..." : "Analyze Image (OCR)"}</span>
												</button>
											</div>
										)}
									</div>
								</div>
							)}

							{/* Case 2: Markdown Split View */}
							{content.isMarkdown && (
								<div style={{ flex: 1, display: "flex", minHeight: 0, width: "100%" }}>
									{/* Left: Source File */}
									<div
										onMouseEnter={() => {
											activeScrollSource.current = "left"
										}}
										onWheel={() => {
											activeScrollSource.current = "left"
										}}
										style={{
											flex: 1,
											minWidth: 0,
											display: "flex",
											flexDirection: "column",
											borderRight: "1px solid var(--border-muted)",
										}}
									>
										<div
											style={{
												padding: "8px 16px",
												borderBottom: "1px solid var(--border-muted)",
												backgroundColor: "var(--bg)",
												fontSize: 12,
												fontWeight: 600,
												color: "var(--muted)",
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
											}}
										>
											<span>Source Code (.md)</span>
											<span style={{ fontSize: 11, fontWeight: 400, color: "var(--dim)" }}>
												{content.textContent?.length || 0} characters
											</span>
										</div>

										<div
											ref={leftScrollRef}
											onScroll={handleLeftScroll}
											style={{
												flex: 1,
												overflow: "auto",
												padding: 16,
												backgroundColor: "var(--bg)",
											}}
										>
											<pre
												style={{
													margin: 0,
													fontFamily: "var(--font-mono)",
													fontSize: 12.5,
													lineHeight: 1.6,
													color: "var(--text)",
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
												}}
											>
												{content.textContent || "(Empty file)"}
											</pre>
										</div>
									</div>

									{/* Right: Rendered Markdown */}
									<div
										onMouseEnter={() => {
											activeScrollSource.current = "right"
										}}
										onWheel={() => {
											activeScrollSource.current = "right"
										}}
										style={{
											flex: 1,
											minWidth: 0,
											display: "flex",
											flexDirection: "column",
											backgroundColor: "var(--bg-surface)",
										}}
									>
										<div
											style={{
												padding: "8px 16px",
												borderBottom: "1px solid var(--border-muted)",
												backgroundColor: "var(--bg)",
												fontSize: 12,
												fontWeight: 600,
												color: "var(--muted)",
											}}
										>
											<span>Rendered Preview</span>
										</div>

										<div
											ref={rightScrollRef}
											onScroll={handleRightScroll}
											style={{
												flex: 1,
												overflow: "auto",
												padding: 20,
												color: "var(--text)",
												fontSize: 13.5,
												lineHeight: 1.6,
											}}
										>
											<Markdown remarkPlugins={[remarkGfm]}>
												{content.textContent || "*Empty file*"}
											</Markdown>
										</div>
									</div>
								</div>
							)}

							{/* Case: PDF Viewer */}
							{content.isPdf && (
								<div
									style={{
										flex: 1,
										display: "flex",
										flexDirection: "column",
										minHeight: 0,
										width: "100%",
										backgroundColor: "var(--bg-surface)",
									}}
								>
									{pdfBlobUrl ? (
										<iframe
											src={pdfBlobUrl}
											title={content.item.name}
											style={{
												width: "100%",
												height: "100%",
												border: "none",
											}}
										/>
									) : content.pdfDataUrl ? (
										<div
											style={{
												flex: 1,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												color: "var(--muted)",
												fontSize: 13,
											}}
										>
											Preparing PDF preview...
										</div>
									) : (
										<div
											style={{
												flex: 1,
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												justifyContent: "center",
												gap: 12,
												color: "var(--muted)",
											}}
										>
											<DocumentIcon size={48} color="var(--error)" />
											<div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
												{content.item.name}
											</div>
											<div style={{ fontSize: 12 }}>
												This PDF exceeds inline preview limit or could not be loaded directly.
											</div>
											<button
												type="button"
												onClick={handleRevealInFolder}
												style={{
													marginTop: 8,
													padding: "6px 14px",
													borderRadius: 6,
													backgroundColor: "var(--bg-elevated)",
													border: "1px solid var(--border)",
													color: "var(--text)",
													fontSize: 12,
													cursor: "pointer",
												}}
											>
												Show in Finder
											</button>
										</div>
									)}
								</div>
							)}

							{/* Case: HTML Viewer */}
							{content.isHtml && (
								<div
									style={{
										flex: 1,
										display: "flex",
										flexDirection: "column",
										minHeight: 0,
										width: "100%",
										backgroundColor: "var(--bg-surface)",
									}}
								>
									<div
										style={{
											padding: "8px 16px",
											borderBottom: "1px solid var(--border-muted)",
											backgroundColor: "var(--bg)",
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
										}}
									>
										<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
											<span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
												HTML Document
											</span>
											<div
												style={{
													display: "inline-flex",
													alignItems: "center",
													backgroundColor: "var(--bg-surface)",
													borderRadius: 6,
													padding: 2,
													border: "1px solid var(--border-muted)",
												}}
											>
												<button
													type="button"
													onClick={() => setHtmlViewMode("rendered")}
													style={{
														padding: "2px 8px",
														borderRadius: 4,
														border: "none",
														fontSize: 10,
														fontWeight: 600,
														cursor: "pointer",
														backgroundColor:
															htmlViewMode === "rendered" ? "var(--bg)" : "transparent",
														color:
															htmlViewMode === "rendered" ? "var(--accent)" : "var(--muted)",
														boxShadow:
															htmlViewMode === "rendered" ? "var(--shadow-sm)" : "none",
													}}
												>
													Rendered Web Page
												</button>
												<button
													type="button"
													onClick={() => setHtmlViewMode("source")}
													style={{
														padding: "2px 8px",
														borderRadius: 4,
														border: "none",
														fontSize: 10,
														fontWeight: 600,
														cursor: "pointer",
														backgroundColor:
															htmlViewMode === "source" ? "var(--bg)" : "transparent",
														color:
															htmlViewMode === "source" ? "var(--accent)" : "var(--muted)",
														boxShadow:
															htmlViewMode === "source" ? "var(--shadow-sm)" : "none",
													}}
												>
													HTML Source
												</button>
											</div>
										</div>
										<span style={{ fontSize: 11, color: "var(--dim)" }}>
											{content.htmlContent?.length || 0} characters
										</span>
									</div>

									{htmlViewMode === "rendered" ? (
										<div style={{ flex: 1, minHeight: 0, width: "100%", backgroundColor: "white" }}>
											<iframe
												sandbox="allow-same-origin"
												srcDoc={content.htmlContent || ""}
												title={content.item.name}
												style={{
													width: "100%",
													height: "100%",
													border: "none",
													backgroundColor: "white",
												}}
											/>
										</div>
									) : (
										<div
											style={{
												flex: 1,
												overflow: "auto",
												padding: 16,
												backgroundColor: "var(--bg)",
											}}
										>
											<pre
												style={{
													margin: 0,
													fontFamily: "var(--font-mono)",
													fontSize: 12.5,
													lineHeight: 1.6,
													color: "var(--text)",
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
												}}
											>
												{content.htmlContent || "(Empty file)"}
											</pre>
										</div>
									)}
								</div>
							)}

							{/* Case: Spreadsheet Grid Viewer */}
							{content.isSpreadsheet &&
								content.spreadsheetData &&
								content.spreadsheetData.length > 0 &&
								(() => {
									const activeSheet =
										content.spreadsheetData[activeSheetIndex] ||
										content.spreadsheetData[0]
									const rows = activeSheet?.rows || []
									const maxCols = Math.max(0, ...rows.map((r) => r.length))

									return (
										<div
											style={{
												flex: 1,
												display: "flex",
												flexDirection: "column",
												minHeight: 0,
												width: "100%",
												backgroundColor: "var(--bg-surface)",
											}}
										>
											{/* Spreadsheet Toolbar */}
											<div
												style={{
													padding: "8px 16px",
													borderBottom: "1px solid var(--border-muted)",
													backgroundColor: "var(--bg)",
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
													gap: 12,
													overflowX: "auto",
												}}
											>
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: 8,
														flexShrink: 0,
													}}
												>
													{/* Sheet Tabs */}
													{content.spreadsheetData.length > 1 ? (
														<div
															style={{
																display: "inline-flex",
																alignItems: "center",
																backgroundColor: "var(--bg-surface)",
																borderRadius: 6,
																padding: 2,
																border: "1px solid var(--border-muted)",
																gap: 2,
															}}
														>
															{content.spreadsheetData.map((sheet, sIdx) => (
																<button
																	key={sIdx}
																	type="button"
																	onClick={() => setActiveSheetIndex(sIdx)}
																	style={{
																		padding: "2px 8px",
																		borderRadius: 4,
																		border: "none",
																		fontSize: 11,
																		fontWeight: activeSheetIndex === sIdx ? 600 : 500,
																		cursor: "pointer",
																		backgroundColor:
																			activeSheetIndex === sIdx
																				? "var(--bg)"
																				: "transparent",
																		color:
																			activeSheetIndex === sIdx
																				? "var(--accent)"
																				: "var(--muted)",
																		boxShadow:
																			activeSheetIndex === sIdx
																				? "var(--shadow-sm)"
																				: "none",
																	}}
																>
																	{sheet.name || `Sheet ${sIdx + 1}`}
																	<span
																		style={{
																			marginLeft: 4,
																			fontSize: 10,
																			opacity: 0.7,
																		}}
																	>
																		({sheet.rows.length})
																	</span>
																</button>
															))}
														</div>
													) : (
														<span
															style={{
																fontSize: 12,
																fontWeight: 600,
																color: "var(--muted)",
															}}
														>
															{activeSheet?.name || "Spreadsheet Table"}
														</span>
													)}

													{/* Grid / Raw Toggle */}
													<div
														style={{
															display: "inline-flex",
															alignItems: "center",
															backgroundColor: "var(--bg-surface)",
															borderRadius: 6,
															padding: 2,
															border: "1px solid var(--border-muted)",
														}}
													>
														<button
															type="button"
															onClick={() => setSpreadsheetViewMode("grid")}
															style={{
																padding: "2px 8px",
																borderRadius: 4,
																border: "none",
																fontSize: 10,
																fontWeight: 600,
																cursor: "pointer",
																backgroundColor:
																	spreadsheetViewMode === "grid"
																		? "var(--bg)"
																		: "transparent",
																color:
																	spreadsheetViewMode === "grid"
																		? "var(--accent)"
																		: "var(--muted)",
																boxShadow:
																	spreadsheetViewMode === "grid"
																		? "var(--shadow-sm)"
																		: "none",
															}}
														>
															Table Grid
														</button>
														<button
															type="button"
															onClick={() => setSpreadsheetViewMode("raw")}
															style={{
																padding: "2px 8px",
																borderRadius: 4,
																border: "none",
																fontSize: 10,
																fontWeight: 600,
																cursor: "pointer",
																backgroundColor:
																	spreadsheetViewMode === "raw"
																		? "var(--bg)"
																		: "transparent",
																color:
																	spreadsheetViewMode === "raw"
																		? "var(--accent)"
																		: "var(--muted)",
																boxShadow:
																	spreadsheetViewMode === "raw"
																		? "var(--shadow-sm)"
																		: "none",
															}}
														>
															Raw Text
														</button>
													</div>
												</div>

												<div
													style={{
														fontSize: 11,
														color: "var(--dim)",
														flexShrink: 0,
													}}
												>
													{rows.length} rows × {maxCols} columns
												</div>
											</div>

											{/* Grid Content */}
											{spreadsheetViewMode === "grid" ? (
												<div
													style={{
														flex: 1,
														overflow: "auto",
														backgroundColor: "var(--bg-surface)",
														padding: 12,
													}}
												>
													{rows.length === 0 ? (
														<div
															style={{
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
																height: 200,
																color: "var(--dim)",
																fontSize: 13,
															}}
														>
															(Empty sheet)
														</div>
													) : (
														<table
															style={{
																borderCollapse: "separate",
																borderSpacing: 0,
																fontSize: 12,
																backgroundColor: "var(--bg)",
																border: "1px solid var(--border)",
																borderRadius: 6,
																minWidth: "100%",
															}}
														>
															<thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
																<tr>
																	<th
																		style={{
																			position: "sticky",
																			left: 0,
																			zIndex: 11,
																			width: 44,
																			minWidth: 44,
																			padding: "6px 4px",
																			textAlign: "center",
																			fontSize: 11,
																			fontWeight: 600,
																			backgroundColor: "var(--bg-elevated)",
																			borderBottom: "1px solid var(--border)",
																			borderRight: "1px solid var(--border)",
																			color: "var(--muted)",
																		}}
																	>
																		#
																	</th>
																	{Array.from({ length: maxCols }).map((_, cIdx) => (
																		<th
																			key={cIdx}
																			style={{
																				padding: "6px 12px",
																				textAlign: "left",
																				fontSize: 11,
																				fontWeight: 600,
																				backgroundColor: "var(--bg-elevated)",
																				borderBottom: "1px solid var(--border)",
																				borderRight: "1px solid var(--border-muted)",
																				color: "var(--muted)",
																				minWidth: 90,
																			}}
																		>
																			{getColumnLetter(cIdx)}
																		</th>
																	))}
																</tr>
															</thead>
															<tbody>
																{rows.map((row, rIdx) => (
																	<tr
																		key={rIdx}
																		style={{
																			backgroundColor:
																				rIdx % 2 === 0
																					? "var(--bg)"
																					: "var(--bg-surface)",
																		}}
																	>
																		<td
																			style={{
																				position: "sticky",
																				left: 0,
																				zIndex: 5,
																				padding: "5px 4px",
																				textAlign: "center",
																				fontSize: 10.5,
																				color: "var(--dim)",
																				backgroundColor: "var(--bg-elevated)",
																				borderBottom: "1px solid var(--border-muted)",
																				borderRight: "1px solid var(--border)",
																				userSelect: "none",
																			}}
																		>
																			{rIdx + 1}
																		</td>
																		{Array.from({ length: maxCols }).map((_, cIdx) => (
																			<td
																				key={cIdx}
																				style={{
																					padding: "5px 12px",
																					borderBottom: "1px solid var(--border-muted)",
																					borderRight: "1px solid var(--border-muted)",
																					color: "var(--text)",
																					whiteSpace: "nowrap",
																					maxWidth: 360,
																					overflow: "hidden",
																					textOverflow: "ellipsis",
																				}}
																				title={row[cIdx] || ""}
																			>
																				{row[cIdx] || ""}
																			</td>
																		))}
																	</tr>
																))}
															</tbody>
														</table>
													)}
												</div>
											) : (
												<div
													style={{
														flex: 1,
														overflow: "auto",
														padding: 16,
														backgroundColor: "var(--bg)",
													}}
												>
													<pre
														style={{
															margin: 0,
															fontFamily: "var(--font-mono)",
															fontSize: 12.5,
															lineHeight: 1.6,
															color: "var(--text)",
															whiteSpace: "pre-wrap",
															wordBreak: "break-word",
														}}
													>
														{content.textContent ||
															rows.map((r) => r.join("\t")).join("\n")}
													</pre>
												</div>
											)}
										</div>
									)
								})()}

							{/* Case: Presentation Slide Deck Viewer */}
							{content.isPresentation &&
								content.presentationData &&
								content.presentationData.length > 0 &&
								(() => {
									const slides = content.presentationData
									const currentSlide =
										slides[activeSlideIndex] || slides[0]

									return (
										<div
											style={{
												flex: 1,
												display: "flex",
												minHeight: 0,
												width: "100%",
												backgroundColor: "var(--bg-surface)",
											}}
										>
											{/* Left: Slide selector list */}
													<div
														style={{
															width: 220,
															borderRight: "1px solid var(--border-muted)",
															backgroundColor: "var(--bg)",
															overflowY: "auto",
															padding: 10,
															display: "flex",
															flexDirection: "column",
															gap: 8,
															flexShrink: 0,
														}}
													>
														{slides.map((s, idx) => {
															const isSelected = idx === activeSlideIndex
															return (
																<div
																	key={idx}
																	onClick={() => setActiveSlideIndex(idx)}
																	style={{
																		padding: "8px 10px",
																		borderRadius: 8,
																		border: isSelected
																			? "1.5px solid var(--accent)"
																			: "1px solid var(--border-muted)",
																		backgroundColor: isSelected
																			? "var(--selected-bg)"
																			: "var(--bg-surface)",
																		cursor: "pointer",
																		transition: "all 0.15s ease",
																	}}
																>
																	<div
																		style={{
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "space-between",
																			marginBottom: 4,
																		}}
																	>
																		<span
																			style={{
																				fontSize: 10,
																				fontWeight: 700,
																				color: isSelected
																					? "var(--accent)"
																					: "var(--dim)",
																			}}
																		>
																			Slide {idx + 1}
																		</span>
																	</div>
																	<div
																		style={{
																			fontSize: 11.5,
																			fontWeight: 500,
																			color: "var(--text)",
																			overflow: "hidden",
																			textOverflow: "ellipsis",
																			whiteSpace: "nowrap",
																		}}
																	>
																		{s.title || `Slide ${idx + 1}`}
																	</div>
																</div>
															)
														})}
													</div>

													{/* Right: Slide Presentation Canvas */}
													<div
														style={{
															flex: 1,
															display: "flex",
															flexDirection: "column",
															alignItems: "center",
															justifyContent: "center",
															padding: 24,
															backgroundColor: "var(--bg-surface)",
															overflow: "hidden",
														}}
													>
														<div
															style={{
																width: "100%",
																maxWidth: 680,
																aspectRatio: "16 / 9",
																backgroundColor: "var(--bg)",
																border: "1px solid var(--border)",
																borderRadius: 14,
																boxShadow: "var(--shadow-sm)",
																padding: "28px 36px",
																display: "flex",
																flexDirection: "column",
																overflowY: "auto",
															}}
														>
															<div
																style={{
																	display: "inline-block",
																	alignSelf: "flex-start",
																	fontSize: 10,
																	fontWeight: 700,
																	padding: "2px 8px",
																	borderRadius: 999,
																	backgroundColor: "var(--bg-elevated)",
																	color: "var(--muted)",
																	letterSpacing: "0.5px",
																	marginBottom: 12,
																}}
															>
																SLIDE {currentSlide.index}
															</div>
															<h2
																style={{
																	fontSize: 20,
																	fontWeight: 700,
																	color: "var(--text)",
																	marginTop: 0,
																	marginBottom: 16,
																	lineHeight: 1.3,
																}}
															>
																{currentSlide.title || `Slide ${currentSlide.index}`}
															</h2>
															<div
																style={{
																	flex: 1,
																	fontSize: 14,
																	lineHeight: 1.8,
																	color: "var(--text)",
																	whiteSpace: "pre-wrap",
																	wordBreak: "break-word",
																}}
															>
																{currentSlide.content}
															</div>
														</div>

														{/* Bottom Slide Navigation Bar */}
														<div
															style={{
																display: "flex",
																alignItems: "center",
																gap: 16,
																marginTop: 16,
															}}
														>
															<button
																type="button"
																disabled={activeSlideIndex <= 0}
																onClick={() =>
																	setActiveSlideIndex((prev) =>
																		Math.max(0, prev - 1),
																	)
																}
																style={{
																	padding: "5px 12px",
																	borderRadius: 6,
																	backgroundColor: "var(--bg)",
																	border: "1px solid var(--border)",
																	color:
																		activeSlideIndex <= 0
																			? "var(--dim)"
																			: "var(--text)",
																	fontSize: 11.5,
																	fontWeight: 500,
																	cursor:
																		activeSlideIndex <= 0
																			? "not-allowed"
																			: "pointer",
																}}
															>
																← Previous
															</button>
															<span
																style={{
																	fontSize: 12,
																	color: "var(--muted)",
																	fontWeight: 500,
																}}
															>
																{activeSlideIndex + 1} / {slides.length}
															</span>
															<button
																type="button"
																disabled={activeSlideIndex >= slides.length - 1}
																onClick={() =>
																	setActiveSlideIndex((prev) =>
																		Math.min(slides.length - 1, prev + 1),
																	)
																}
																style={{
																	padding: "5px 12px",
																	borderRadius: 6,
																	backgroundColor: "var(--bg)",
																	border: "1px solid var(--border)",
																	color:
																		activeSlideIndex >= slides.length - 1
																			? "var(--dim)"
																			: "var(--text)",
																	fontSize: 11.5,
																	fontWeight: 500,
																	cursor:
																		activeSlideIndex >= slides.length - 1
																			? "not-allowed"
																			: "pointer",
																}}
															>
																Next →
															</button>
														</div>
													</div>
												</div>
									)
								})()}

							{/* Case: Other Text / Word / Code Documents (Centered Sheet) */}
							{!content.isImage &&
								!content.isPdf &&
								!content.isHtml &&
								!(
									content.isSpreadsheet &&
									content.spreadsheetData &&
									content.spreadsheetData.length > 0
								) &&
								!(
									content.isPresentation &&
									content.presentationData &&
									content.presentationData.length > 0
								) &&
								!content.isMarkdown &&
								(content.isText || content.isWord) && (
									<div
										style={{
											flex: 1,
											overflowY: "auto",
											backgroundColor: "var(--bg-surface)",
											display: "flex",
											justifyContent: "center",
											padding: 24,
										}}
									>
										<div
											style={{
												width: "100%",
												maxWidth: 780,
												backgroundColor: "var(--bg)",
												border: "1px solid var(--border)",
												borderRadius: 12,
												padding: "24px 28px",
												boxShadow: "var(--shadow-sm)",
												display: "flex",
												flexDirection: "column",
												height: "fit-content",
												minHeight: 200,
											}}
										>
											<div
												style={{
													paddingBottom: 12,
													borderBottom: "1px solid var(--border-muted)",
													marginBottom: 16,
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
												}}
											>
												<span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
													{content.isWord || ["docx", "doc", "docm", "dotx", "dot"].includes((content.extension || "").toLowerCase())
														? "Word Document View"
														: ["xlsx", "xls", "xlsm", "xltx", "csv", "tsv"].includes((content.extension || "").toLowerCase())
															? "Spreadsheet Content"
															: ["pptx", "ppt", "ppsx", "potx", "pps"].includes((content.extension || "").toLowerCase())
																? "Presentation Content"
																: "Document View"}
												</span>
												<span style={{ fontSize: 11, color: "var(--dim)" }}>
													{content.textContent?.length || 0} characters
												</span>
											</div>

											<div
												className="markdown-body document-reader-view"
												style={{
													fontSize: 14.5,
													lineHeight: 1.85,
													color: "var(--text)",
													backgroundColor: "transparent",
												}}
											>
												<Markdown remarkPlugins={[remarkGfm]}>
													{content.textContent || "(Empty file)"}
												</Markdown>
												<style>{`
													.document-reader-view h1 {
														font-size: 21px;
														font-weight: 700;
														margin: 20px 0 14px 0;
														text-align: center;
														border-bottom: none;
														line-height: 1.4;
													}
													.document-reader-view h2 {
														font-size: 17px;
														font-weight: 600;
														margin: 16px 0 10px 0;
														text-align: center;
														border-bottom: none;
														line-height: 1.4;
													}
													.document-reader-view h3 {
														font-size: 15px;
														font-weight: 600;
														margin: 14px 0 8px 0;
														line-height: 1.4;
													}
													.document-reader-view p {
														margin: 14px 0;
														line-height: 1.85;
														text-align: justify;
													}
													.document-reader-view table {
														border-collapse: collapse;
														width: 100%;
														margin: 16px 0;
													}
													.document-reader-view th, .document-reader-view td {
														border: 1px solid var(--border);
														padding: 8px 12px;
														font-size: 13px;
													}
													.document-reader-view th {
														background: var(--bg-surface);
														font-weight: 600;
													}
												`}</style>
											</div>
										</div>
									</div>
								)}

							{/* Case 8: Binary / Office / Non-Text Documents (Centered Card) */}
							{!content.isImage &&
								!content.isPdf &&
								!content.isHtml &&
								!(
									content.isSpreadsheet &&
									content.spreadsheetData &&
									content.spreadsheetData.length > 0
								) &&
								!(
									content.isPresentation &&
									content.presentationData &&
									content.presentationData.length > 0
								) &&
								!content.isMarkdown &&
								!content.isText &&
								!content.isWord && (
								<div
									style={{
										flex: 1,
										backgroundColor: "var(--bg-surface)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										padding: 32,
									}}
								>
									<div
										style={{
											maxWidth: 420,
											width: "100%",
											backgroundColor: "var(--bg)",
											border: "1px solid var(--border)",
											borderRadius: 16,
											padding: "36px 28px",
											boxShadow: "var(--shadow-sm)",
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											textAlign: "center",
											gap: 16,
										}}
									>
										<div
											style={{
												width: 64,
												height: 64,
												borderRadius: 16,
												backgroundColor: "var(--bg-elevated)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											{renderFileIcon(36)}
										</div>

										<div>
											<div
												style={{
													fontSize: 16,
													fontWeight: 600,
													color: "var(--text)",
													marginBottom: 4,
													wordBreak: "break-word",
												}}
											>
												{content.item.name}
											</div>
											<div
												style={{
													fontSize: 12,
													color: "var(--muted)",
													fontFamily: "var(--font-mono)",
												}}
											>
												{ext} Document • {formatBytes(content.item.sizeBytes)}
											</div>
										</div>

										<div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
											This file format cannot be rendered directly inside the preview window.
											You can open it with your system's default application or reveal it in
											your file manager.
										</div>

										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: 8,
												width: "100%",
												marginTop: 8,
											}}
										>
											<button
												onClick={() => {
													if (content?.item.path) {
														window.api.invoke({
															type: "openFileIn",
															target: "defaultApp",
															filePath: content.item.path,
														})
													}
												}}
												style={{
													display: "inline-flex",
													alignItems: "center",
													justifyContent: "center",
													gap: 8,
													padding: "10px 16px",
													borderRadius: 8,
													border: "none",
													backgroundColor: "var(--accent)",
													color: "var(--on-accent)",
													fontSize: 13,
													fontWeight: 500,
													cursor: "pointer",
													width: "100%",
												}}
											>
												<Icon size={14} strokeWidth={2}>
													<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
													<polyline points="15 3 21 3 21 9" />
													<line x1="10" y1="14" x2="21" y2="3" />
												</Icon>
												<span>Open in Default App</span>
											</button>

											<button
												onClick={handleRevealInFolder}
												style={{
													display: "inline-flex",
													alignItems: "center",
													justifyContent: "center",
													gap: 8,
													padding: "10px 16px",
													borderRadius: 8,
													border: "1px solid var(--border)",
													backgroundColor: "var(--bg-surface)",
													color: "var(--text)",
													fontSize: 13,
													fontWeight: 500,
													cursor: "pointer",
													width: "100%",
												}}
											>
												<OpenFolderIcon size={14} />
												<span>Reveal in Folder</span>
											</button>
										</div>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	)
}
