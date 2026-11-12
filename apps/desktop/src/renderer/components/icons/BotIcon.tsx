import type React from "react"
import type { IconProps } from "./types"

export function BotIcon({
	size = 16,
	strokeWidth = 1.5,
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
			style={{ flexShrink: 0, display: "block", ...style }}
			aria-hidden="true"
			{...props}
		>
			<rect width="13.5" height="12.5" x="5.25" y="7.75" rx="2.5" />
			<path d="M12 7.75V4" />
			<path d="M12 3.25h.01" />
			<path d="M2.75 12.5V16m18.5-3.5V16" />
			<path d="M9.25 12.75h.01m5.49 0h.01" />
			<path d="M9.75 16.5h4.5" />
		</svg>
	)
}
export { BotIcon as RobotIcon }
export { BotIcon as AgentIcon }
