import React from "react"

/**
 * Library icon: three books standing on a shelf with the rightmost book leaning.
 * Supports outline (unselected/default) and filled (active/selected) states.
 */
export function LibraryIcon({
	size = 16,
	filled = false,
	strokeWidth = 1.8,
	style,
}: {
	size?: number
	filled?: boolean
	strokeWidth?: number
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={filled ? "currentColor" : "none"}
			stroke={filled ? "none" : "currentColor"}
			strokeWidth={filled ? 0 : strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			{/* Book 1 (Left, upright) */}
			<rect x="3.5" y="4" width="4" height="16" rx="1.6" />
			{/* Book 2 (Middle, upright) */}
			<rect x="9.5" y="4" width="4" height="16" rx="1.6" />
			{/* Book 3 (Right, tilted 10.5 degrees) */}
			<rect
				x="15.5"
				y="4"
				width="4"
				height="16"
				rx="1.6"
				transform="rotate(10.5 17.5 12)"
			/>
		</svg>
	)
}

/**
 * Image icon: rounded rectangle frame with sun circle on top right and mountain peaks at bottom.
 * Matches ChatGPT Library reference design.
 */
export function ImageIcon({
	size = 18,
	strokeWidth = 1.8,
	color,
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<rect x="3" y="3" width="18" height="18" rx="4" />
			<circle cx="16" cy="8.5" r="1.5" />
			<path d="M3.5 17.5c2.5-3.5 5.5-4 7.5-1 2 3 4 2 6.5-2.5 1.5-2.5 2.5-1.5 3.5 1.5" />
		</svg>
	)
}

/**
 * Document / Note icon: rounded page with curled bottom-right dog-ear fold and top text lines.
 * Matches ChatGPT Library reference design.
 */
export function DocumentIcon({
	size = 18,
	strokeWidth = 1.8,
	color,
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			{/* Outer page outline with bottom-right dog-ear cut */}
			<path d="M14 21H6a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 6 3h12a2.5 2.5 0 0 1 2.5 2.5v9a1 1 0 0 1-.5.8L15 20.5a1 1 0 0 1-.8.5z" />
			{/* Folded dog-ear corner */}
			<path d="M14 21v-4.5a1.5 1.5 0 0 1 1.5-1.5H20" />
			{/* Top text line 1: dot and dash */}
			<line x1="7.5" y1="7.5" x2="8.8" y2="7.5" />
			<line x1="11" y1="7.5" x2="16.5" y2="7.5" />
			{/* Text line 2 */}
			<line x1="7.5" y1="11.5" x2="13.5" y2="11.5" />
		</svg>
	)
}

export const NoteIcon = DocumentIcon

/**
 * Folder icon: top-left tab, rounded rectangular body, and horizontal divider line.
 * Matches ChatGPT Library reference design.
 */
export function FolderIcon({
	size = 18,
	strokeWidth = 1.8,
	color,
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<path d="M3 8V6.5A1.5 1.5 0 0 1 4.5 5h4a1.5 1.5 0 0 1 1.2.6L11 7.4a1 1 0 0 0 .8.6H19.5A1.5 1.5 0 0 1 21 9.5v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
			<line x1="3" y1="11" x2="21" y2="11" />
		</svg>
	)
}

/**
 * Spreadsheet icon: rounded box with top header row and two lower columns.
 * Matches ChatGPT Library reference design.
 */
export function SpreadsheetIcon({
	size = 18,
	strokeWidth = 1.8,
	color,
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<rect x="3" y="3" width="18" height="18" rx="4" />
			<line x1="3" y1="10" x2="21" y2="10" />
			<line x1="11" y1="10" x2="11" y2="21" />
		</svg>
	)
}

/**
 * Presentation icon: top bar hanger and rounded display screen.
 * Matches ChatGPT Library reference design.
 */
export function PresentationIcon({
	size = 18,
	strokeWidth = 1.8,
	color,
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<line x1="7.5" y1="3.5" x2="16.5" y2="3.5" />
			<rect x="3" y="6" width="18" height="14" rx="4" />
		</svg>
	)
}

/**
 * Trash / Delete icon: top handle, horizontal lid rim, and tapered bin.
 * Exact project standard SVG (Screenshot 2).
 */
export function TrashIcon({
	size = 14,
	strokeWidth = 1.8,
	color,
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		</svg>
	)
}

export const DeleteIcon = TrashIcon

/**
 * Star icon for favorites.
 */
export function StarIcon({
	size = 14,
	filled = false,
	color,
	style,
}: {
	size?: number
	filled?: boolean
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={filled ? color || "var(--warning)" : "none"}
			stroke={color || (filled ? "var(--warning)" : "currentColor")}
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
		</svg>
	)
}

/**
 * Open external folder icon.
 */
export function OpenFolderIcon({
	size = 14,
	color,
	style,
}: {
	size?: number
	color?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color || "currentColor"}
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1="10" y1="14" x2="21" y2="3" />
		</svg>
	)
}

/**
 * OCR scan icon: viewfinder corner brackets with 'OCR' text in the center.
 * Line colors match other buttons (currentColor), text is red (var(--error)).
 */
export function OcrIcon({
	size = 14,
	strokeWidth = 1.8,
	color,
	textColor = "var(--error)",
	style,
}: {
	size?: number
	strokeWidth?: number
	color?: string
	textColor?: string
	style?: React.CSSProperties
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			style={{ flexShrink: 0, ...style }}
			aria-hidden="true"
		>
			{/* Top-left corner */}
			<path
				d="M3 8V3h5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* Top-right corner */}
			<path
				d="M16 3h5v5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* Bottom-left corner */}
			<path
				d="M3 16v5h5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* Bottom-right corner */}
			<path
				d="M16 21h5v-5"
				stroke={color || "currentColor"}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* Center OCR text */}
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
