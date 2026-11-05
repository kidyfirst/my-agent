import { useComputerUsePreview } from "../hooks/useComputerUsePreview"
import type { PreviewFrame } from "../utils/computerUsePreview"

const CARD_WIDTH = 300
/** Distance from the conversation pane's top-right corner. */
const GAP = 12

interface ComputerUsePreviewProps {
	threadId?: string | null
	worktreePath?: string | null
	/** Hand the page to the sidebar's browser panel, where it can be used. */
	onOpenInPanel?: (url: string) => void
}

/**
 * Small live mirror of the headless browser the agent is driving.
 *
 * It appears when the first frame arrives (a `computer` or `navigate-browser`
 * call), lingers a couple of seconds after the tool stops, and closes itself.
 * Hovering pins it and reveals the expand button, which opens the page in the
 * sidebar's browser tab — the screenshot is a mirror, not a place to work.
 *
 * Positioning is the pane's job, not the component's: the card is an
 * absolutely positioned child of the conversation column, which is
 * `position: relative` and never scrolls. It therefore stays glued to that
 * column's top-right corner — scrolling the transcript cannot move it, and
 * neither can an approval card pushing the messages around. When the right
 * sidebar opens the column gets narrower, and the card simply travels with it
 * instead of ending up on top of the panel.
 */
export function ComputerUsePreview({
	threadId,
	worktreePath,
	onOpenInPanel,
}: ComputerUsePreviewProps) {
	const preview = useComputerUsePreview(threadId, worktreePath)

	if (!preview.visible || !preview.frame) return null

	const frame = preview.frame
	// The mirrored page lives in a headless browser; opening it means opening
	// the same url on a surface the user can actually type in.
	const openInBrowser = () => {
		if (!/^https?:/i.test(frame.url)) return
		if (onOpenInPanel) {
			onOpenInPanel(frame.url)
			return
		}
		void window.api.invoke({ type: "openExternal", url: frame.url })
	}

	return (
		<ComputerUsePreviewCard
			frame={frame}
			active={preview.active}
			hovered={preview.hovered}
			placement={GAP}
			onHoverStart={preview.onHoverStart}
			onHoverEnd={preview.onHoverEnd}
			onOpen={openInBrowser}
		/>
	)
}

interface CardProps {
	frame: PreviewFrame
	active: boolean
	hovered: boolean
	/** Inset from the conversation pane's top-right corner, in px. */
	placement?: number
	onHoverStart: () => void
	onHoverEnd: () => void
	onOpen: () => void
}

/** Presentational half: everything the panel draws, no subscriptions. */
export function ComputerUsePreviewCard({
	frame,
	active,
	hovered,
	placement = GAP,
	onHoverStart,
	onHoverEnd,
	onOpen,
}: CardProps) {
	const host = hostOf(frame.url)

	return (
		<div
			data-testid="computer-use-preview"
			onMouseEnter={onHoverStart}
			onMouseLeave={onHoverEnd}
			style={{
				// Absolute inside the conversation pane: the pane is the card's
				// containing block, so it tracks every layout change for free and
				// can never spill over the right sidebar.
				position: "absolute",
				top: placement,
				right: placement,
				width: CARD_WIDTH,
				// Never wider than the pane it is pinned to.
				maxWidth: `calc(100% - ${placement * 2}px)`,
				borderRadius: 12,
				overflow: "hidden",
				border: "1px solid var(--border)",
				background: "var(--bg-elevated)",
				boxShadow: "var(--shadow-popover)",
				zIndex: 40,
			}}
		>
			<div
				style={{
					position: "relative",
					lineHeight: 0,
					background: "var(--bg-surface)",
				}}
			>
				<img
					src={frame.dataUrl}
					alt={frame.title || "Browser preview"}
					draggable={false}
					style={{
						display: "block",
						width: "100%",
						aspectRatio: "4 / 3",
						objectFit: "cover",
						objectPosition: "top left",
					}}
				/>

				{/* Only on hover: the point of the panel is the page, not chrome. */}
				<button
					type="button"
					data-testid="computer-use-preview-expand"
					title="Open in browser panel"
					aria-label="Open in browser panel"
					onClick={onOpen}
					style={{
						position: "absolute",
						top: 6,
						right: 6,
						width: 24,
						height: 24,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 6,
						background: "var(--scrim)",
						color: "var(--on-accent)",
						cursor: "pointer",
						padding: 0,
						opacity: hovered ? 1 : 0,
						pointerEvents: hovered ? "auto" : "none",
						transition: "opacity 120ms ease-out",
					}}
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M6.5 3.5H3.5v9h9v-3" />
						<path d="M9.5 3.5h3v3" />
						<path d="M12.5 3.5L7.5 8.5" />
					</svg>
				</button>

				<div
					style={{
						position: "absolute",
						top: 6,
						left: 6,
						display: "flex",
						alignItems: "center",
						gap: 5,
						padding: "2px 7px",
						borderRadius: 999,
						background: "var(--scrim)",
						color: "var(--on-accent)",
						fontSize: 10,
						letterSpacing: 0.3,
						lineHeight: 1.5,
					}}
				>
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: active ? "var(--success)" : "var(--dim)",
						}}
					/>
					{active ? "BROWSER" : "USED BROWSER"}
				</div>
			</div>

			<div style={{ padding: "6px 9px 7px" }}>
				<div
					title={frame.url}
					style={{
						fontSize: 11,
						color: "var(--muted)",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{host || "about:blank"}
				</div>
			</div>
		</div>
	)
}

function hostOf(url: string): string {
	if (!url || url === "about:blank") return ""
	try {
		const parsed = new URL(url)
		const path = parsed.pathname === "/" ? "" : parsed.pathname
		return `${parsed.host}${path}`
	} catch {
		return url
	}
}
