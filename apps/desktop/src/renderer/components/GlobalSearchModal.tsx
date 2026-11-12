import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ThreadInfo } from "../types/ipc"
import type { EnrichedProject } from "../types/project-list"
import { formatRelativeTime } from "../utils/relativeTime"

export interface SearchItem {
	kind: "project" | "thread"
	id: string
	/** Row label — project name or session title. */
	title: string
	/** Secondary label shown next to the folder glyph. */
	context: string
	/** Right-aligned detail: branch for projects, relative time for sessions. */
	meta?: string
	/** Payload handed back to the caller on selection. */
	value: string
}

export interface BuildSearchItemsInput {
	projects: EnrichedProject[]
	threads: ThreadInfo[]
	/** Name of the project the loaded `threads` belong to. */
	activeProjectName: string
	now?: number
}

/**
 * Sessions first (they are what people jump to), then projects. Sessions keep
 * the order they arrive in, projects follow recency.
 */
export function buildSearchItems({
	projects,
	threads,
	activeProjectName,
	now,
}: BuildSearchItemsInput): SearchItem[] {
	const sessionItems: SearchItem[] = threads.map((thread) => ({
		kind: "thread",
		id: `thread:${thread.id}`,
		title: thread.title || "New session",
		context: activeProjectName,
		meta: formatRelativeTime(thread.updatedAt || thread.createdAt, now),
		value: thread.id,
	}))

	const projectItems: SearchItem[] = [...projects]
		.sort((a, b) => (b.lastOpened || "").localeCompare(a.lastOpened || ""))
		.map((project) => ({
			kind: "project",
			id: `project:${project.rootPath}`,
			title: project.name,
			context: project.gitBranch || "Folder",
			meta: "",
			value: project.rootPath,
		}))

	return [...sessionItems, ...projectItems]
}

/** Case-insensitive match on the title and on the secondary label. */
export function filterSearchItems(
	items: SearchItem[],
	query: string,
): SearchItem[] {
	const q = query.trim().toLowerCase()
	if (!q) return items
	return items.filter(
		(item) =>
			item.title.toLowerCase().includes(q) ||
			item.context.toLowerCase().includes(q),
	)
}

function FolderGlyph() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0 }}
			aria-hidden="true"
		>
			<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2a1.5 1.5 0 0 1 1.2.6l1 1.4h9.6A1.5 1.5 0 0 1 22 9.5v8A1.5 1.5 0 0 1 20.5 19h-16A1.5 1.5 0 0 1 3 17.5z" />
		</svg>
	)
}

interface GlobalSearchModalProps {
	projects: EnrichedProject[]
	threads: ThreadInfo[]
	activeProjectName: string
	onClose: () => void
	onSelectProject: (path: string) => void
	onSelectThread: (threadId: string) => void
}

/**
 * Jump-to dialog opened from the sidebar search button: finds a project or a
 * session by name and switches to it.
 */
