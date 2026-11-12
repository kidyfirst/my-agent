import type React from "react"
import type { IconProps } from "./types"

export function OpenFolderIcon({
	size = 14,
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
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1="10" y1="14" x2="21" y2="3" />
		</svg>
	)
}
