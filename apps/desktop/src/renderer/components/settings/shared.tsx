import type React from "react"

// Reusable setting row
export function SettingRow({
	label,
	description,
	children,
}: {
	label: string
	description?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "12px 0",
				borderBottom: "1px solid var(--border-muted)",
				gap: 24,
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
					{label}
				</div>
				{description && (
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							marginTop: 2,
							lineHeight: 1.4,
						}}
					>
						{description}
					</div>
				)}
			</div>
			<div style={{ flexShrink: 0 }}>{children}</div>
		</div>
	)
}

// Toggle switch
export function Toggle({
	checked,
	onChange,
	disabled = false,
}: {
	checked: boolean
	onChange: (v: boolean) => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => !disabled && onChange(!checked)}
			style={{
				width: 36,
				height: 20,
				borderRadius: 10,
				background: checked ? "var(--accent)" : "var(--bg-elevated)",
				border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
				position: "relative",
				cursor: disabled ? "not-allowed" : "pointer",
				opacity: disabled ? 0.5 : 1,
				transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
			}}
		>
			<span
				style={{
					position: "absolute",
					top: 2,
					left: checked ? 18 : 2,
					width: 14,
					height: 14,
					borderRadius: "50%",
					background: "var(--on-accent)",
					transition: "left 0.15s",
				}}
			/>
		</button>
	)
}

// Re-export universal Select dropdown
export { Select, type SelectOption, type SelectProps } from "../Select"

// Section header
export function SectionHeader({ title }: { title: string }) {
	return (
		<div
			style={{
				fontSize: 10,
				fontWeight: 600,
				color: "var(--muted)",
				textTransform: "uppercase",
				letterSpacing: "0.5px",
				padding: "8px 0 4px",
			}}
		>
			{title}
		</div>
	)
}
