export interface WindowToggleIconProps {
	side: "left" | "right"
	open: boolean
	size?: number
	className?: string
	/** Thin strokes + a translucent fill instead of a solid dark block. */
	soft?: boolean
}

/**
 * Window sidebar toggle icon:
 * - When closed: outline window frame with a divider line (Screenshot 1 & 2)
 * - When open: active sidebar section filled solid (Screenshot 3 & 4)
 */
export function WindowToggleIcon({
	side,
	open,
	size = 16,
	className,
	soft = false,
}: WindowToggleIconProps) {
	const stroke = soft ? "1" : "1.3"
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			className={className}
			style={{ flexShrink: 0, display: "block" }}
		>
			{/* Filled solid section when sidebar is open */}
			{open && (
				<path
					d={
						side === "left"
							? "M 1.5 5 A 2.5 2.5 0 0 1 4 2.5 H 5.5 V 13.5 H 4 A 2.5 2.5 0 0 1 1.5 11 Z"
							: "M 10.5 2.5 H 12 A 2.5 2.5 0 0 1 14.5 5 V 11 A 2.5 2.5 0 0 1 12 13.5 H 10.5 Z"
					}
					fill="currentColor"
					fillOpacity={soft ? "0.35" : "1"}
					stroke="currentColor"
					strokeWidth={stroke}
					strokeLinejoin="round"
				/>
			)}

			{/* Outer window frame */}
			<rect
				x="1.5"
				y="2.5"
				width="13"
				height="11"
				rx="2.5"
				stroke="currentColor"
				strokeWidth={stroke}
			/>

			{/* Vertical divider line */}
			<line
				x1={side === "left" ? "5.5" : "10.5"}
				y1="2.5"
				x2={side === "left" ? "5.5" : "10.5"}
				y2="13.5"
				stroke="currentColor"
				strokeWidth={stroke}
			/>
		</svg>
	)
}
