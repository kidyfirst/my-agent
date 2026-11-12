import type React from "react"
import type { BrandMark } from "../sidebar/brandMarks"

export function BrandMarkIcon({
	mark,
	size = 16,
}: {
	mark: BrandMark
	size?: number
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={mark.glyphColor}
			aria-hidden="true"
		>
			{mark.glyph}
		</svg>
	)
}
