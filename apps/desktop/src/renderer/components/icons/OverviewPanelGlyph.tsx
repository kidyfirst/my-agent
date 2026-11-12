import type React from "react"
import type { IconProps } from "./types"

export function OverviewPanelGlyph({
	size = 16,
	strokeWidth = 1,
	viewBox = "0 0 16 16",
	fill = "none",
	stroke = "currentColor",
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
			style={{ display: "block", flexShrink: 0, ...style }}
			aria-hidden="true"
			{...props}
		>
			<rect x="2.3" y="2.5" width="11.4" height="11" rx="2.2" />
			<rect
				x="4.7"
				y="5.4"
				width="6.6"
				height="1.3"
				rx="0.65"
				fill="currentColor"
				fillOpacity="0.5"
				stroke="none"
			/>
			<rect
				x="4.7"
				y="7.9"
				width="6.6"
				height="1.3"
				rx="0.65"
				fill="currentColor"
				fillOpacity="0.5"
				stroke="none"
			/>
			<rect
				x="4.7"
				y="10.4"
				width="4.1"
				height="1.3"
				rx="0.65"
				fill="currentColor"
				fillOpacity="0.5"
				stroke="none"
			/>
		</svg>
	)
}
