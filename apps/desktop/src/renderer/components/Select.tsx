import React, { useState, useRef, useEffect, useCallback } from "react"
import { ChevronDownIcon, CheckIcon } from "./icons"

export interface SelectOption {
	value: string
	label: string
	icon?: React.ReactNode
	description?: string
}

export interface SelectProps {
	value: string
	options: Array<{ value: string; label: string; icon?: React.ReactNode; description?: string }>
	onChange: (value: string) => void
	placeholder?: string
	disabled?: boolean
	minWidth?: number | string
	style?: React.CSSProperties
}

/**
 * Universal custom Select / Dropdown component used across the application.
 * Replaces unstylable native <select> with a consistent, theme-aware popover.
 */
export function Select({
	value,
	options,
	onChange,
	placeholder = "Select...",
	disabled = false,
	minWidth = 130,
	style,
}: SelectProps) {
	const [open, setOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Close on outside click
	useEffect(() => {
		if (!open) return
		const handler = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [open])

	// Close on Escape
	useEffect(() => {
		if (!open) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false)
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [open])

	// Automatically close if disabled
	useEffect(() => {
		if (disabled && open) {
			setOpen(false)
		}
	}, [disabled, open])

	const selectedOption = options.find((o) => o.value === value)

	const handleSelect = useCallback(
		(v: string) => {
			onChange(v)
			setOpen(false)
		},
		[onChange],
	)

	return (
		<div
			ref={containerRef}
			style={{
				position: "relative",
				display: "inline-block",
				...style,
			}}
		>
			<button
				type="button"
				onClick={() => !disabled && setOpen((prev) => !prev)}
				disabled={disabled}
				style={{
					background: "var(--bg-elevated)",
					color: "var(--text)",
					border: open ? "1px solid var(--accent)" : "1px solid var(--border)",
					borderRadius: 6,
					padding: "5px 10px",
					fontSize: 12,
					cursor: disabled ? "not-allowed" : "pointer",
					fontFamily: "inherit",
					minWidth,
					textAlign: "left",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
					transition: "border-color 0.15s ease, background-color 0.15s ease",
					opacity: disabled ? 0.5 : 1,
					userSelect: "none",
				}}
				onMouseEnter={(e) => {
					if (!disabled && !open) {
						e.currentTarget.style.borderColor = "var(--border-accent)"
					}
				}}
				onMouseLeave={(e) => {
					if (!disabled && !open) {
						e.currentTarget.style.borderColor = "var(--border)"
					}
				}}
			>
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{selectedOption?.icon}
					<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{selectedOption ? selectedOption.label : placeholder}
					</span>
				</span>

				{/* Unified SVG Chevron */}
				<ChevronDownIcon
					size={12}
					strokeWidth={2}
					style={{
						color: "var(--muted)",
						transform: open ? "rotate(180deg)" : "rotate(0deg)",
						transition: "transform 0.15s ease",
						flexShrink: 0,
					}}
				/>
			</button>

			{/* Dropdown Popover */}
			{open && !disabled && (
				<div
					style={{
						position: "absolute",
						top: "calc(100% + 4px)",
						right: 0,
						minWidth: "100%",
						maxHeight: 240,
						overflowY: "auto",
						backgroundColor: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 8,
						boxShadow: "var(--shadow-popover)",
						padding: 4,
						zIndex: 100,
						display: "flex",
						flexDirection: "column",
						gap: 1,
					}}
				>
					{options.map((opt) => {
						const isSelected = opt.value === value
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() => handleSelect(opt.value)}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 8,
									padding: "6px 10px",
									fontSize: 12,
									fontWeight: isSelected ? 600 : 400,
									color: isSelected ? "var(--accent)" : "var(--text)",
									backgroundColor: isSelected
										? "color-mix(in srgb, var(--accent) 8%, transparent)"
										: "transparent",
									border: "none",
									borderRadius: 4,
									cursor: "pointer",
									textAlign: "left",
									width: "100%",
									transition: "background-color 0.1s ease",
									whiteSpace: "nowrap",
								}}
								onMouseEnter={(e) => {
									if (!isSelected) {
										e.currentTarget.style.backgroundColor = "var(--bg-hover)"
									}
								}}
								onMouseLeave={(e) => {
									if (!isSelected) {
										e.currentTarget.style.backgroundColor = "transparent"
									}
								}}
							>
								<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
									{opt.icon}
									<span>{opt.label}</span>
								</span>
								{isSelected && (
									<CheckIcon size={12} stroke="var(--accent)" strokeWidth={2.5} />
								)}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}
