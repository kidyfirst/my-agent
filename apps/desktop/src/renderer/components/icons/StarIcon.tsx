import type React from "react"
import type { IconProps } from "./types"

export interface StarIconProps extends IconProps {
	filled?: boolean
}

export function StarIcon({
	size = 14,
	strokeWidth = 1.5,
	viewBox = "0 0 24 24",
	fill,
	stroke,
	filled = false,
	strokeLinecap = "round",
	strokeLinejoin = "round",
	style,
	color,
	...props
}: StarIconProps) {
	const effectiveFill = fill ?? (filled ? color || "var(--warning)" : "none")
	const effectiveStroke = stroke ?? (color || (filled ? "var(--warning)" : "currentColor"))
	return (
		<svg
			width={size}
			height={size}
			viewBox={viewBox}
			fill={effectiveFill}
			stroke={effectiveStroke}
			strokeWidth={strokeWidth}
			strokeLinecap={strokeLinecap}
			strokeLinejoin={strokeLinejoin}
			style={{ flexShrink: 0, display: "block", ...style }}
			aria-hidden="true"
			{...props}
		>
			<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
		</svg>
	)
}
