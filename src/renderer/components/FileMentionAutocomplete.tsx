import {
	useState,
	useEffect,
	useRef,
	useCallback,
	useMemo,
	type ReactNode,
} from "react"
import { getFileTypeInfo } from "../utils/fileIcons"
import type { AttachedFile } from "../types/chat"

export interface RepoFileItem {
	path: string
	name: string
	dir: string
	isRecentlyOpened?: boolean
}

/**
 * Extracts an active `@mention` query from text before the cursor.
 * Matches `@...` where there are no spaces or newlines between `@` and the cursor.
 */
export function extractAtMentionQuery(textBeforeCursor: string): {
	filter: string
	range: { start: number; end: number }
} | null {
	const lastAtIndex = textBeforeCursor.lastIndexOf("@")
	if (lastAtIndex === -1) return null

	const afterAt = textBeforeCursor.slice(lastAtIndex + 1)
	// If afterAt has any whitespace or newline, it's not an active mention query
	if (/[\s\r\n]/.test(afterAt)) {
		return null
	}

	return {
		filter: afterAt,
		range: {
			start: lastAtIndex,
			end: textBeforeCursor.length,
		},
	}
}

/**
 * Filters and ranks repository files against a search query.
 */
export function filterRepoFiles(
	files: string[],
	filter: string,
	openFiles?: string[],
): RepoFileItem[] {
	const openSet = new Set(
		(openFiles || []).map((f) => (f.startsWith("/") ? f.slice(1) : f)),
	)

	const items: RepoFileItem[] = files.map((f) => {
		const normalized = f.replace(/^\.\//, "")
		const parts = normalized.split("/")
		const name = parts[parts.length - 1]
		const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
		const isRecentlyOpened =
			openSet.has(normalized) ||
			Array.from(openSet).some((op) => op.endsWith(normalized))
		return { path: normalized, name, dir, isRecentlyOpened }
	})

	if (!filter.trim()) {
		// When no query typed yet (@), put recently opened files first
		return items
			.slice()
			.sort((a, b) => {
				if (a.isRecentlyOpened && !b.isRecentlyOpened) return -1
				if (!a.isRecentlyOpened && b.isRecentlyOpened) return 1
				return a.name.localeCompare(b.name)
			})
			.slice(0, 50)
	}

	const lower = filter.toLowerCase()
	const scored: Array<{ item: RepoFileItem; score: number }> = []

	for (const item of items) {
		const nameLower = item.name.toLowerCase()
		const pathLower = item.path.toLowerCase()

		let score = 0
		if (nameLower === lower) {
			score = 120
		} else if (nameLower.startsWith(lower)) {
			score = 100
		} else if (nameLower.includes(lower)) {
			score = 70
		} else if (pathLower.includes(lower)) {
			score = 40
		}

		if (score > 0) {
			if (item.isRecentlyOpened) {
				score += 25
			}
			scored.push({ item, score })
		}
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score
		return a.item.name.localeCompare(b.item.name)
	})

	return scored.slice(0, 50).map((s) => s.item)
}

/** React Atom SVG Icon for TSX / JSX files */
export function ReactAtomIcon({
	size = 15,
	color = "var(--brand-react)",
}: {
	size?: number
	color?: string
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="-11.5 -10.23174 23 20.46348"
			fill="none"
			// `color` may be a CSS variable, which SVG presentation attributes do
			// not resolve — paint through currentColor instead.
			style={{ flexShrink: 0, color }}
		>
			<circle cx="0" cy="0" r="2.05" fill="currentColor" />
			<g stroke="currentColor" strokeWidth="1" fill="none">
				<ellipse rx="11" ry="4.2" />
				<ellipse rx="11" ry="4.2" transform="rotate(60)" />
				<ellipse rx="11" ry="4.2" transform="rotate(120)" />
			</g>
		</svg>
	)
}

