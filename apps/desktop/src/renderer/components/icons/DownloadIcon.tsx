import type React from "react"
import type { IconProps } from "./types"

export function DownloadIcon({
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
			<line x1="12" y1="4" x2="12" y2="15" />
			<polyline points="7 10 12 15 17 10" />
			<path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
		</svg>
	)
}
