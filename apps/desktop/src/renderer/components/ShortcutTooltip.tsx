import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import {
	placeTooltip,
	type AnchorRect,
	type TooltipAlign,
} from "../utils/tooltipPlacement"

export interface ShortcutTooltipProps {
	/** What the control does — the same words as its aria-label. */
	label: string
	/** Keys that do the same thing, drawn as glyphs (⌘B, ⇧⌘B, ⌘K). */
	shortcut?: string
	/** Horizontal alignment against the trigger. Defaults to centred. */
	align?: TooltipAlign
	/** Delay before showing, so a quick pass across the icon does not flash. */
	delay?: number
	/** Suppressed while the control's own popover is open. */
	disabled?: boolean
	/** Applies to the trigger wrapper; the bubble is measured from it. */
	style?: React.CSSProperties
	className?: string
	children: React.ReactNode
}

/**
 * The title-bar controls carry a native `title`, which takes a second to show
 * and cannot show a key cap. This bubble replaces it: the action on the left,
 * the shortcut on the right, in the same words as the tooltip.
 */
export function ShortcutTooltip({
	label,
	shortcut,
	align = "center",
	delay = 300,
	disabled = false,
	style,
	className,
	children,
}: ShortcutTooltipProps) {
	const anchorRef = useRef<HTMLSpanElement>(null)
	const bubbleRef = useRef<HTMLDivElement>(null)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [anchor, setAnchor] = useState<AnchorRect | null>(null)
	const [bubbleWidth, setBubbleWidth] = useState(0)

	const clearTimer = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
	}, [])

	const hide = useCallback(() => {
		clearTimer()
		setAnchor(null)
	}, [clearTimer])

	const show = useCallback(() => {
		if (disabled) return
		clearTimer()
		timerRef.current = setTimeout(() => {
			const rect = anchorRef.current?.getBoundingClientRect()
			if (!rect) return
			setAnchor({
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height,
			})
		}, delay)
	}, [clearTimer, delay, disabled])

	useEffect(() => () => clearTimer(), [clearTimer])

	// A control that just opened its own popover must not also show a bubble in
	// the same spot.
	useEffect(() => {
		if (disabled) hide()
	}, [disabled, hide])

	// The bubble renders once before it has been measured; this second pass
	// settles it on the exact width without a visible jump.
	useLayoutEffect(() => {
		if (!anchor) {
			setBubbleWidth(0)
			return
		}
		const width = bubbleRef.current?.getBoundingClientRect().width ?? 0
		setBubbleWidth((current) => (current === width ? current : width))
	}, [anchor])

	useEffect(() => {
		if (!anchor) return
		const dismiss = () => setAnchor(null)
		window.addEventListener("resize", dismiss)
		window.addEventListener("scroll", dismiss, true)
		return () => {
			window.removeEventListener("resize", dismiss)
			window.removeEventListener("scroll", dismiss, true)
		}
	}, [anchor])

	const position = anchor
		? placeTooltip(anchor, bubbleWidth, window.innerWidth, align)
		: null

	return (
		<>
			<span
				ref={anchorRef}
				className={className}
				// The bubble itself is a portal, so the trigger carries the same
				// words as data attributes: tests and devtools can read them
				// without hovering.
				data-tooltip={label}
				data-shortcut={shortcut}
				style={{ display: "inline-flex", ...style }}
				onMouseEnter={show}
				onMouseLeave={hide}
				onFocus={show}
				onBlur={hide}
				onMouseDown={hide}
			>
				{children}
			</span>
			{position &&
				createPortal(
					<div
						ref={bubbleRef}
						role="tooltip"
						className="shortcut-tooltip"
						style={{ left: position.left, top: position.top }}
					>
						<span className="shortcut-tooltip__label">{label}</span>
						{shortcut && (
							<span className="shortcut-tooltip__keys">{shortcut}</span>
						)}
					</div>,
					document.body,
				)}
		</>
	)
}
