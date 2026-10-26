import { useEffect, useCallback } from "react"
import { createPortal } from "react-dom"

interface ImagePreviewModalProps {
	src: string | null
	alt?: string
	onClose: () => void
}

export function ImagePreviewModal({ src, alt, onClose }: ImagePreviewModalProps) {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault()
				e.stopPropagation()
				onClose()
			}
		},
		[onClose],
	)

	useEffect(() => {
		if (!src) return
		window.addEventListener("keydown", handleKeyDown)
		const originalOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
			document.body.style.overflow = originalOverflow
		}
	}, [src, handleKeyDown])

	if (!src) return null

	return createPortal(
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.82)",
				backdropFilter: "blur(4px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 999999,
				padding: 24,
				cursor: "zoom-out",
				animation: "previewFadeIn 0.15s ease-out",
			}}
			onClick={onClose}
		>
			<style>{`
				@keyframes previewFadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				@keyframes previewZoomIn {
					from { transform: scale(0.95); opacity: 0; }
					to { transform: scale(1); opacity: 1; }
				}
			`}</style>

			{/* Close button at top right */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation()
					onClose()
				}}
				title="Close (Esc)"
				aria-label="Close image preview"
				style={{
					position: "absolute",
					top: 16,
					right: 16,
					width: 36,
					height: 36,
					borderRadius: "50%",
					background: "rgba(255, 255, 255, 0.15)",
					border: "1px solid rgba(255, 255, 255, 0.25)",
					color: "#ffffff",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					cursor: "pointer",
					transition: "background-color 0.15s, transform 0.1s",
					zIndex: 1000000,
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.3)"
					e.currentTarget.style.transform = "scale(1.05)"
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)"
					e.currentTarget.style.transform = "scale(1)"
				}}
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>

			{/* Image */}
			<img
				src={src}
				alt={alt || "Image preview"}
				onClick={(e) => e.stopPropagation()}
				style={{
					maxWidth: "92vw",
					maxHeight: "92vh",
					borderRadius: 8,
					boxShadow: "0 12px 40px rgba(0, 0, 0, 0.6)",
					objectFit: "contain",
					cursor: "default",
					animation: "previewZoomIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
				}}
			/>
		</div>,
		document.body,
	)
}
