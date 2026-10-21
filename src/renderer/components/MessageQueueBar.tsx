import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import type { QueuedMessage } from "../types/chat"

export interface MessageQueueBarProps {
	queue: QueuedMessage[]
	isAgentActive: boolean
	isQueuePaused?: boolean
	onResumeQueue?: () => void
	onSteerQueued: (item: QueuedMessage) => void
	onDeleteQueued: (id: string) => void
	onEditQueued: (item: QueuedMessage) => void
	onReorderQueue: (newQueue: QueuedMessage[]) => void
	onClearQueue: () => void
}

export function MessageQueueBar({
	queue,
	isAgentActive,
	isQueuePaused,
	onResumeQueue,
	onSteerQueued,
	onDeleteQueued,
	onEditQueued,
	onReorderQueue,
	onClearQueue,
}: MessageQueueBarProps) {
	const [openMenuId, setOpenMenuId] = useState<string | null>(null)
	const [menuAnchor, setMenuAnchor] = useState<{
		top: number
		right: number
	} | null>(null)
	const menuRef = useRef<HTMLDivElement | null>(null)

	// Close menu when clicking outside
	useEffect(() => {
		if (!openMenuId) return
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null
			if (target?.closest("[data-queue-menu-button]")) return
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setOpenMenuId(null)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [openMenuId])

	if (!queue || queue.length === 0) return null

	const moveUp = (index: number) => {
		if (index <= 0) return
		const newQueue = [...queue]
		const temp = newQueue[index - 1]
		newQueue[index - 1] = newQueue[index]
		newQueue[index] = temp
		onReorderQueue(newQueue)
	}

	const moveDown = (index: number) => {
		if (index >= queue.length - 1) return
		const newQueue = [...queue]
		const temp = newQueue[index + 1]
		newQueue[index + 1] = newQueue[index]
		newQueue[index] = temp
		onReorderQueue(newQueue)
	}

	const moveToTop = (index: number) => {
		if (index <= 0) return
		const item = queue[index]
		const remaining = queue.filter((_, i) => i !== index)
		onReorderQueue([item, ...remaining])
		setOpenMenuId(null)
	}

	return (
		<div
			style={{
				marginBottom: 8,
				background: "var(--bg-elevated)",
				border: "1px solid var(--border)",
				borderRadius: 8,
				padding: "6px 10px",
				boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
				display: "flex",
				flexDirection: "column",
				gap: 4,
			}}
		>
			{/* Top Bar Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					paddingBottom: 4,
					borderBottom: "1px solid var(--border-muted)",
					fontSize: 11,
					color: "var(--muted)",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<span style={{ fontWeight: 600, color: "var(--text)" }}>
						Queued ({queue.length})
					</span>
					{isQueuePaused ? (
						<span
							style={{
								fontSize: 10,
								color: "var(--warning)",
								background: "rgba(234, 179, 8, 0.12)",
								padding: "1px 6px",
								borderRadius: 4,
								display: "flex",
								alignItems: "center",
								gap: 4,
							}}
						>
							⏸ Paused
							{onResumeQueue && (
								<button
									onClick={onResumeQueue}
									style={{
										background: "transparent",
										border: "none",
										color: "var(--accent)",
										cursor: "pointer",
										fontWeight: 600,
										padding: "0 2px",
										textDecoration: "underline",
									}}
								>
									Resume
								</button>
							)}
						</span>
					) : isAgentActive ? (
						<span
							style={{
								fontSize: 10,
								color: "var(--accent)",
								background: "rgba(59, 130, 246, 0.12)",
								padding: "1px 6px",
								borderRadius: 4,
							}}
						>
							Running · Will execute next
						</span>
					) : (
						<span
							style={{
								fontSize: 10,
								color: "var(--dim)",
								background: "rgba(255, 255, 255, 0.05)",
								padding: "1px 6px",
								borderRadius: 4,
							}}
						>
							Ready · Will execute when idle
						</span>
					)}
				</div>

				<button
					onClick={onClearQueue}
					title="Clear all queued messages"
					style={{
						background: "transparent",
						border: "none",
						color: "var(--dim)",
						cursor: "pointer",
						fontSize: 10,
						padding: "1px 4px",
						borderRadius: 3,
						transition: "color 0.15s",
					}}
					onMouseEnter={(e) => (e.currentTarget.style.color = "var(--error)")}
					onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
				>
					Clear all
				</button>
			</div>

			{/* Queue Items List */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 4,
					maxHeight: 180,
					overflowY: "auto",
				}}
			>
				{queue.map((item, index) => (
					<div
						key={item.id}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8,
							padding: "4px 8px",
							background: "var(--bg-surface)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							fontSize: 12,
						}}
					>
						{/* Left: Reorder handles + Index + Content preview */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								minWidth: 0,
								flex: 1,
							}}
						>
							{/* Reorder Buttons */}
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 1,
									flexShrink: 0,
								}}
							>
								<button
									disabled={index === 0}
									onClick={() => moveUp(index)}
									title="Move up"
									style={{
										background: "transparent",
										border: "none",
										color: index === 0 ? "var(--border)" : "var(--muted)",
										cursor: index === 0 ? "default" : "pointer",
										fontSize: 9,
										padding: 0,
										lineHeight: 1,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									▲
								</button>
								<button
									disabled={index === queue.length - 1}
									onClick={() => moveDown(index)}
									title="Move down"
									style={{
										background: "transparent",
										border: "none",
										color:
											index === queue.length - 1
												? "var(--border)"
												: "var(--muted)",
										cursor: index === queue.length - 1 ? "default" : "pointer",
										fontSize: 9,
										padding: 0,
										lineHeight: 1,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									▼
								</button>
							</div>

							{/* Index pill */}
							<span
								style={{
									fontSize: 10,
									fontWeight: 600,
									color: "var(--dim)",
									flexShrink: 0,
								}}
							>
								#{index + 1}
							</span>

							{/* Content preview */}
							<span
								title={item.content}
								style={{
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
									color: "var(--text)",
									fontSize: 12,
									flex: 1,
									minWidth: 0,
								}}
							>
								{item.content || "(Empty)"}
							</span>

							{/* Attachment tag */}
							{item.files && item.files.length > 0 && (
								<span
									style={{
										fontSize: 10,
										color: "var(--muted)",
										background: "rgba(255, 255, 255, 0.06)",
										padding: "1px 5px",
										borderRadius: 4,
										flexShrink: 0,
									}}
								>
									📎 {item.files.length}
								</span>
							)}
						</div>

						{/* Right: Actions */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								flexShrink: 0,
							}}
						>
							{/* Steer / BTW Button */}
							<button
								onClick={() => onSteerQueued(item)}
								title="Steer (By the way): Inject guidance into the agent immediately without waiting for the task to finish"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 3,
									padding: "2px 7px",
									background: "rgba(59, 130, 246, 0.12)",
									color: "var(--accent)",
									border: "1px solid rgba(59, 130, 246, 0.3)",
									borderRadius: 4,
									fontSize: 11,
									fontWeight: 500,
									cursor: "pointer",
									transition: "all 0.15s",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = "var(--accent)"
									e.currentTarget.style.color = "#fff"
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "rgba(59, 130, 246, 0.12)"
									e.currentTarget.style.color = "var(--accent)"
								}}
							>
								<span>↳</span>
								<span>Steer</span>
							</button>

							{/* Delete Button */}
							<button
								onClick={() => onDeleteQueued(item.id)}
								title="Remove from queue"
								style={{
									background: "transparent",
									border: "none",
									color: "var(--muted)",
									cursor: "pointer",
									fontSize: 12,
									padding: "2px 5px",
									borderRadius: 4,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									transition: "color 0.15s",
								}}
								onMouseEnter={(e) =>
									(e.currentTarget.style.color = "var(--error)")
								}
								onMouseLeave={(e) =>
									(e.currentTarget.style.color = "var(--muted)")
								}
							>
								🗑
							</button>

							{/* More (···) Button */}
							<button
								data-queue-menu-button="true"
								onClick={(e) => {
									e.stopPropagation()
									if (openMenuId === item.id) {
										setOpenMenuId(null)
										return
									}
									const rect = e.currentTarget.getBoundingClientRect()
									setMenuAnchor({
										top: rect.top - 4,
										right: window.innerWidth - rect.right,
									})
									setOpenMenuId(item.id)
								}}
								title="More options"
								style={{
									background:
										openMenuId === item.id
											? "rgba(255, 255, 255, 0.08)"
											: "transparent",
									border: "none",
									color: "var(--muted)",
									cursor: "pointer",
									fontSize: 13,
									padding: "1px 5px",
									borderRadius: 4,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									transition: "color 0.15s",
								}}
								onMouseEnter={(e) =>
									(e.currentTarget.style.color = "var(--text)")
								}
								onMouseLeave={(e) => {
									if (openMenuId !== item.id) {
										e.currentTarget.style.color = "var(--muted)"
									}
								}}
							>
								···
							</button>

							{/* Dropdown Menu — portaled so it never affects the bar's layout or gets clipped */}
							{openMenuId === item.id &&
								menuAnchor &&
								createPortal(
									<div
										ref={menuRef}
										style={{
											position: "fixed",
											top: menuAnchor.top,
											right: menuAnchor.right,
											transform: "translateY(-100%)",
											background: "var(--bg-elevated)",
											border: "1px solid var(--border)",
											borderRadius: 6,
											padding: "4px 0",
											minWidth: 150,
											boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
											zIndex: 2000,
											display: "flex",
											flexDirection: "column",
										}}
									>
										<button
											onClick={() => {
												onEditQueued(item)
												setOpenMenuId(null)
											}}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												padding: "5px 10px",
												background: "transparent",
												border: "none",
												color: "var(--text)",
												fontSize: 11,
												cursor: "pointer",
												textAlign: "left",
												width: "100%",
											}}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background =
													"var(--selected-bg)")
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background = "transparent")
											}
										>
											<span>✏️</span>
											<span>Edit & Retrieve</span>
										</button>

										{index > 0 && (
											<button
												onClick={() => moveToTop(index)}
												style={{
													display: "flex",
													alignItems: "center",
													gap: 6,
													padding: "5px 10px",
													background: "transparent",
													border: "none",
													color: "var(--text)",
													fontSize: 11,
													cursor: "pointer",
													textAlign: "left",
													width: "100%",
												}}
												onMouseEnter={(e) =>
													(e.currentTarget.style.background =
														"var(--selected-bg)")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.background = "transparent")
												}
											>
												<span>⬆️</span>
												<span>Move to top</span>
											</button>
										)}

										<button
											onClick={() => {
												onDeleteQueued(item.id)
												setOpenMenuId(null)
											}}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												padding: "5px 10px",
												background: "transparent",
												border: "none",
												color: "var(--error)",
												fontSize: 11,
												cursor: "pointer",
												textAlign: "left",
												width: "100%",
											}}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background =
													"var(--selected-bg)")
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background = "transparent")
											}
										>
											<span>🗑️</span>
											<span>Delete</span>
										</button>
									</div>,
									document.body,
								)}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
