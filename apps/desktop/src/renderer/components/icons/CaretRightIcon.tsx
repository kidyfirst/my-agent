import type React from "react"
import type { IconProps } from "./types"

export function CaretRightIcon({
	size = 10,
	strokeWidth = 1.3,
	viewBox = "0 0 10 10",
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
			<path d="M3.5 2L6.5 5L3.5 8" />
		</svg>
	)
}
