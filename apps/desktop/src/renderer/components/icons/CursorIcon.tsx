import type React from "react"
import type { IconProps } from "./types"

export function CursorIcon({
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
			<path d="M4 2 L4 14 L7.5 10.5 L11 14 L13 12 L9.5 8.5 L14 7 Z" />
		</svg>
	)
}
