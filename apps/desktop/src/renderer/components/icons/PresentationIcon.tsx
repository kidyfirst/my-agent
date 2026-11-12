import type React from "react"
import type { IconProps } from "./types"

export function PresentationIcon({
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
			<line x1="7.5" y1="3.5" x2="16.5" y2="3.5" />
			<rect x="3" y="6" width="18" height="14" rx="4" />
		</svg>
	)
}
