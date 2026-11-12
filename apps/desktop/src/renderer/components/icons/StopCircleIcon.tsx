import type React from "react"
import type { IconProps } from "./types"

export function StopCircleIcon({
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
			<circle cx="12" cy="12" r="9.5" />
			<rect
				x="8.5"
				y="8.5"
				width="7"
				height="7"
				rx="1"
				fill="currentColor"
				stroke="none"
			/>
		</svg>
	)
}