export function GlobalSearchModal({
	projects,
	threads,
	activeProjectName,
	onClose,
	onSelectProject,
	onSelectThread,
}: GlobalSearchModalProps) {
	const [query, setQuery] = useState("")
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	const items = useMemo(
		() => buildSearchItems({ projects, threads, activeProjectName }),
		[projects, threads, activeProjectName],
	)

	const filtered = useMemo(
		() => filterSearchItems(items, query),
		[items, query],
	)

	useEffect(() => {
		setSelectedIndex(0)
	}, [query])

	useEffect(() => {
		const el = listRef.current?.querySelector(
			"[data-selected='true']",
		) as HTMLElement | null
		el?.scrollIntoView({ block: "nearest" })
	}, [selectedIndex])

	const choose = useCallback(
		(item: SearchItem | undefined) => {
			if (!item) return
			onClose()
			if (item.kind === "project") onSelectProject(item.value)
			else onSelectThread(item.value)
		},
		[onClose, onSelectProject, onSelectThread],
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault()
				setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1))
			} else if (e.key === "ArrowUp") {
				e.preventDefault()
				setSelectedIndex((i) =>
					i <= 0 ? Math.max(filtered.length - 1, 0) : i - 1,
				)
			} else if (e.key === "Enter") {
				e.preventDefault()
				choose(filtered[selectedIndex])
			} else if (e.key === "Escape") {
				e.preventDefault()
				onClose()
			}
		},
		[filtered, selectedIndex, choose, onClose],
	)

	// Flat index across both sections so keyboard navigation is continuous.
	let flatIndex = 0
	const sections: Array<{ label: string; kind: SearchItem["kind"] }> = [
		{ label: "Sessions", kind: "thread" },
		{ label: "Projects", kind: "project" },
	]

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--scrim-subtle)",
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				zIndex: 1100,
				paddingTop: "10vh",
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					width: 620,
					maxWidth: "92vw",
					maxHeight: "70vh",
					display: "flex",
					flexDirection: "column",
					background: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
				}}
				onKeyDown={handleKeyDown}
			>
				{/* Search field */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "14px 16px",
						borderBottom: "1px solid var(--border-muted)",
					}}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="var(--dim)"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
						style={{ flexShrink: 0 }}
					>
						<circle cx="11" cy="11" r="7" />
						<line x1="16.5" y1="16.5" x2="21" y2="21" />
					</svg>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search for projects and sessions..."
						aria-label="Search projects and sessions"
						style={{
							flex: 1,
							minWidth: 0,
							background: "transparent",
							border: "none",
							outline: "none",
							color: "var(--text)",
							fontSize: 15,
							fontFamily: "inherit",
						}}
					/>
					<span
						style={{
							fontSize: 10,
							color: "var(--muted)",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border-muted)",
							borderRadius: 4,
							padding: "2px 6px",
							flexShrink: 0,
						}}
					>
						esc
					</span>
				</div>

				{/* Results */}
				<div ref={listRef} style={{ overflowY: "auto", padding: "6px" }}>
					{filtered.length === 0 && (
						<div
							style={{
								padding: "24px 16px",
								textAlign: "center",
								color: "var(--muted)",
								fontSize: 12,
							}}
						>
							No projects or sessions found
						</div>
					)}

					{sections.map(({ label, kind }) => {
						const rows = filtered.filter((item) => item.kind === kind)
						if (rows.length === 0) return null
						return (
							<div key={kind}>
								<div
									style={{
										padding: "8px 10px 4px",
										fontSize: 10,
										fontWeight: 600,
										color: "var(--dim)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
									}}
								>
									{label}
								</div>
								{rows.map((item) => {
									const idx = flatIndex++
									const isSelected = idx === selectedIndex
									return (
										<div
											key={item.id}
											data-selected={isSelected}
											onClick={() => choose(item)}
											onMouseEnter={() => setSelectedIndex(idx)}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 10,
												padding: "9px 10px",
												borderRadius: 8,
												cursor: "pointer",
												background: isSelected
													? "var(--bg-hover)"
													: "transparent",
											}}
										>
											<span
												style={{
													fontSize: 13,
													color: "var(--text)",
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
													flexShrink: 1,
													minWidth: 0,
												}}
											>
												{item.title}
											</span>
											<span
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: 5,
													color: "var(--dim)",
													fontSize: 12,
													flexShrink: 1,
													minWidth: 0,
												}}
											>
												<FolderGlyph />
												<span
													style={{
														whiteSpace: "nowrap",
														overflow: "hidden",
														textOverflow: "ellipsis",
													}}
												>
													{item.context}
												</span>
											</span>
											{item.meta && (
												<span
													style={{
														marginLeft: "auto",
														fontSize: 11,
														color: "var(--dim)",
														fontVariantNumeric: "tabular-nums",
														flexShrink: 0,
													}}
												>
													{item.meta}
												</span>
											)}
										</div>
									)
								})}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