/** File Icon component rendering icons matching the file extension */
export function RepoFileIcon({
	name,
	size = 15,
}: {
	name: string
	size?: number
}) {
	const ext = name.split(".").pop()?.toLowerCase() || ""

	if (ext === "tsx" || ext === "jsx") {
		return <ReactAtomIcon size={size} />
	}

	if (ext === "ts") {
		return (
			<span
				style={{
					color: "var(--brand-typescript)",
					fontWeight: 700,
					fontSize: 10,
					width: size,
					height: size,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					flexShrink: 0,
					lineHeight: 1,
					fontFamily: "inherit",
				}}
			>
				TS
			</span>
		)
	}

	if (ext === "js" || ext === "mjs" || ext === "cjs") {
		return (
			<span
				style={{
					color: "var(--brand-javascript)",
					fontWeight: 700,
					fontSize: 10,
					width: size,
					height: size,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					flexShrink: 0,
					lineHeight: 1,
					fontFamily: "inherit",
				}}
			>
				JS
			</span>
		)
	}

	const info = getFileTypeInfo(name)
	return (
		<span
			style={{
				color: info.color,
				fontWeight: 700,
				fontSize: 9,
				width: size,
				height: size,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				lineHeight: 1,
				fontFamily: "inherit",
			}}
		>
			{info.label.toUpperCase()}
		</span>
	)
}

/** Highlights matched characters in filename */
export function HighlightedFileName({
	name,
	query,
}: {
	name: string
	query: string
}) {
	if (!query) {
		return <span style={{ fontWeight: 500, color: "var(--text)" }}>{name}</span>
	}

	const lowerName = name.toLowerCase()
	const lowerQuery = query.toLowerCase()
	const idx = lowerName.indexOf(lowerQuery)

	if (idx === -1) {
		return <span style={{ fontWeight: 500, color: "var(--text)" }}>{name}</span>
	}

	const before = name.slice(0, idx)
	const match = name.slice(idx, idx + query.length)
	const after = name.slice(idx + query.length)

	return (
		<span style={{ fontWeight: 500, color: "var(--text)" }}>
			{before}
			<span style={{ color: "var(--accent)", fontWeight: 700 }}>{match}</span>
			{after}
		</span>
	)
}

export interface UseFileMentionProps {
	filter: string
	visible: boolean
	onSelect: (filePath: string) => void
	onClose: () => void
	projectRootPath?: string | null
	openFiles?: string[]
}

/**
 * Autocomplete hook for selecting repository files with `@`.
 */
