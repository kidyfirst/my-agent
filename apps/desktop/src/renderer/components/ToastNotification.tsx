import { useState, useEffect } from "react"

export interface ToastData {
	id?: number
	message: string
	type: "info" | "error" | "success"
}

export interface ToastNotificationProps {
	toast: ToastData
	onClose: () => void
	durationMs?: number
}

export function ToastNotification({
	toast,
	onClose,
	durationMs = 3000,
}: ToastNotificationProps) {
	const [animState, setAnimState] = useState<"enter" | "visible" | "exit">(
		"enter",
	)

	useEffect(() => {
		// Start enter animation on next tick
		const raf = requestAnimationFrame(() => {
			setAnimState("visible")
		})

		// Trigger exit slide-out after durationMs
		const exitTimer = setTimeout(() => {
			setAnimState("exit")
		}, durationMs)

		// Unmount after exit transition completes (durationMs + 320ms)
		const closeTimer = setTimeout(() => {
			onClose()
		}, durationMs + 320)

		return () => {
			cancelAnimationFrame(raf)
			clearTimeout(exitTimer)
			clearTimeout(closeTimer)
		}
	}, [toast.id, toast.message, durationMs, onClose])

	const isOffset = animState === "enter" || animState === "exit"

	const toastAccent =
		toast.type === "error"
			? "var(--error)"
			: toast.type === "success"
				? "var(--success)"
				: "var(--muted)"

	const toastGlyph =
		toast.type === "error" ? "⚠" : toast.type === "success" ? "✓" : "•"

	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				position: "absolute",
				top: 48,
				left: "50%",
				transform: isOffset
					? "translate(-50%, -12px)"
					: "translate(-50%, 0)",
				opacity: isOffset ? 0 : 1,
				transition:
					"opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
				zIndex: 9999,
				maxWidth: "min(560px, calc(100% - 32px))",
				padding: "8px 14px",
				borderRadius: 8,
				background: "var(--bg-elevated)",
				border: "1px solid var(--border)",
				boxShadow: "var(--shadow-popover)",
				color: "var(--text)",
				fontFamily: "inherit",
				fontSize: 12,
				fontWeight: 500,
				lineHeight: 1.5,
				letterSpacing: "0.2px",
				display: "flex",
				alignItems: "center",
				gap: 8,
				pointerEvents: "none",
			}}
		>
			<span style={{ color: toastAccent, fontWeight: 700, flex: "0 0 auto" }}>
				{toastGlyph}
			</span>
			<span style={{ minWidth: 0, wordBreak: "break-word" }}>
				{toast.message}
			</span>
		</div>
	)
}
