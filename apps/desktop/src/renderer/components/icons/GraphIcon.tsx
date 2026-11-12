import type React from "react"
import type { IconProps } from "./types"

export function GraphIcon({
	size = 16,
	strokeWidth = 1.5,
	viewBox = "0 0 24 24",
	fill = "none",
	stroke = "currentColor",
	strokeLinecap = "round",
	strokeLinejoin = "round",
	style,
	...props
}: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox={viewBox}
			fill={fill}
			stroke={stroke}
			strokeWidth={strokeWidth}
			strokeLinecap={strokeLinecap}
			strokeLinejoin={strokeLinejoin}
			style={{ flexShrink: 0, display: "block", ...style }}
			aria-hidden="true"
			{...props}
		>
			<circle cx="6" cy="6" r="3" />
			<circle cx="18" cy="18" r="3" />
			<circle cx="18" cy="6" r="3" />
			<path d="M8.5 7.5L15.5 16.5" />
			<path d="M8.5 6h7" />
		</svg>
	)
}
