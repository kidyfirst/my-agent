import React, { useState, useEffect, useCallback, useRef } from "react"
import {
	LibraryIcon,
	ImageIcon,
	DocumentIcon,
	NoteIcon,
	FolderIcon,
	SpreadsheetIcon,
	PresentationIcon,
	TrashIcon,
	StarIcon,
	OpenFolderIcon,
	OcrIcon,
} from "./LibraryIcon"
import { LibraryPreviewModal } from "./LibraryPreviewModal"


export interface LibraryItem {
	id: string
	name: string
	type: "image" | "document" | "folder"
	path: string
	relativePath: string
	sizeBytes: number
	createdAt: string
	updatedAt: string
	previewUrl?: string
	isFavorite?: boolean
	tags?: string[]
	itemCount?: number
	sagDocumentId?: string
	snippet?: string
	score?: number
	hasOcr?: boolean
}

interface LibraryModalProps {
	isOpen: boolean
	onClose: () => void
	showToast?: (message: string, type?: "info" | "success" | "error") => void
}

type TabType = "recommended" | "favorite" | "folder" | "image" | "all"
type ViewMode = "grid" | "list"

function isCleanSnippet(snippet?: string): boolean {
	if (!snippet) return false
	if (snippet.includes("\0")) return false
	if (/[~@\x00-\x1f]{2,}/.test(snippet)) return false
	let valid = 0
	for (let i = 0; i < snippet.length; i++) {
		const c = snippet.charCodeAt(i)
		if (
			(c >= 0x4e00 && c <= 0x9fa5) ||
			(c >= 65 && c <= 90) ||
			(c >= 97 && c <= 122) ||
			(c >= 48 && c <= 57)
		) {
			valid++
		}
	}
	return valid >= snippet.length * 0.35
}

