import type React from "react"
import type { IconProps } from "./types"

export interface PanelSizeIconProps extends IconProps {
	/** Maximized: the glyph points inward (restore). Otherwise outward. */
	maximized: boolean
}

export function PanelSizeIcon({
	maximized,
	size = 16,
	strokeWidth = 1.2,
	style,
	...props
}: PanelSizeIconProps) {
	const d = maximized
		? "M6.5 2.5 V6.5 H2.5 M9.5 2.5 V6.5 H13.5 M13.5 9.5 H9.5 V13.5 M6.5 13.5 V9.5 H2.5"
		: "M2.5 6.5 V2.5 H6.5 M9.5 2.5 H13.5 V6.5 M13.5 9.5 V13.5 H9.5 M6.5 13.5 H2.5 V9.5"

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, display: "block", ...style }}
			aria-hidden="true"
			{...props}
		>
			<path d={d} />
		</svg>
	)
}
