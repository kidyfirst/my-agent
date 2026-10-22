import { useState } from "react"
import type { QueuedMessage } from "../types/chat"

export interface MessageQueueBarProps {
	queue: QueuedMessage[]
	isAgentActive: boolean
	isQueuePaused?: boolean
	onResumeQueue?: () => void
	onSteerQueued: (item: QueuedMessage) => void
	onDeleteQueued: (id: string) => void
	onEditQueued: (item: QueuedMessage) => void
	onReorderQueue?: (newQueue: QueuedMessage[]) => void
	onClearQueue?: () => void
}

export function MessageQueueBar({
	queue,
	isQueuePaused,
	onResumeQueue,
	onSteerQueued,
	onDeleteQueued,
	onEditQueued,
}: MessageQueueBarProps) {
	const [isCollapsed, setIsCollapsed] = useState(false)

	if (!queue || queue.length === 0) return null

	return (
		<div
			style={{
				marginBottom: 8,
				background: "var(--bg)",
				border: "1px solid var(--border)",
				borderRadius: 16,
				padding: isCollapsed ? "10px 16px" : "12px 16px",
				boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
				display: "flex",
				flexDirection: "column",
				gap: 8,
				transition: "padding 0.15s ease",
			}}
		>
			{/* Top Bar Header */}
			<div
				onClick={() => setIsCollapsed(!isCollapsed)}
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					cursor: "pointer",
					userSelect: "none",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						minWidth: 0,
						flex: 1,
					}}
				>
					<span
						style={{
							fontWeight: 600,
							fontSize: 13,
							color: "var(--text)",
							flexShrink: 0,
						}}
					>
						Queued Messages
					</span>
					<span
						style={{
							fontSize: 11,
							fontWeight: 600,
							color: "var(--dim)",
							background: "var(--border-muted, #e5e7eb)",
							padding: "1px 6px",
							borderRadius: 10,
							minWidth: 16,
							textAlign: "center",
							flexShrink: 0,
						}}
					>
						{queue.length}
					</span>
					<span
						style={{
							fontSize: 12,
							color: "var(--dim)",
							fontWeight: 400,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						Sends after agent finishes working
					</span>
					{isQueuePaused && (
						<span
							style={{
								fontSize: 11,
								color: "var(--warning)",
								background: "rgba(234, 179, 8, 0.12)",
								padding: "1px 6px",
								borderRadius: 4,
								display: "flex",
								alignItems: "center",
								gap: 4,
								flexShrink: 0,
							}}
							onClick={(e) => {
								e.stopPropagation()
								if (onResumeQueue) onResumeQueue()
							}}
						>
							⏸ Paused · Click to resume
						</span>
					)}
				</div>

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						setIsCollapsed(!isCollapsed)
					}}
					title={isCollapsed ? "Expand queued messages" : "Collapse queued messages"}
					aria-label={isCollapsed ? "Expand queued messages" : "Collapse queued messages"}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--dim)",
						cursor: "pointer",
						padding: "2px 4px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 4,
						transition: "color 0.15s",
						flexShrink: 0,
					}}
					onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
					onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
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
						style={{
							transition: "transform 0.2s ease",
							transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
						}}
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
			</div>

			{/* Queue Items List */}
			{!isCollapsed && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 6,
						maxHeight: 220,
						overflowY: "auto",
					}}
				>
					{queue.map((item) => (
						<div
							key={item.id}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: 12,
								padding: "3px 0",
								fontSize: 13,
								lineHeight: 1.4,
							}}
						>
							{/* Left: Thumbnail preview (if attached files exist) + Message text */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									minWidth: 0,
									flex: 1,
								}}
							>
								{item.files && item.files.length > 0 && (
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 4,
											flexShrink: 0,
										}}
									>
										{item.files.map((file, idx) => {
											const isImg = file.type === "image" || Boolean(file.preview)
											return isImg ? (
												<img
													key={idx}
													src={file.preview || file.data}
													alt={file.name}
													style={{
														width: 22,
														height: 22,
														objectFit: "cover",
														borderRadius: 4,
														border: "1px solid var(--border-muted)",
														flexShrink: 0,
													}}
												/>
											) : (
												<div
													key={idx}
													title={file.name}
													style={{
														width: 22,
														height: 22,
														borderRadius: 4,
														border: "1px solid var(--border-muted)",
														background: "var(--bg-surface)",
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														fontSize: 11,
														flexShrink: 0,
													}}
												>
													📄
												</div>
											)
										})}
									</div>
								)}

								{/* Message content */}
								<span
									title={item.content}
									style={{
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
										color: "var(--text)",
										fontSize: 13,
										flex: 1,
										minWidth: 0,
									}}
								>
									{item.content || "(Attachment)"}
								</span>
							</div>

							{/* Right: 3 Action buttons (Steer [→], Edit [✎], Delete [🗑]) */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									flexShrink: 0,
								}}
							>
								{/* Steer / Send Now Button */}
								<button
									type="button"
									onClick={() => onSteerQueued(item)}
									title="Send now"
									aria-label="Send now"
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										width: 26,
										height: 26,
										borderRadius: 6,
										border: "none",
										background: "transparent",
										color: "var(--dim)",
										cursor: "pointer",
										transition: "all 0.15s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											"var(--bg-hover, rgba(0, 0, 0, 0.05))"
										e.currentTarget.style.color = "var(--text)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = "var(--dim)"
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
										<line x1="5" y1="12" x2="19" y2="12" />
										<polyline points="12 5 19 12 12 19" />
									</svg>
								</button>

								{/* Edit Button */}
								<button
									type="button"
									onClick={() => onEditQueued(item)}
									title="Edit message"
									aria-label="Edit message"
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										width: 26,
										height: 26,
										borderRadius: 6,
										border: "none",
										background: "transparent",
										color: "var(--dim)",
										cursor: "pointer",
										transition: "all 0.15s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											"var(--bg-hover, rgba(0, 0, 0, 0.05))"
										e.currentTarget.style.color = "var(--text)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = "var(--dim)"
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
										<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
									</svg>
								</button>

								{/* Delete Button */}
								<button
									type="button"
									onClick={() => onDeleteQueued(item.id)}
									title="Delete message"
									aria-label="Delete message"
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										width: 26,
										height: 26,
										borderRadius: 6,
										border: "none",
										background: "transparent",
										color: "var(--dim)",
										cursor: "pointer",
										transition: "all 0.15s",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)"
										e.currentTarget.style.color = "#ef4444"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = "var(--dim)"
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
										<polyline points="3 6 5 6 21 6" />
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										<line x1="10" y1="11" x2="10" y2="17" />
										<line x1="14" y1="11" x2="14" y2="17" />
									</svg>
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
