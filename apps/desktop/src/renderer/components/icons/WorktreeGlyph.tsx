import type React from "react"
import type { IconProps } from "./types"

export interface WorktreeGlyphProps extends IconProps {
	color?: string
	filled?: boolean
}

export function WorktreeGlyph({
	size = 13,
	color = "currentColor",
	filled = false,
	strokeWidth = 2,
	style,
	...props
}: WorktreeGlyphProps) {
	const node = filled ? color : "none"
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ display: "block", flexShrink: 0, ...style }}
			{...props}
		>
			{/* Trunk between the two left nodes. */}
			<path d="M6 9v6" />
			{/* Branch from the right node, curving into the trunk's foot. */}
			<path d="M18 7.5v2.2c0 3.6-2.6 6.3-6.3 6.3H8.9" />
			<circle cx="6" cy="6" r="3" fill={node} />
			<circle cx="18" cy="6" r="3" fill={node} />
			<circle cx="6" cy="18" r="3" fill={node} />
		</svg>
	)
}
