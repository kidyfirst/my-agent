import type React from "react"
import type { IconProps } from "./types"

export interface LibraryIconProps extends IconProps {
	filled?: boolean
}

export function LibraryIcon({
	size = 16,
	filled = false,
	strokeWidth = 1.5,
	style,
	...props
}: LibraryIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke={filled ? "none" : "currentColor"}
			strokeWidth={filled ? 0 : strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
			{...props}
		>
			<rect x="3.5" y="4" width="4" height="16" rx="1.6" />
			<rect x="9.5" y="4" width="4" height="16" rx="1.6" />
			<rect
				x="15.5"
				y="4"
				width="4"
				height="16"
				rx="1.6"
				transform="rotate(10.5 17.5 12)"
			/>
		</svg>
	)
}
