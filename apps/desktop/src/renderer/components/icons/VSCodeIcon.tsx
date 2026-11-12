import type React from "react"
import type { IconProps } from "./types"

export function VSCodeIcon({
	size = 14,
	strokeWidth = 1.3,
	viewBox = "0 0 16 16",
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
			<path d="M11 1 L14 3 V13 L11 15 L2 9 L5 7 L11 11 V5 L5 9 L2 7 L11 1 Z" />
		</svg>
	)
}
