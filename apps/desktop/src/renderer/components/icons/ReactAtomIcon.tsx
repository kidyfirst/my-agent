import type React from "react"
import type { IconProps } from "./types"

export function ReactAtomIcon({
	size = 15,
	color = "var(--brand-react)",
	style,
	...props
}: IconProps & { color?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="-11.5 -10.23174 23 20.46348"
			fill="none"
			style={{ flexShrink: 0, color, ...style }}
			aria-hidden="true"
			{...props}
		>
			<circle cx="0" cy="0" r="2.05" fill="currentColor" />
			<g stroke="currentColor" strokeWidth="1" fill="none">
				<ellipse rx="11" ry="4.2" />
				<ellipse rx="11" ry="4.2" transform="rotate(60)" />
				<ellipse rx="11" ry="4.2" transform="rotate(120)" />
			</g>
		</svg>
	)
}
