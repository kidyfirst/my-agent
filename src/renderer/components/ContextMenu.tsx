import { useEffect, useId, useRef } from "react"
import { claimMenu, releaseMenu } from "../utils/menuRegistry"

export interface ContextMenuItem {
	label: string
	icon?: React.ReactNode
	danger?: boolean
	onClick: () => void
}

interface ContextMenuProps {
	x: number
	y: number
	items: ContextMenuItem[]
	onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)
	const menuId = useId()
	// Menus are reopened with a fresh `onClose` closure on every parent render;
	// the registry keeps the one it was registered with, so route through a ref.
	const closeRef = useRef(onClose)

	useEffect(() => {
		closeRef.current = onClose
	}, [onClose])

	// Only one menu may be open in the app: claiming closes the previous one,
	// which is what makes clicking a second trigger swap menus instead of
	// stacking them.
	useEffect(() => {
		claimMenu(menuId, () => closeRef.current())
		return () => releaseMenu(menuId)
	}, [menuId])

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose()
			}
		}
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
			}
		}
		// Capture phase: row triggers stop mousedown from bubbling to keep their
		// own click handling intact, and a bubbling listener would never see it.
		window.addEventListener("mousedown", handleClickOutside, true)
		window.addEventListener("keydown", handleKeyDown)
		return () => {
			window.removeEventListener("mousedown", handleClickOutside, true)
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [onClose])

	// Ensure menu stays within window boundaries
	const adjustedX = Math.max(10, Math.min(x, window.innerWidth - 180))
	const adjustedY = Math.max(
		10,
		Math.min(y, window.innerHeight - (items.length * 36 + 20)),
	)

	return (
		<div
			ref={menuRef}
			style={{
				position: "fixed",
				left: adjustedX,
				top: adjustedY,
				background: "var(--bg)",
				border: "1px solid var(--border)",
				borderRadius: 12,
				padding: 6,
				zIndex: 1000,
				minWidth: 160,
				boxShadow: "var(--shadow-popover)",
				display: "flex",
				flexDirection: "column",
				gap: 2,
			}}
			onClick={(e) => e.stopPropagation()}
		>
			{items.map((item, index) => (
				<button
					key={index}
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						item.onClick()
						onClose()
					}}
					title={item.label}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						width: "100%",
						padding: "7px 10px",
						background: "transparent",
						color: item.danger ? "var(--error)" : "var(--text)",
						border: "none",
						borderRadius: 8,
						fontSize: 12,
						cursor: "pointer",
						textAlign: "left",
						transition: "background-color 0.1s, color 0.1s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor = "var(--bg-hover)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = "transparent"
					}}
				>
					{item.icon && (
						<span
							style={{
								display: "flex",
								alignItems: "center",
								fontSize: 13,
								flexShrink: 0,
							}}
						>
							{item.icon}
						</span>
					)}
					<span
						style={{
							flex: 1,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{item.label}
					</span>
				</button>
			))}
		</div>
	)
}
