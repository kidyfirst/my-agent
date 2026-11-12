import type React from "react"
import type { IconProps } from "./types"

export function SpreadsheetIcon({
	size = 18,
	strokeWidth = 1.8,
	color,
	style,
	...props
}: IconProps & { color?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
			{...props}
		>
			<rect x="3" y="3" width="18" height="18" rx="4" />
			<line x1="3" y1="10" x2="21" y2="10" />
			<line x1="11" y1="10" x2="11" y2="21" />
		</svg>
	)
}
