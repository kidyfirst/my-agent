import type React from "react"
import type { IconProps } from "./types"

export function LogIcon({
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
			<path d="M14.25 3.25H7A2.25 2.25 0 0 0 4.75 5.5v13A2.25 2.25 0 0 0 7 20.75h10a2.25 2.25 0 0 0 2.25-2.25V8.25z" />
			<path d="M14.25 3.25V8.25H19.25" />
			<path d="M8.5 12.5h7" />
			<path d="M8.5 16h4.5" />
		</svg>
	)
}
