import type React from "react"
import type { IconProps } from "./types"

export interface DownloadProgressRingProps extends IconProps {
	percent: number
}

export function DownloadProgressRing({
	percent,
	size = 24,
	style,
	...props
}: DownloadProgressRingProps) {
	const radius = 7.5
	const circumference = 2 * Math.PI * radius
	const clampedPercent = Math.min(Math.max(percent, 0), 100)
	const offset = circumference * (1 - clampedPercent / 100)

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			style={{ display: "block", flexShrink: 0, ...style }}
			aria-hidden="true"
			{...props}
		>
			{/* Inner concentric core / orb (Codex style) */}
			<circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity={0.45} />
			{/* Background circular track */}
			<circle
				cx="12"
				cy="12"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeOpacity={0.25}
				strokeWidth="2.2"
			/>
			{/* Dynamic progress ring (clockwise from top) */}
			<circle
				cx="12"
				cy="12"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.2"
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				transform="rotate(-90 12 12)"
				style={{ transition: "stroke-dashoffset 0.25s ease-out" }}
			/>
		</svg>
	)
}