export function useFileMentionAutocomplete({
	filter,
	visible,
	onSelect,
	onClose,
	projectRootPath,
	openFiles,
}: UseFileMentionProps): {
	handleKeyDown: (e: React.KeyboardEvent) => boolean
	element: ReactNode
} {
	const [files, setFiles] = useState<string[]>([])
	const [selectedIndex, setSelectedIndex] = useState(0)
	const listRef = useRef<HTMLDivElement>(null)

	// Fetch files list from active repository
	useEffect(() => {
		let isMounted = true
		window.api
			.invoke({ type: "searchFiles" })
			.then((result) => {
				if (!isMounted) return
				const r = result as { files: string[] }
				setFiles(r?.files || [])
			})
			.catch(() => {
				if (isMounted) setFiles([])
			})

		return () => {
			isMounted = false
		}
	}, [projectRootPath])

	// Filter files based on filter text and recently opened tabs
	const filtered = useMemo(() => {
		return filterRepoFiles(files, filter, openFiles)
	}, [files, filter, openFiles])

	// Reset selected index when filter changes
	useEffect(() => {
		setSelectedIndex(0)
	}, [filter])

	// Scroll selected item into view
	useEffect(() => {
		if (!visible || !listRef.current) return
		const items = listRef.current.querySelectorAll("[data-file-index]")
		const selected = items[selectedIndex] as HTMLElement | undefined
		if (selected) {
			selected.scrollIntoView({ block: "nearest" })
		}
	}, [selectedIndex, visible])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			if (!visible || filtered.length === 0) return false

			if (e.key === "ArrowDown") {
				e.preventDefault()
				setSelectedIndex((i) => (i + 1) % filtered.length)
				return true
			}
			if (e.key === "ArrowUp") {
				e.preventDefault()
				setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
				return true
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault()
				if (filtered[selectedIndex]) {
					onSelect(filtered[selectedIndex].path)
				}
				return true
			}
			if (e.key === "Escape") {
				e.preventDefault()
				onClose()
				return true
			}
			return false
		},
		[visible, filtered, selectedIndex, onSelect, onClose],
	)

	if (!visible || filtered.length === 0) {
		return {
			handleKeyDown,
			element: null,
		}
	}

	return {
		handleKeyDown,
		element: (
			<div
				ref={listRef}
				style={{
					position: "absolute",
					bottom: "100%",
					left: 0,
					right: 0,
					maxHeight: 290,
					overflowY: "auto",
					background: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					padding: 6,
					zIndex: 60,
					boxShadow: "var(--shadow-popover)",
					marginBottom: 8,
					display: "flex",
					flexDirection: "column",
					gap: 2,
				}}
			>
				{filtered.map((item, idx) => {
					const isSelected = idx === selectedIndex
					return (
						<button
							key={item.path}
							type="button"
							data-file-index={idx}
							onClick={() => onSelect(item.path)}
							onMouseEnter={() => setSelectedIndex(idx)}
							title={item.path}
							style={{
								display: "flex",
								width: "100%",
								padding: "6px 10px",
								textAlign: "left",
								cursor: "pointer",
								borderRadius: 8,
								background: isSelected ? "var(--bg-hover)" : "transparent",
								fontSize: 13,
								gap: 8,
								alignItems: "center",
								border: "none",
								outline: "none",
								transition: "background-color 0.1s",
							}}
						>
							<RepoFileIcon name={item.name} size={16} />
							<div
								style={{
									display: "flex",
									alignItems: "baseline",
									gap: 6,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flex: 1,
								}}
							>
								<HighlightedFileName name={item.name} query={filter} />
								{item.dir && (
									<span
										style={{
											color: "var(--dim)",
											fontSize: 12,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{item.dir}
									</span>
								)}
							</div>
							{item.isRecentlyOpened && idx === 0 && (
								<span
									style={{
										marginLeft: "auto",
										fontSize: 10,
										fontWeight: 600,
										color: "var(--dim)",
										letterSpacing: "0.5px",
										textTransform: "uppercase",
										flexShrink: 0,
									}}
								>
									RECENTLY OPENED
								</span>
							)}
						</button>
					)
				})}
			</div>
		),
	}
}

/**
 * Pill badge for an attached file in the composer with hover path tooltip.
 */
export function FileAttachmentBadge({
	file,
	projectRootPath,
	onRemove,
}: {
	file: AttachedFile
	projectRootPath?: string | null
	onRemove: () => void
}) {
	const [isHovered, setIsHovered] = useState(false)

	const fullPath = useMemo(() => {
		if (file.path && file.path.startsWith("/")) return file.path
		const rel = file.relativePath || file.name
		if (projectRootPath) {
			return `${projectRootPath.replace(/\/+$/, "")}/${rel.replace(/^\/+/, "")}`
		}
		return rel
	}, [file.path, file.relativePath, file.name, projectRootPath])

	return (
		<div
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				position: "relative",
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: 24,
				padding: "0 8px",
				background: "var(--bg-elevated)",
				border: "1px solid var(--border-muted)",
				borderRadius: 6,
				fontSize: 13,
				color: "var(--text)",
				userSelect: "none",
				flexShrink: 0,
			}}
		>
			<RepoFileIcon name={file.name} size={14} />
			<span style={{ fontWeight: 500, lineHeight: 1 }}>{file.name}</span>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation()
					onRemove()
				}}
				title="Remove attachment"
				style={{
					background: "transparent",
					border: "none",
					color: "var(--dim)",
					fontSize: 13,
					lineHeight: 1,
					cursor: "pointer",
					padding: 0,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					marginLeft: 2,
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.color = "var(--text)"
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.color = "var(--dim)"
				}}
			>
				&times;
			</button>

			{/* Floating Tooltip showing full path */}
			{isHovered && (
				<div
					style={{
						position: "absolute",
						bottom: "calc(100% + 6px)",
						left: "50%",
						transform: "translateX(-50%)",
						background: "var(--bg)",
						color: "var(--text)",
						border: "1px solid var(--border)",
						borderRadius: 10,
						boxShadow: "var(--shadow-popover)",
						padding: "6px 12px",
						fontSize: 12,
						fontFamily: "inherit",
						whiteSpace: "nowrap",
						pointerEvents: "none",
						zIndex: 100,
						maxWidth: "80vw",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{fullPath}
				</div>
			)}
		</div>
	)
}
