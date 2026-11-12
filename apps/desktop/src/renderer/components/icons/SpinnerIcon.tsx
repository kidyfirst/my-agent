import type React from "react"
import type { IconProps } from "./types"

export function SpinnerIcon({
	size = 16,
	strokeWidth = 2,
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
			style={{
				flexShrink: 0,
				display: "block",
				animation: "sidebar-thread-spin 0.85s linear infinite",
				transformOrigin: "center",
				...style,
			}}
			aria-hidden="true"
			{...props}
		>
			<circle
				cx="12"
				cy="12"
				r="9"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeDasharray="40 17"
			/>
		</svg>
	)
}