export function LibraryModal({ isOpen, onClose, showToast }: LibraryModalProps) {
	const [activeTab, setActiveTab] = useState<TabType>("recommended")
	const [viewMode, setViewMode] = useState<ViewMode>("grid")
	const [searchQuery, setSearchQuery] = useState("")
	const [items, setItems] = useState<LibraryItem[]>([])
	const [loading, setLoading] = useState(false)
	const [searchResults, setSearchResults] = useState<LibraryItem[] | null>(null)
	const [isSearching, setIsSearching] = useState(false)
	const [isSagConnected, setIsSagConnected] = useState(false)
	const [libraryPath, setLibraryPath] = useState("")
	const [currentFolder, setCurrentFolder] = useState("")
	const [showNewDropdown, setShowNewDropdown] = useState(false)
	const [isDraggingOver, setIsDraggingOver] = useState(false)
	const [newFolderName, setNewFolderName] = useState("")
	const [showFolderDialog, setShowFolderDialog] = useState(false)
	const [ocrLoadingIds, setOcrLoadingIds] = useState<Record<string, boolean>>({})
	const [ocrSuccessIds, setOcrSuccessIds] = useState<Record<string, boolean>>({})
	const [previewItemId, setPreviewItemId] = useState<string | null>(null)
	const [localToast, setLocalToast] = useState<{
		message: string
		type: "info" | "success" | "error"
	} | null>(null)

	const triggerToast = useCallback(
		(message: string, type: "info" | "success" | "error" = "info") => {
			if (showToast) {
				showToast(message, type)
			} else {
				setLocalToast({ message, type })
				setTimeout(() => {
					setLocalToast((t) => (t?.message === message ? null : t))
				}, 3000)
			}
		},
		[showToast],
	)

	const dropdownRef = useRef<HTMLDivElement>(null)

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (previewItemId) {
					setPreviewItemId(null)
				} else if (showNewDropdown) {
					setShowNewDropdown(false)
				} else if (showFolderDialog) {
					setShowFolderDialog(false)
				} else {
					onClose()
				}
			}
		}
		if (isOpen) {
			window.addEventListener("keydown", handleKeyDown)
		}
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [isOpen, previewItemId, showNewDropdown, showFolderDialog, onClose])

	// Close dropdown when clicked outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setShowNewDropdown(false)
			}
		}
		if (showNewDropdown) {
			window.addEventListener("mousedown", handleClickOutside)
		}
		return () => window.removeEventListener("mousedown", handleClickOutside)
	}, [showNewDropdown])

	const loadItems = useCallback(async (folder = currentFolder) => {
		setLoading(true)
		try {
			const res = (await window.api.invoke({
				type: "listLibraryItems",
				folder,
			})) as { items: LibraryItem[]; isSagConnected: boolean; libraryPath?: string }
			if (res?.items) {
				setItems(res.items)
				setIsSagConnected(Boolean(res.isSagConnected))
				if (res.libraryPath) setLibraryPath(res.libraryPath)
			}
		} catch (err) {
			console.error("[LibraryModal] Failed to load items:", err)
		} finally {
			setLoading(false)
		}
	}, [currentFolder])

	useEffect(() => {
		if (isOpen) {
			loadItems(currentFolder)
		}
	}, [isOpen, currentFolder, loadItems])

	// Upload files via native dialog
	const handleSelectFiles = async (kind: "file" | "image" | "folder") => {
		setShowNewDropdown(false)
		try {
			const res = (await window.api.invoke({
				type: "openLibraryFileDialog",
				kind,
			})) as { cancelled: boolean; filePaths: string[] }

			if (!res.cancelled && res.filePaths.length > 0) {
				await window.api.invoke({
					type: "uploadLibraryFiles",
					filePaths: res.filePaths,
					parent: currentFolder,
				})
				await loadItems(currentFolder)
			}
		} catch (err) {
			console.error("[LibraryModal] File selection error:", err)
		}
	}

	// Create folder
	const handleCreateFolder = async () => {
		if (!newFolderName.trim()) return
		try {
			await window.api.invoke({
				type: "createLibraryFolder",
				name: newFolderName.trim(),
				parent: currentFolder,
			})
			setNewFolderName("")
			setShowFolderDialog(false)
			await loadItems(currentFolder)
		} catch (err) {
			console.error("[LibraryModal] Create folder error:", err)
		}
	}

	// Create note
	const handleCreateNote = async () => {
		setShowNewDropdown(false)
		const noteTitle = window.prompt("Enter note title:", "Untitled Note")
		if (!noteTitle) return
		const fileName = noteTitle.endsWith(".md") ? noteTitle : `${noteTitle}.md`
		const buffer = btoa(unescape(encodeURIComponent(`# ${noteTitle}\n\n`)))
		try {
			await window.api.invoke({
				type: "uploadLibraryFiles",
				files: [{ name: fileName, buffer }],
				parent: currentFolder,
			})
			await loadItems(currentFolder)
		} catch (err) {
			console.error("[LibraryModal] Create note error:", err)
		}
	}

	// Delete item
	const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation()
		if (!window.confirm("Are you sure you want to delete this item?")) return
		try {
			await window.api.invoke({ type: "deleteLibraryItem", id })
			await loadItems(currentFolder)
		} catch (err) {
			console.error("[LibraryModal] Delete error:", err)
		}
	}

	// Toggle favorite
	const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation()
		try {
			await window.api.invoke({ type: "toggleLibraryFavorite", id })
			setItems((prev) =>
				prev.map((item) =>
					item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
				),
			)
		} catch (err) {
			console.error("[LibraryModal] Toggle favorite error:", err)
		}
	}

	// Reveal in Finder/Explorer
	const handleOpenInFolder = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation()
		try {
			await window.api.invoke({ type: "openLibraryItemInFolder", id })
		} catch (err) {
			console.error("[LibraryModal] Open folder error:", err)
		}
	}

	// Manual OCR Recognition for images
	const handleRecognizeOcr = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation()
		setOcrLoadingIds((prev) => ({ ...prev, [id]: true }))
		try {
			const res = (await window.api.invoke({
				type: "analyzeLibraryImage",
				id,
			})) as { success: boolean; data?: any }
			if (res?.success) {
				triggerToast("OCR completed successfully", "success")
				setOcrSuccessIds((prev) => ({ ...prev, [id]: true }))
				setTimeout(() => {
					setItems((prev) =>
						prev.map((item) => (item.id === id ? { ...item, hasOcr: true } : item)),
					)
					setSearchResults((prev) =>
						prev
							? prev.map((item) => (item.id === id ? { ...item, hasOcr: true } : item))
							: null,
					)
					setOcrSuccessIds((prev) => {
						const next = { ...prev }
						delete next[id]
						return next
					})
				}, 1200)
			} else {
				triggerToast("Failed to analyze image with model. Please check model settings.", "error")
			}
		} catch (err: any) {
			console.error("[LibraryModal] OCR recognition error:", err)
			triggerToast(`OCR error: ${err?.message || "Failed to analyze image"}`, "error")
		} finally {
			setOcrLoadingIds((prev) => ({ ...prev, [id]: false }))
		}
	}

	// Drag & drop handlers
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(true)
	}

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(false)
	}

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDraggingOver(false)

		const files = Array.from(e.dataTransfer.files)
		if (files.length === 0) return

		// Use electron file path if available
		const filePaths = files
			.map((f: any) => f.path)
			.filter((p): p is string => typeof p === "string" && p.length > 0)

		if (filePaths.length > 0) {
			try {
				await window.api.invoke({
					type: "uploadLibraryFiles",
					filePaths,
					parent: currentFolder,
				})
				await loadItems(currentFolder)
			} catch (err) {
				console.error("[LibraryModal] Drag upload error:", err)
			}
		} else {
			// Read array buffers as fallback
			const filePayloads: Array<{ name: string; buffer: string }> = []
			for (const f of files) {
				const buf = await f.arrayBuffer()
				const base64 = btoa(
					new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ""),
				)
				filePayloads.push({ name: f.name, buffer: base64 })
			}
			try {
				await window.api.invoke({
					type: "uploadLibraryFiles",
					files: filePayloads,
					parent: currentFolder,
				})
				await loadItems(currentFolder)
			} catch (err) {
				console.error("[LibraryModal] Buffer upload error:", err)
			}
		}
	}

	// Full-text search across document contents & filenames
	useEffect(() => {
		const q = searchQuery.trim()
		if (!q) {
			setSearchResults(null)
			setIsSearching(false)
			return
		}

		setIsSearching(true)
		const timer = setTimeout(async () => {
			try {
				const res = await window.api.invoke({
					type: "searchLibrary",
					query: q,
					category:
						activeTab === "all" || activeTab === "recommended"
							? undefined
							: activeTab,
					limit: 50,
					maxTokens: 0,
				})
				const rawRes = res as any
				if (rawRes && Array.isArray(rawRes.items)) {
					const matchedItems: LibraryItem[] = rawRes.items.map((it: any) => {
						const existing = items.find(
							(i) => i.id === it.id || i.relativePath === it.id,
						)
						const hasOcr =
							it.hasOcr !== undefined
								? Boolean(it.hasOcr)
								: existing?.hasOcr !== undefined
								? Boolean(existing.hasOcr)
								: Boolean(
										it.snippet?.startsWith("[Image Summary]") ||
											it.snippet?.startsWith("[Image OCR]"),
									)
						return {
							id: it.id,
							name: it.name,
							type: it.type || existing?.type || "document",
							path: it.path || existing?.path || "",
							relativePath: it.id,
							sizeBytes: existing?.sizeBytes || 0,
							createdAt: existing?.createdAt || new Date().toISOString(),
							updatedAt: existing?.updatedAt || new Date().toISOString(),
							previewUrl: it.previewUrl || existing?.previewUrl,
							isFavorite: existing?.isFavorite,
							itemCount: existing?.itemCount,
							snippet: it.snippet,
							hasOcr,
						}
					})
					setSearchResults(matchedItems)
				} else {
					setSearchResults([])
				}
			} catch (err) {
				console.error("[LibraryModal] Search error:", err)
				setSearchResults([])
			} finally {
				setIsSearching(false)
			}
		}, 180)

		return () => clearTimeout(timer)
	}, [searchQuery, activeTab, items])

	// Filter items (falls back to items if no search query, or uses full-text search results)
	const baseList = searchResults !== null ? searchResults : items
	const filteredItems = baseList.filter((item) => {
		if (activeTab === "favorite") return item.isFavorite
		if (activeTab === "folder") return item.type === "folder"
		if (activeTab === "image") return item.type === "image"
		return true
	})

	const formatSize = (bytes: number) => {
		if (!bytes) return "0 B"
		if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
		if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB"
		return bytes + " B"
	}

	if (!isOpen) return null

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1000,
				backgroundColor: "var(--scrim-subtle)",
				backdropFilter: "blur(4px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					width: "min(1080px, 96vw)",
					height: "min(760px, 88vh)",
					display: "flex",
					flexDirection: "column",
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
					position: "relative",
				}}
				onClick={(e) => e.stopPropagation()}
				onDragOver={handleDragOver}
				onDragEnter={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{/* Floating Modal Toast Notification */}
				{localToast && (
					<div
						role="status"
						aria-live="polite"
						style={{
							position: "absolute",
							top: 16,
							left: "50%",
							transform: "translateX(-50%)",
							zIndex: 150,
							maxWidth: "min(480px, calc(100% - 32px))",
							padding: "8px 16px",
							borderRadius: 8,
							backgroundColor: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							boxShadow: "var(--shadow-popover)",
							color: "var(--text)",
							fontFamily: "inherit",
							fontSize: 12,
							fontWeight: 500,
							lineHeight: 1.5,
							display: "flex",
							alignItems: "center",
							gap: 8,
							pointerEvents: "none",
						}}
					>
						<span
							style={{
								color:
									localToast.type === "error"
										? "var(--error)"
										: localToast.type === "success"
										? "var(--success)"
										: "var(--accent)",
								fontWeight: 700,
								flex: "0 0 auto",
							}}
						>
							{localToast.type === "error" ? "⚠" : localToast.type === "success" ? "✓" : "•"}
						</span>
						<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
							{localToast.message}
						</span>
					</div>
				)}

				{/* Drag & Drop Highlight Overlay */}
				{isDraggingOver && (
					<div
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 50,
							backgroundColor: "var(--bg)",
							border: "2px dashed var(--accent)",
							borderRadius: 12,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							gap: 12,
							pointerEvents: "none",
						}}
					>
						<svg
							width="48"
							height="48"
							viewBox="0 0 24 24"
							fill="none"
							stroke="var(--accent)"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						<div
							style={{
								fontSize: 16,
								fontWeight: 600,
								color: "var(--accent)",
							}}
						>
							Drop files or folders here to import into Library
						</div>
						<div style={{ fontSize: 12, color: "var(--muted)" }}>
							Automatic SAG Event-Entity structured indexing
						</div>
					</div>
				)}

				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "8px 12px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
						flexShrink: 0,
					}}
				>
					{/* Title tile — same shape as the Logging dialog's */}
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
								fontSize: 12,
								fontWeight: "bold",
							}}
						>
							<LibraryIcon size={13} filled={true} />
						</div>
						<span
							style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
						>
							Library
						</span>
					</div>
					<span
						style={{
							fontSize: 10,
							fontWeight: 500,
							padding: "1px 6px",
							borderRadius: 4,
							border: "1px solid var(--border-muted)",
							color: "var(--muted)",
							background: "var(--bg-elevated)",
							letterSpacing: "0.3px",
							lineHeight: 1.4,
							display: "inline-flex",
							alignItems: "center",
							userSelect: "none",
						}}
					>
						{isSagConnected ? "SAG SYNC" : "LOCAL"}
					</span>

					{currentFolder && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 11,
								color: "var(--muted)",
							}}
						>
							<span>/</span>
							<button
								type="button"
								onClick={() => setCurrentFolder("")}
								style={{
									background: "none",
									border: "none",
									color: "var(--accent)",
									cursor: "pointer",
									padding: 0,
									fontSize: 11,
									fontFamily: "inherit",
									textDecoration: "underline",
								}}
							>
								Root
							</button>
							<span>/</span>
							<span style={{ fontWeight: 600, color: "var(--text)" }}>
								{currentFolder}
							</span>
						</div>
					)}

					<div style={{ flex: 1 }} />

					{/* New button with dropdown */}
					<div style={{ position: "relative" }} ref={dropdownRef}>
						<button
							type="button"
							onClick={() => setShowNewDropdown((prev) => !prev)}
							style={{
								fontSize: 11,
								fontFamily: "inherit",
								padding: "3px 9px",
								borderRadius: 5,
								border: "1px solid var(--border-accent)",
								background: "var(--accent)",
								color: "var(--on-accent)",
								cursor: "pointer",
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
								fontWeight: 500,
							}}
						>
							<span style={{ fontSize: 12, lineHeight: 1 }}>+</span>
							<span>New</span>
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{
									transform: showNewDropdown ? "rotate(180deg)" : "rotate(0deg)",
									transition: "transform 0.15s ease",
								}}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>

						{/* New Dropdown Menu */}
						{showNewDropdown && (
							<div
								style={{
									position: "absolute",
									top: "100%",
									right: 0,
									marginTop: 4,
									backgroundColor: "var(--bg-elevated)",
									border: "1px solid var(--border)",
									borderRadius: 8,
									boxShadow: "var(--shadow-popover)",
									padding: 4,
									zIndex: 100,
									minWidth: 150,
									display: "flex",
									flexDirection: "column",
									gap: 1,
								}}
							>
								<button
									onClick={handleCreateNote}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										border: "none",
										background: "none",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										cursor: "pointer",
										textAlign: "left",
										transition: "background-color 0.1s ease",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<NoteIcon size={16} />
									<span>Note</span>
								</button>
								<button
									onClick={() => handleSelectFiles("image")}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										border: "none",
										background: "none",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										cursor: "pointer",
										textAlign: "left",
										transition: "background-color 0.1s ease",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<ImageIcon size={16} />
									<span>Image</span>
								</button>
								<button
									onClick={() => handleSelectFiles("file")}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										border: "none",
										background: "none",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										cursor: "pointer",
										textAlign: "left",
										transition: "background-color 0.1s ease",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<DocumentIcon size={16} />
									<span>Document</span>
								</button>
								<button
									onClick={() => handleSelectFiles("file")}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										border: "none",
										background: "none",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										cursor: "pointer",
										textAlign: "left",
										transition: "background-color 0.1s ease",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<SpreadsheetIcon size={16} />
									<span>Spreadsheet</span>
								</button>
								<button
									onClick={() => handleSelectFiles("file")}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										border: "none",
										background: "none",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										cursor: "pointer",
										textAlign: "left",
										transition: "background-color 0.1s ease",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<PresentationIcon size={16} />
									<span>Presentation</span>
								</button>
								<button
									onClick={() => {
										setShowNewDropdown(false)
										setShowFolderDialog(true)
									}}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										border: "none",
										background: "none",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										cursor: "pointer",
										textAlign: "left",
										transition: "background-color 0.1s ease",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<FolderIcon size={16} />
									<span>Folder</span>
								</button>
							</div>
						)}
					</div>

					{/* Close Dialog Button (X) */}
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
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>

				{/* Filter & Search Bar */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "10px 14px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg)",
						flexShrink: 0,
						minHeight: 44,
					}}
				>
					{(
						[
							{ id: "recommended", label: "Recommended" },
							{ id: "favorite", label: "Favorites" },
							{ id: "folder", label: "Folders" },
							{ id: "image", label: "Images" },
							{ id: "all", label: "All" },
						] as const
					).map((tab) => {
						const active = activeTab === tab.id
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								style={{
									fontSize: 10,
									fontWeight: 700,
									letterSpacing: "0.3px",
									padding: "4px 10px",
									borderRadius: 999,
									cursor: "pointer",
									fontFamily: "inherit",
									border: `1px solid ${active ? "var(--border-accent)" : "var(--border)"}`,
									color: active ? "var(--accent)" : "var(--dim)",
									background: active ? "var(--selected-bg)" : "var(--bg-surface)",
									opacity: active ? 1 : 0.65,
								}}
							>
								{tab.label.toUpperCase()}
							</button>
						)
					})}

					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={isSearching ? "Searching content…" : "Filter or search content & files…"}
						style={{
							flex: 1,
							minWidth: 0,
							marginLeft: 4,
							padding: "6px 12px",
							fontSize: 12,
							height: 32,
							fontFamily: "inherit",
							color: "var(--text)",
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							outline: "none",
						}}
					/>

					{/* View mode toggle */}
					<div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: 2 }}>
						<button
							type="button"
							onClick={() => setViewMode("grid")}
							title="Grid view"
							style={{
								padding: "5px 7px",
								borderRadius: 5,
								border: `1px solid ${viewMode === "grid" ? "var(--border-accent)" : "transparent"}`,
								background: viewMode === "grid" ? "var(--selected-bg)" : "transparent",
								color: viewMode === "grid" ? "var(--accent)" : "var(--muted)",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
							}}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="3" width="7" height="7" rx="1.5" />
								<rect x="14" y="3" width="7" height="7" rx="1.5" />
								<rect x="14" y="14" width="7" height="7" rx="1.5" />
								<rect x="3" y="14" width="7" height="7" rx="1.5" />
							</svg>
						</button>
						<button
							type="button"
							onClick={() => setViewMode("list")}
							title="List view"
							style={{
								padding: "5px 7px",
								borderRadius: 5,
								border: `1px solid ${viewMode === "list" ? "var(--border-accent)" : "transparent"}`,
								background: viewMode === "list" ? "var(--selected-bg)" : "transparent",
								color: viewMode === "list" ? "var(--accent)" : "var(--muted)",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
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
							>
								<line x1="8" y1="6" x2="21" y2="6" />
								<line x1="8" y1="12" x2="21" y2="12" />
								<line x1="8" y1="18" x2="21" y2="18" />
								<line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="2.5" />
								<line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="2.5" />
								<line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="2.5" />
							</svg>
						</button>
					</div>

					<span
						style={{ fontSize: 11, color: "var(--dim)", whiteSpace: "nowrap", marginLeft: 4 }}
					>
						{filteredItems.length} / {items.length}
					</span>
				</div>

				{/* Middle: Content Area (Empty State or Items Grid/List) */}
				<div
					style={{
						flex: 1,
						overflowY: "auto",
						padding: filteredItems.length === 0 ? "32px 16px" : "12px 14px",
						position: "relative",
						visibility: isDraggingOver ? "hidden" : "visible",
					}}
				>
					{filteredItems.length === 0 ? (
						// Empty State matching screenshot
						<div
							style={{
								height: "100%",
								minHeight: 320,
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								justifyContent: "center",
								textAlign: "center",
								gap: 12,
							}}
						>
							{/* Overlapping folder / photo icon graphic */}
							<div
								style={{
									width: 56,
									height: 56,
									borderRadius: 12,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: "var(--muted)",
								}}
							>
								<LibraryIcon size={44} strokeWidth={1.5} />
							</div>

							<div
								style={{
									fontSize: 16,
									fontWeight: 600,
									color: "var(--text)",
								}}
							>
								Create new content
							</div>

							<div
								style={{
									fontSize: 13,
									color: "var(--muted)",
									maxWidth: 420,
									lineHeight: 1.5,
								}}
							>
								Content you add or create with Agent (such as images and documents) will appear here
							</div>

							<div style={{ marginTop: 8 }}>
								<button
									onClick={() => setShowNewDropdown((prev) => !prev)}
									style={{
										background: "var(--accent)",
										color: "var(--on-accent)",
										border: "none",
										borderRadius: 8,
										padding: "8px 18px",
										fontWeight: 600,
										fontSize: 13,
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										gap: 6,
										boxShadow: "var(--shadow-sm)",
										transition: "opacity 0.15s ease",
									}}
									onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
									onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
								>
									<span>Start creating</span>
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
											transform: showNewDropdown ? "rotate(180deg)" : "rotate(0deg)",
											transition: "transform 0.15s ease",
										}}
									>
										<polyline points="6 9 12 15 18 9" />
									</svg>
								</button>
							</div>
						</div>
					) : viewMode === "grid" ? (
						// Grid View
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
								gap: 12,
							}}
						>
							{filteredItems.map((item) => (
								<div
									key={item.id}
									onClick={() => {
										if (item.type === "folder") {
											setCurrentFolder(item.relativePath)
										} else {
											setPreviewItemId(item.id)
										}
									}}
									style={{
										borderRadius: 12,
										border: "1px solid var(--border)",
										backgroundColor: "var(--bg-surface)",
										overflow: "hidden",
										display: "flex",
										flexDirection: "column",
										cursor: "pointer",
										transition: "transform 0.1s, box-shadow 0.15s",
										position: "relative",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.borderColor = "var(--border-accent)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.borderColor = "var(--border)"
									}}
								>
									{/* Thumbnail / Icon area */}
									<div
										style={{
											height: 120,
											backgroundColor: "var(--bg-elevated)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											overflow: "hidden",
											position: "relative",
										}}
									>
										{item.type === "image" && item.previewUrl ? (
											<img
												src={item.previewUrl}
												alt={item.name}
												style={{
													width: "100%",
													height: "100%",
													objectFit: "cover",
												}}
											/>
										) : item.type === "folder" ? (
											<FolderIcon
												size={48}
												strokeWidth={1.5}
												color="var(--accent)"
											/>
										) : item.type === "image" ? (
											<ImageIcon
												size={44}
												strokeWidth={1.5}
												color="var(--muted)"
											/>
										) : (
											<DocumentIcon
												size={44}
												strokeWidth={1.5}
												color="var(--muted)"
											/>
										)}

										{/* Quick action buttons floating on top-right */}
										<div
											style={{
												position: "absolute",
												top: 6,
												right: 6,
												display: "flex",
												gap: 4,
											}}
										>
											<button
												type="button"
												onClick={(e) => handleToggleFavorite(e, item.id)}
												title={
													item.isFavorite
														? "Remove from favorites"
														: "Add to favorites"
												}
												style={{
													background: item.isFavorite
														? "color-mix(in srgb, var(--warning) 16%, var(--bg-surface))"
														: "var(--bg-surface)",
													border: item.isFavorite
														? "1px solid color-mix(in srgb, var(--warning) 40%, var(--border))"
														: "1px solid var(--border)",
													borderRadius: "50%",
													width: 24,
													height: 24,
													cursor: "pointer",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													boxShadow: "var(--shadow-sm)",
													transition: "all 0.15s ease",
												}}
												onMouseEnter={(e) => {
													if (!item.isFavorite) {
														e.currentTarget.style.borderColor = "var(--warning)"
														e.currentTarget.style.background = "var(--bg-hover)"
													}
												}}
												onMouseLeave={(e) => {
													if (!item.isFavorite) {
														e.currentTarget.style.borderColor = "var(--border)"
														e.currentTarget.style.background = "var(--bg-surface)"
													}
												}}
											>
												<StarIcon
													size={13}
													filled={item.isFavorite}
													color={item.isFavorite ? "var(--warning)" : "var(--thinking-text)"}
												/>
											</button>
										</div>
									</div>

									{/* Card info */}
									<div
										style={{
											padding: "10px 12px",
											display: "flex",
											flexDirection: "column",
											gap: 4,
										}}
									>
										<div
											style={{
												fontSize: 13,
												fontWeight: 600,
												color: "var(--text)",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
											title={item.name}
										>
											{item.name}
										</div>
										{item.snippet && isCleanSnippet(item.snippet) && (
											<div
												style={{
													fontSize: 11,
													color: "var(--muted)",
													lineHeight: 1.35,
													overflow: "hidden",
													textOverflow: "ellipsis",
													display: "-webkit-box",
													WebkitLineClamp: 2,
													WebkitBoxOrient: "vertical",
													backgroundColor: "var(--bg-elevated)",
													padding: "3px 6px",
													borderRadius: 4,
													marginTop: 2,
												}}
												title={item.snippet}
											>
												{item.snippet}
											</div>
										)}
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												fontSize: 11,
												color: "var(--muted)",
											}}
										>
											<span>
												{item.type === "folder"
													? `${item.itemCount || 0} items`
													: formatSize(item.sizeBytes)}
											</span>
											<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
												{item.type === "image" && (!item.hasOcr || ocrSuccessIds[item.id]) && (
													<button
														onClick={(e) => handleRecognizeOcr(e, item.id)}
														disabled={ocrLoadingIds[item.id] || ocrSuccessIds[item.id]}
														title={
															ocrSuccessIds[item.id]
																? "OCR completed!"
																: ocrLoadingIds[item.id]
																? "Analyzing..."
																: "Analyze image (OCR)"
														}
														style={{
															background: "none",
															border: "none",
															color: ocrSuccessIds[item.id]
																? "var(--success)"
																: "var(--muted)",
															cursor: ocrLoadingIds[item.id]
																? "wait"
																: ocrSuccessIds[item.id]
																? "default"
																: "pointer",
															padding: 2,
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															borderRadius: 4,
															transition: "all 0.15s ease",
															opacity: ocrLoadingIds[item.id] ? 0.5 : 1,
														}}
														onMouseEnter={(e) => {
															if (!ocrSuccessIds[item.id] && !ocrLoadingIds[item.id]) {
																e.currentTarget.style.color = "var(--text)"
																e.currentTarget.style.backgroundColor = "var(--bg-hover)"
															}
														}}
														onMouseLeave={(e) => {
															if (!ocrSuccessIds[item.id] && !ocrLoadingIds[item.id]) {
																e.currentTarget.style.color = "var(--muted)"
																e.currentTarget.style.backgroundColor = "transparent"
															}
														}}
													>
														{ocrSuccessIds[item.id] ? (
															<svg
																width="14"
																height="14"
																viewBox="0 0 24 24"
																fill="none"
																stroke="var(--success)"
																strokeWidth="2.5"
																strokeLinecap="round"
																strokeLinejoin="round"
															>
																<polyline points="20 6 9 17 4 12" />
															</svg>
														) : (
															<OcrIcon size={14} />
														)}
													</button>
												)}
												<button
													onClick={(e) => handleOpenInFolder(e, item.id)}
													title="Reveal in Finder"
													style={{
														background: "none",
														border: "none",
														color: "var(--muted)",
														cursor: "pointer",
														padding: 2,
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														borderRadius: 4,
														transition: "color 0.15s ease",
													}}
													onMouseEnter={(e) =>
														(e.currentTarget.style.color = "var(--text)")
													}
													onMouseLeave={(e) =>
														(e.currentTarget.style.color = "var(--muted)")
													}
												>
													<OpenFolderIcon size={14} />
												</button>
												<button
													onClick={(e) => handleDeleteItem(e, item.id)}
													title="Delete"
													style={{
														background: "none",
														border: "none",
														color: "var(--muted)",
														cursor: "pointer",
														padding: 2,
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														borderRadius: 4,
														transition: "all 0.15s ease",
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.color = "var(--error)"
														e.currentTarget.style.backgroundColor =
															"color-mix(in srgb, var(--error) 12%, transparent)"
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.color = "var(--muted)"
														e.currentTarget.style.backgroundColor = "transparent"
													}}
												>
													<TrashIcon size={14} />
												</button>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						// List View
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								borderRadius: 8,
								border: "1px solid var(--border)",
								overflow: "hidden",
							}}
						>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "36px 1fr 100px 100px 80px",
									padding: "8px 12px",
									backgroundColor: "var(--bg-elevated)",
									fontSize: 12,
									fontWeight: 600,
									color: "var(--muted)",
									borderBottom: "1px solid var(--border)",
								}}
							>
								<span></span>
								<span>Name</span>
								<span>Type</span>
								<span>Size</span>
								<span style={{ textAlign: "right" }}>Actions</span>
							</div>

							{filteredItems.map((item) => (
								<div
									key={item.id}
									onClick={() => {
										if (item.type === "folder") {
											setCurrentFolder(item.relativePath)
										} else {
											setPreviewItemId(item.id)
										}
									}}
									style={{
										display: "grid",
										gridTemplateColumns: "36px 1fr 100px 100px 80px",
										alignItems: "center",
										padding: "10px 12px",
										borderBottom: "1px solid var(--border-muted)",
										cursor: "pointer",
										fontSize: 13,
										color: "var(--text)",
									}}
									onMouseEnter={(e) =>
										(e.currentTarget.style.backgroundColor = "var(--bg-hover)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.backgroundColor = "transparent")
									}
								>
									<span
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: 20,
											height: 20,
										}}
									>
										{item.type === "image" ? (
											<ImageIcon size={16} color="var(--text)" />
										) : item.type === "folder" ? (
											<FolderIcon size={16} color="var(--accent)" />
										) : (
											<DocumentIcon size={16} color="var(--text)" />
										)}
									</span>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											overflow: "hidden",
										}}
									>
										<span
											style={{
												fontWeight: 500,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{item.name}
										</span>
										{item.snippet && isCleanSnippet(item.snippet) && (
											<span
												style={{
													fontSize: 11,
													color: "var(--muted)",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
												title={item.snippet}
											>
												{item.snippet}
											</span>
										)}
									</div>
									<span style={{ fontSize: 11, color: "var(--muted)" }}>
										{item.type}
									</span>
									<span style={{ fontSize: 11, color: "var(--muted)" }}>
										{item.type === "folder"
											? `${item.itemCount || 0} items`
											: formatSize(item.sizeBytes)}
									</span>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "flex-end",
											gap: 8,
										}}
									>
										<button
											onClick={(e) => handleToggleFavorite(e, item.id)}
											title={
												item.isFavorite
													? "Remove from favorites"
													: "Add to favorites"
											}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												padding: 2,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												borderRadius: 4,
											}}
										>
											<StarIcon
												size={14}
												filled={item.isFavorite}
												color={item.isFavorite ? "var(--warning)" : "var(--thinking-text)"}
											/>
										</button>
										{item.type === "image" && (!item.hasOcr || ocrSuccessIds[item.id]) && (
											<button
												onClick={(e) => handleRecognizeOcr(e, item.id)}
												disabled={ocrLoadingIds[item.id] || ocrSuccessIds[item.id]}
												title={
													ocrSuccessIds[item.id]
														? "OCR completed!"
														: ocrLoadingIds[item.id]
														? "Analyzing..."
														: "Analyze image (OCR)"
												}
												style={{
													background: "none",
													border: "none",
													color: ocrSuccessIds[item.id]
														? "var(--success)"
														: "var(--muted)",
													cursor: ocrLoadingIds[item.id]
														? "wait"
														: ocrSuccessIds[item.id]
														? "default"
														: "pointer",
													padding: 2,
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													borderRadius: 4,
													transition: "all 0.15s ease",
													opacity: ocrLoadingIds[item.id] ? 0.5 : 1,
												}}
												onMouseEnter={(e) => {
													if (!ocrSuccessIds[item.id] && !ocrLoadingIds[item.id]) {
														e.currentTarget.style.color = "var(--text)"
														e.currentTarget.style.backgroundColor = "var(--bg-hover)"
													}
												}}
												onMouseLeave={(e) => {
													if (!ocrSuccessIds[item.id] && !ocrLoadingIds[item.id]) {
														e.currentTarget.style.color = "var(--muted)"
														e.currentTarget.style.backgroundColor = "transparent"
													}
												}}
											>
												{ocrSuccessIds[item.id] ? (
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="var(--success)"
														strokeWidth="2.5"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<polyline points="20 6 9 17 4 12" />
													</svg>
												) : (
													<OcrIcon size={14} />
												)}
											</button>
										)}
										<button
											onClick={(e) => handleDeleteItem(e, item.id)}
											title="Delete"
											style={{
												background: "none",
												border: "none",
												color: "var(--muted)",
												cursor: "pointer",
												padding: 2,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												borderRadius: 4,
												transition: "all 0.15s ease",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.color = "var(--error)"
												e.currentTarget.style.backgroundColor =
													"color-mix(in srgb, var(--error) 12%, transparent)"
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.color = "var(--muted)"
												e.currentTarget.style.backgroundColor = "transparent"
											}}
										>
											<TrashIcon size={14} />
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* New Folder Modal Prompt */}
				{showFolderDialog && (
					<div
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 110,
							backgroundColor: "var(--scrim-subtle)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<div
							style={{
								backgroundColor: "var(--bg)",
								border: "1px solid var(--border)",
								borderRadius: 12,
								padding: 20,
								width: 320,
								boxShadow: "var(--shadow-popover)",
								display: "flex",
								flexDirection: "column",
								gap: 14,
							}}
						>
							<div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
								New Folder
							</div>
							<input
								type="text"
								placeholder="Folder name"
								value={newFolderName}
								onChange={(e) => setNewFolderName(e.target.value)}
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreateFolder()
								}}
								style={{
									padding: "8px 12px",
									borderRadius: 6,
									border: "1px solid var(--border)",
									backgroundColor: "var(--bg-surface)",
									color: "var(--text)",
									fontSize: 13,
									outline: "none",
								}}
							/>
							<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
								<button
									onClick={() => setShowFolderDialog(false)}
									style={{
										padding: "6px 12px",
										borderRadius: 6,
										border: "1px solid var(--border)",
										background: "none",
										color: "var(--muted)",
										cursor: "pointer",
										fontSize: 12,
									}}
								>
									Cancel
								</button>
								<button
									onClick={handleCreateFolder}
									style={{
										padding: "6px 14px",
										borderRadius: 6,
										border: "none",
										backgroundColor: "var(--accent)",
										color: "var(--on-accent)",
										fontWeight: 600,
										cursor: "pointer",
										fontSize: 12,
									}}
								>
									Create
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Library Item Preview Dialog */}
			<LibraryPreviewModal
				itemId={previewItemId}
				onClose={() => setPreviewItemId(null)}
				onOcrCompleted={(id) => {
					setOcrSuccessIds((prev) => ({ ...prev, [id]: true }))
					loadItems(currentFolder)
				}}
				showToast={triggerToast}
			/>
		</div>
	)
}
