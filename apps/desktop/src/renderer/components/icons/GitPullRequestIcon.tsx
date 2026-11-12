import type React from "react"
import type { IconProps } from "./types"

export function GitPullRequestIcon({
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
			<circle cx="5" cy="3.5" r="2" />
			<circle cx="5" cy="12.5" r="2" />
			<circle cx="11" cy="5.5" r="2" />
			<line x1="5" y1="5.5" x2="5" y2="10.5" />
			<path d="M9 5.5 H7 C5.9 5.5 5 6.4 5 7.5" />
		</svg>
	)
}
