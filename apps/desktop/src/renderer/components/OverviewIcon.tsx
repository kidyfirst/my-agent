import type { OverviewAction } from "../utils/overviewMenu"

/**
 * One icon per Overview destination, shared by the title-bar dropdown and the
 * sidebar list so a panel never gets two different glyphs. Thin strokes keep
 * the list quiet; colour comes from `currentColor` so both hosts stay muted.
 */
export function OverviewIcon({
	id,
	size = 14,
}: {
	id: OverviewAction
	size?: number
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.1"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, display: "block" }}
		>
			{id === "files" && (
				<>
					<path d="M9 1.8H4.6A1.6 1.6 0 0 0 3 3.4v9.2a1.6 1.6 0 0 0 1.6 1.6h6.8a1.6 1.6 0 0 0 1.6-1.6V5.8z" />
					<path d="M9 1.8v4h4" />
				</>
			)}
			{id === "review" && (
				<>
					<rect x="2.5" y="2.5" width="11" height="11" rx="2" />
					<line x1="8" y1="2.5" x2="8" y2="13.5" />
					<line x1="4.6" y1="8" x2="6" y2="8" />
					<line x1="10" y1="8" x2="11.4" y2="8" />
				</>
			)}
			{id === "terminal" && (
				<>
					<polyline points="4,5 7,8 4,11" />
					<line x1="9" y1="11" x2="12" y2="11" />
				</>
			)}
			{id === "browser" && (
				<>
					<circle cx="8" cy="8" r="5.6" />
					<line x1="2.4" y1="8" x2="13.6" y2="8" />
					<path d="M8 2.4a8.4 8.4 0 0 1 2.2 5.6A8.4 8.4 0 0 1 8 13.6a8.4 8.4 0 0 1-2.2-5.6A8.4 8.4 0 0 1 8 2.4z" />
				</>
			)}
		</svg>
	)
}
