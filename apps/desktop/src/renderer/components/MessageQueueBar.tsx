import { useState } from "react"
import type { QueuedMessage } from "../types/chat"
import { ChevronDownIcon, ArrowRightIcon, EditIcon, TrashIcon } from "./icons"

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
				boxShadow: "var(--shadow-sm)",
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
							background: "var(--border-muted)",
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
								background:
									"color-mix(in srgb, var(--warning) 12%, transparent)",
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
					title={
						isCollapsed ? "Expand queued messages" : "Collapse queued messages"
					}
					aria-label={
						isCollapsed ? "Expand queued messages" : "Collapse queued messages"
					}
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
					<ChevronDownIcon
						size={14}
						strokeWidth={2}
						style={{
							transition: "transform 0.2s ease",
							transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
						}}
					/>
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
											const isImg =
												file.type === "image" || Boolean(file.preview)
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
										e.currentTarget.style.backgroundColor = "var(--bg-hover)"
										e.currentTarget.style.color = "var(--text)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = "var(--dim)"
									}}
								>
									<ArrowRightIcon size={14} strokeWidth={2} />
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
										e.currentTarget.style.backgroundColor = "var(--bg-hover)"
										e.currentTarget.style.color = "var(--text)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = "var(--dim)"
									}}
								>
									<EditIcon size={14} strokeWidth={2} />
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
										e.currentTarget.style.backgroundColor =
											"color-mix(in srgb, var(--error) 10%, transparent)"
										e.currentTarget.style.color = "var(--error)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "transparent"
										e.currentTarget.style.color = "var(--dim)"
									}}
								>
									<TrashIcon size={14} strokeWidth={2} />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
