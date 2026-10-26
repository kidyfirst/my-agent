import { useEffect, useRef } from "react"

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
		window.addEventListener("mousedown", handleClickOutside)
		window.addEventListener("keydown", handleKeyDown)
		return () => {
			window.removeEventListener("mousedown", handleClickOutside)
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [onClose])

	// Ensure menu stays within window boundaries
	const adjustedX = Math.max(10, Math.min(x, window.innerWidth - 180))
	const adjustedY = Math.max(10, Math.min(y, window.innerHeight - (items.length * 36 + 20)))

	return (
		<div
			ref={menuRef}
			style={{
				position: "fixed",
				left: adjustedX,
				top: adjustedY,
				background: "var(--bg-elevated)",
				border: "1px solid var(--border)",
				borderRadius: 6,
				padding: 4,
				zIndex: 1000,
				minWidth: 140,
				boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
			}}
			onClick={(e) => e.stopPropagation()}
		>
			{items.map((item, index) => (
				<button
					key={index}
					onClick={(e) => {
						e.stopPropagation()
						item.onClick()
						onClose()
					}}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						width: "100%",
						padding: "6px 10px",
						background: "transparent",
						color: item.danger ? "var(--error)" : "var(--text)",
						border: "none",
						borderRadius: 4,
						fontSize: 12,
						cursor: "pointer",
						textAlign: "left",
						transition: "background 0.1s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--bg-hover)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent"
					}}
				>
					{item.icon && (
						<span style={{ display: "flex", alignItems: "center", fontSize: 13, flexShrink: 0 }}>
							{item.icon}
						</span>
					)}
					<span style={{ flex: 1, whiteSpace: "nowrap" }}>{item.label}</span>
				</button>
			))}
		</div>
	)
}
