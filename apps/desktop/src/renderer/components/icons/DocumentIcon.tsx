import type React from "react"
import type { IconProps } from "./types"

export function DocumentIcon({
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
			<path d="M14 21H6a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 6 3h12a2.5 2.5 0 0 1 2.5 2.5v9a1 1 0 0 1-.5.8L15 20.5a1 1 0 0 1-.8.5z" />
			<path d="M14 21v-4.5a1.5 1.5 0 0 1 1.5-1.5H20" />
			<line x1="7.5" y1="7.5" x2="8.8" y2="7.5" />
			<line x1="11" y1="7.5" x2="16.5" y2="7.5" />
			<line x1="7.5" y1="11.5" x2="13.5" y2="11.5" />
		</svg>
	)
}

export const NoteIcon = DocumentIcon
