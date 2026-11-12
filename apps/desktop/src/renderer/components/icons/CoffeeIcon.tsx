import type React from "react"
import type { IconProps } from "./types"

export function CoffeeIcon({
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
			<path d="M3.75 9.75h11.5v5.75A5.25 5.25 0 0 1 10 20.75H9a5.25 5.25 0 0 1-5.25-5.25Z" />
			<path d="M15.25 11H17a2.5 2.5 0 0 1 0 5h-1.9M7.75 2.75c-.6.6-.6 1.6 0 2.25s.6 1.6 0 2.25m3.5-4.5c-.6.6-.6 1.6 0 2.25s.6 1.6 0 2.25" />
		</svg>
	)
}
