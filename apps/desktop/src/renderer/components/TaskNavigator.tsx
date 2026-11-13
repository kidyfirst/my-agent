import React, { useState, useRef, useEffect, useCallback } from "react"

export interface TaskItem {
	id: string
	turnKey: string
	text: string
	index: number
}

export interface TaskNavigatorProps {
	tasks: TaskItem[]
	activeTaskId: string | null
	onSelectTask: (taskId: string) => void
	minContainerWidth?: number
}

/**
 * TaskNavigator — floating vertical task timeline on the right side of the chat.
 * Bounded between the top sticky header and just above the input box.
 * Collapsed:
 *   - No background, no border, pure floating ticks.
 *   - When few tasks: vertically centered in the rail.
 *   - When many tasks: scrolls with transparent gradient fade on top and/or bottom.
 * Hovered:
 *   - Smoothly expands to a glassmorphism floating card with task titles and jump navigation.
 */
export function TaskNavigator({
	tasks,
	activeTaskId,
	onSelectTask,
	minContainerWidth = 680,
}: TaskNavigatorProps) {
	const [isHovered, setIsHovered] = useState(false)
	const [containerWidth, setContainerWidth] = useState<number>(() =>
		typeof window !== "undefined" ? window.innerWidth : 1200,
	)
	const [hasOverflow, setHasOverflow] = useState(false)
	const [showTopFade, setShowTopFade] = useState(false)
	const [showBottomFade, setShowBottomFade] = useState(false)

	const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const navRef = useRef<HTMLElement | null>(null)
	const listRef = useRef<HTMLDivElement | null>(null)

	// Measure parent container width to automatically hide when there is no space on the right
	useEffect(() => {
		const target =
			navRef.current?.parentElement ||
			(typeof document !== "undefined" ? document.body : null)
		if (!target || typeof ResizeObserver === "undefined") return

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerWidth(entry.contentRect.width)
			}
		})
		ro.observe(target)
		return () => ro.disconnect()
	}, [])

	// Update top and bottom fade indicators based on scroll position and content overflow
	const updateFades = useCallback(() => {
		const el = listRef.current
		if (!el) return
		const overflow = el.scrollHeight > el.clientHeight + 2
		setHasOverflow(overflow)
		if (!overflow) {
			setShowTopFade(false)
			setShowBottomFade(false)
			return
		}
		setShowTopFade(el.scrollTop > 3)
		setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 3)
	}, [])

	// Observe size changes of listRef to update fade states
	useEffect(() => {
		const el = listRef.current
		if (!el || typeof ResizeObserver === "undefined") return
		const ro = new ResizeObserver(() => {
			updateFades()
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [updateFades])

	// Expanding the card changes its width, padding and available height. The
	// browser can report the previous overflow state for one frame, which makes
	// the collapsed rail use `flex-start` and leaves the whole tick group too
	// high. Re-measure after the transition has committed, then recenter.
	useEffect(() => {
		let firstFrame = 0
		let secondFrame = 0
		firstFrame = requestAnimationFrame(() => {
			updateFades()
			secondFrame = requestAnimationFrame(() => {
				updateFades()
				if (!isHovered) centerActiveTask()
			})
		})
		return () => {
			cancelAnimationFrame(firstFrame)
			if (secondFrame) cancelAnimationFrame(secondFrame)
		}
	}, [isHovered, updateFades])

	const effectiveActiveId = activeTaskId || tasks?.[tasks.length - 1]?.id

	// Auto-scroll the task list to keep active task in view
	useEffect(() => {
		if (listRef.current) {
			const activeEl = listRef.current.querySelector<HTMLElement>(
				`[data-task-active="true"]`,
			)
			if (activeEl) {
				if (isHovered) {
					activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" })
				} else {
					centerActiveTask()
				}
				if (!isHovered) {
					// The collapsed rail has a different height/padding. Re-apply the
					// centering after its layout has settled so hover cannot change the
					// resting position permanently.
					requestAnimationFrame(() => {
						const current = listRef.current?.querySelector<HTMLElement>(
							`[data-task-active="true"]`,
						)
						centerActiveTask()
					})
				}
			}
			updateFades()
		}
	}, [effectiveActiveId, isHovered, updateFades])

	function centerActiveTask() {
		const list = listRef.current
		const active = list?.querySelector<HTMLElement>(
			`[data-task-active="true"]`,
		)
		if (!list || !active) return
		// scrollIntoView is unreliable while the card is transitioning between
		// expanded and collapsed flex layouts. Calculate the target explicitly.
		const target = active.offsetTop - (list.clientHeight - active.offsetHeight) / 2
		list.scrollTop = Math.max(0, Math.min(target, list.scrollHeight - list.clientHeight))
	}

	const handleMouseEnter = () => {
		if (hoverTimeoutRef.current) {
			clearTimeout(hoverTimeoutRef.current)
			hoverTimeoutRef.current = null
		}
		setIsHovered(true)
	}

	const handleMouseLeave = () => {
		if (hoverTimeoutRef.current) {
			clearTimeout(hoverTimeoutRef.current)
		}
		hoverTimeoutRef.current = setTimeout(() => {
			setIsHovered(false)
		}, 180)
	}

	// Don't show navigation if there are fewer than 2 tasks
	if (!tasks || tasks.length < 2) {
		return null
	}

	// Don't show if window/container is too narrow to have empty gutter beside 800px content
	if (containerWidth < minContainerWidth) {
		return null
	}

	// Calculate mask gradient for top and bottom transparent fades
	let maskImage: string | undefined
	if (hasOverflow) {
		if (showTopFade && showBottomFade) {
			maskImage =
				"linear-gradient(to bottom, transparent 0px, black 28px, black calc(100% - 28px), transparent 100%)"
		} else if (showTopFade) {
			maskImage =
				"linear-gradient(to bottom, transparent 0px, black 28px, black 100%)"
		} else if (showBottomFade) {
			maskImage =
				"linear-gradient(to bottom, black 0px, black calc(100% - 28px), transparent 100%)"
		}
	}

	return (
		<nav
			ref={navRef}
			aria-label="Conversation task timeline"
			className="task-navigator-rail"
			style={{
				position: "absolute",
				right: 12,
				top: 56, // strictly below sticky turn header / top bar
				bottom: 24, // strictly above input box and mascot
				zIndex: 35,
				pointerEvents: "none",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center", // centers the bar/card vertically when content is short
				alignItems: "flex-end",
				background: "transparent",
				border: "none",
			}}
		>
			<style>{`
				@media (max-width: 680px) {
					.task-navigator-rail {
						display: none !important;
					}
				}
				.task-navigator-list::-webkit-scrollbar {
					width: ${isHovered ? "4px" : "0px"};
					display: ${isHovered ? "block" : "none"};
				}
			`}</style>
			<div
				className="task-navigator-card"
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				style={{
					pointerEvents: "auto",
					position: "relative",
					width: isHovered ? 340 : 22,
					maxHeight: "100%",
					height: hasOverflow ? "100%" : "auto",
					display: "flex",
					flexDirection: "column",
					background: isHovered
						? "color-mix(in srgb, var(--bg) 95%, var(--bg-surface))"
						: "transparent",
					backdropFilter: isHovered ? "blur(20px)" : "none",
					WebkitBackdropFilter: isHovered ? "blur(20px)" : "none",
					border: isHovered
						? "1px solid color-mix(in srgb, var(--border) 80%, transparent)"
						: "none",
					borderRadius: isHovered ? 18 : 11,
					boxShadow: isHovered ? "var(--shadow-popover)" : "none",
					transition:
						"width 0.26s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease, box-shadow 0.24s ease, border-color 0.2s ease",
					transformOrigin: "right center",
					overflow: "hidden",
					userSelect: "none",
				}}
			>
				<div
					ref={listRef}
					className="task-navigator-list"
					onScroll={updateFades}
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						height: "100%",
						maxHeight: "100%",
						padding: isHovered ? "12px 6px 12px 14px" : "6px 0",
						overflowY: "auto",
						overflowX: "hidden",
						scrollbarWidth: isHovered ? "thin" : "none",
						scrollbarColor: isHovered
							? "color-mix(in srgb, var(--text) 20%, transparent) transparent"
							: "transparent transparent",
						gap: isHovered ? 2 : 0,
						justifyContent: hasOverflow ? "flex-start" : "center",
						alignItems: isHovered ? "stretch" : "center",
						width: "100%",
						boxSizing: "border-box",
						maskImage,
						WebkitMaskImage: maskImage,
					}}
				>
					{tasks.map((task, idx) => {
						const isActive = task.id === effectiveActiveId

						return (
							<div
								key={task.id || task.turnKey || idx}
								data-task-id={task.id}
								data-task-active={isActive ? "true" : "false"}
								onClick={(e) => {
									e.stopPropagation()
									onSelectTask(task.id)
								}}
								title={task.text}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: isHovered ? "space-between" : "center",
									height: isHovered ? 30 : 20,
									flexShrink: 0,
									padding: isHovered ? "0 6px 0 10px" : "0",
									borderRadius: isHovered ? 8 : 4,
									cursor: "pointer",
									background:
										isHovered && isActive
											? "color-mix(in srgb, var(--text) 6%, transparent)"
											: "transparent",
									transition:
										"height 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.12s ease, padding 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
									width: "100%",
									boxSizing: "border-box",
								}}
								onMouseEnter={(e) => {
									if (isHovered) {
										e.currentTarget.style.backgroundColor = isActive
											? "color-mix(in srgb, var(--text) 10%, transparent)"
											: "var(--bg-hover)"
									}
								}}
								onMouseLeave={(e) => {
									if (isHovered) {
										e.currentTarget.style.backgroundColor = isActive
											? "color-mix(in srgb, var(--text) 6%, transparent)"
											: "transparent"
									}
								}}
							>
								{/* Task title label with smooth fade and slide transition */}
								<span
									style={{
										flex: 1,
										fontSize: 12.5,
										color: isActive
											? "var(--text)"
											: "color-mix(in srgb, var(--text) 60%, transparent)",
										fontWeight: isActive ? 600 : 400,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
										textAlign: "right",
										marginRight: 10,
										letterSpacing: "-0.01em",
										opacity: isHovered ? 1 : 0,
										transform: isHovered
											? "translateX(0)"
											: "translateX(10px)",
										pointerEvents: isHovered ? "auto" : "none",
										transition: isHovered
											? "opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1) 0.04s, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1) 0.04s, color 0.12s ease"
											: "opacity 0.12s ease, transform 0.12s ease",
									}}
								>
									{task.text}
								</span>

								{/* Tick Dash */}
								<span
									aria-hidden="true"
									style={{
										display: "inline-block",
										flexShrink: 0,
										width: isActive ? 14 : 10,
										height: isActive ? 2.5 : 2,
										borderRadius: 1,
										backgroundColor: isActive
											? "var(--text)"
											: "color-mix(in srgb, var(--text) 32%, transparent)",
										transition:
											"background-color 0.15s ease, width 0.15s ease, height 0.15s ease",
									}}
								/>
							</div>
						)
					})}
				</div>
			</div>
		</nav>
	)
}
