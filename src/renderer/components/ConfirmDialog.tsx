interface ConfirmDialogProps {
	title: string
	description: string
	confirmLabel?: string
	confirmVariant?: "danger" | "primary"
	checkboxLabel?: string
	checkboxChecked?: boolean
	onCheckboxChange?: (checked: boolean) => void
	onConfirm: () => void
	onCancel: () => void
}

export function ConfirmDialog({
	title,
	description,
	confirmLabel = "Delete",
	confirmVariant = "danger",
	checkboxLabel,
	checkboxChecked = false,
	onCheckboxChange,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--scrim)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 9999,
			}}
			onClick={onCancel}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "var(--bg-surface)",
					border: "1px solid var(--border-muted)",
					borderRadius: 8,
					padding: "20px 24px",
					maxWidth: 360,
					width: "90%",
				}}
			>
				<div
					style={{
						fontSize: 13,
						fontWeight: 600,
						color: "var(--text)",
						marginBottom: 8,
					}}
				>
					{title}
				</div>
				<div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
					{description}
				</div>
				{checkboxLabel && (
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							fontSize: 12,
							color: "var(--text)",
							marginBottom: 16,
							cursor: "pointer",
							userSelect: "none",
						}}
					>
						<input
							type="checkbox"
							checked={checkboxChecked}
							onChange={(e) => onCheckboxChange?.(e.target.checked)}
							style={{ cursor: "pointer", accentColor: "var(--accent)" }}
						/>
						<span>{checkboxLabel}</span>
					</label>
				)}
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button
						onClick={onCancel}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							borderRadius: 4,
							background: "var(--bg)",
							color: "var(--text)",
							cursor: "pointer",
							border: "1px solid var(--border-muted)",
						}}
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							borderRadius: 4,
							background:
								confirmVariant === "danger" ? "var(--error)" : "var(--accent)",
							color: "var(--on-accent)",
							cursor: "pointer",
							border: "none",
						}}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}
