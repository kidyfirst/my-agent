import React from "react"

export interface IconProps {
	/** Rendered width and height in CSS pixels. */
	size?: number
	/**
	 * Stroke weight in viewBox units. Defaults to 1.5, the weight the sidebar
	 * and library rows are drawn at.
	 *
	 * Pass a larger value for icons rendered below ~14px: a 1.5px stroke on a
	 * 24-unit viewBox scaled down to 12px lands under a device pixel and greys
	 * out. Toolbar buttons at 16px pass ~2 for the same reason.
	 */
	strokeWidth?: number
	/** Overrides `currentColor`. Most icons should leave this unset. */
	color?: string
	/** Solid glyphs set this instead of stroking. */
	filled?: boolean
	/**
	 * Extra paths, drawn after the shared shell. Icons that take data (a
	 * direction, a menu entry) branch on their own props and pass the result
	 * here rather than duplicating the `<svg>` element.
	 */
	children: React.ReactNode
	className?: string
	style?: React.CSSProperties
	/** Overrides the default 24-unit grid. Only for glyphs drawn on 16. */
	viewBox?: string
	/** Labels the icon for assistive tech. Decorative icons leave it unset. */
	title?: string
}

/**
 * Shared shell for every inline icon in the renderer.
 *
 * The 100+ `<svg>` elements scattered across components had drifted apart on
 * cap and join style, on whether they set `aria-hidden`, and on whether they
 * set `flexShrink` -- which matters because in a flex row an unshrunk icon
 * gets squeezed when the label beside it is long. Centralising the shell keeps
 * those guarantees in one place; the actual paths stay with their icons.
 */
export function Icon({
	size = 16,
	strokeWidth = 1.5,
	color,
	filled = false,
	children,
	className,
	style,
	viewBox = "0 0 24 24",
	title,
}: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox={viewBox}
			fill={filled ? "currentColor" : "none"}
			stroke={filled ? "none" : color || "currentColor"}
			strokeWidth={filled ? 0 : strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			style={{ flexShrink: 0, display: "block", ...style }}
			role={title ? "img" : undefined}
			aria-hidden={title ? undefined : "true"}
		>
			{title ? <title>{title}</title> : null}
			{children}
		</svg>
	)
}
