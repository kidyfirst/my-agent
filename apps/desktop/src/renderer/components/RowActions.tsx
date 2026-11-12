import type { CSSProperties, ReactNode } from "react"
import { MoreVerticalIcon, PlusIcon } from "./icons"

/**
 * Width the hover-only action slot occupies. Fixed so that switching between
 * "idle" and "hovered" never moves the status icons that sit to its right —
 * only the text gets a little narrower.
 */
export const ROW_ACTIONS_WIDTH = 60

/** Point a context menu at the trigger instead of the pointer. */
export function rowMenuAnchor(
	rect: DOMRect,
	menuWidth = 160,
): { x: number; y: number } {
	return { x: rect.right - menuWidth, y: rect.bottom + 4 }
}

/**
 * Fade the tail of a row's label instead of hard-cutting it, so text sliding
 * under the action icons looks intentional.
 */
export function rowTextFade(active: boolean): CSSProperties {
	if (!active) return {}
	// Only the alpha channel of a mask matters, so the stop color is a
	// placeholder rather than a theme color.
	const mask =
		"linear-gradient(to right, black 0, black calc(100% - 22px), transparent 100%)"
	return { maskImage: mask, WebkitMaskImage: mask }
}

interface RowActionsProps {
	/** True while the row is hovered — only then do the triggers exist. */
	hovered: boolean
	/** Opens the row's action menu; receives the trigger's viewport rect. */
	onOpenMenu: (rect: DOMRect) => void
	menuLabel?: string
	/**
	 * Optional secondary hover action, rendered directly to the right of the
	 * 3-dot trigger (e.g. "new session" on a project row).
	 */
	onCreate?: () => void
	createLabel?: string
	/** Status icons (recording dot, replay badge, spinner, time, …). */
	children?: ReactNode
}

/**
 * The right-hand icon area of a sidebar row.
 *
 * Idle: nothing but the status icons, flushed right. Hovered: a fixed-width slot
 * appears with the 3-dot trigger on its left and the very same status icons on
 * its right, so the icons keep their position and the row does not flicker.
 */
export function RowActions({
	hovered,
	onOpenMenu,
	menuLabel = "More actions",
	onCreate,
	createLabel = "New session",
	children,
}: RowActionsProps) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 2,
				flexShrink: 0,
				// At least the fixed slot while hovered, wider if the status icons
				// need it — the dots then still sit at the slot's left edge.
				minWidth: hovered ? ROW_ACTIONS_WIDTH : undefined,
				paddingRight: hovered ? 6 : 8,
				minHeight: 20,
			}}
		>
			{hovered && (
				<button
					type="button"
					title={menuLabel}
					aria-label={menuLabel}
					onClick={(e) => {
						e.stopPropagation()
						onOpenMenu(e.currentTarget.getBoundingClientRect())
					}}
					onMouseDown={(e) => e.stopPropagation()}
					onDoubleClick={(e) => e.stopPropagation()}
					style={{
						width: 18,
						height: 18,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						color: "var(--muted)",
						cursor: "pointer",
						flexShrink: 0,
						transition: "background-color 0.12s ease, color 0.12s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--bg-hover)"
						e.currentTarget.style.color = "var(--text)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent"
						e.currentTarget.style.color = "var(--muted)"
					}}
				>
					<MoreVerticalIcon size={14} />
				</button>
			)}
			{hovered && onCreate && (
				<button
					type="button"
					title={createLabel}
					aria-label={createLabel}
					onClick={(e) => {
						e.stopPropagation()
						onCreate()
					}}
					onMouseDown={(e) => e.stopPropagation()}
					onDoubleClick={(e) => e.stopPropagation()}
					style={{
						width: 18,
						height: 18,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						color: "var(--muted)",
						cursor: "pointer",
						flexShrink: 0,
						transition: "background-color 0.12s ease, color 0.12s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--bg-hover)"
						e.currentTarget.style.color = "var(--text)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent"
						e.currentTarget.style.color = "var(--muted)"
					}}
				>
					<PlusIcon size={14} strokeWidth={2} />
				</button>
			)}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					marginLeft: "auto",
					flexShrink: 0,
				}}
			>
				{children}
			</div>
		</div>
	)
}
