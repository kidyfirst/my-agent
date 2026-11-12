import type React from "react"
import type { IconProps } from "./types"

export function OcrIcon({
	size = 14,
	strokeWidth = 1.8,
	color,
	textColor = "var(--error)",
	style,
	...props
}: IconProps & { color?: string; textColor?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
			{...props}
		>
			<path
				d="M3 8V3h5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M16 3h5v5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M3 16v5h5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M16 21h5v-5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<text
				x="12"
				y="13.5"
				textAnchor="middle"
				dominantBaseline="middle"
				fill={textColor}
				fontSize="6.8"
				fontWeight="800"
				fontFamily="system-ui, -apple-system, sans-serif"
				letterSpacing="-0.3px"
			>
				OCR
			</text>
		</svg>
	)
}
