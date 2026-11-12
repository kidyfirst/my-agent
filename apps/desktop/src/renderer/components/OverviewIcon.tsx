import type { OverviewAction } from "../utils/overviewMenu"
import { Icon } from "./Icon"

/**
 * One icon per Overview destination, shared by the title-bar dropdown and the
 * sidebar list so a panel never gets two different glyphs. Thin strokes keep
 * the list quiet; colour comes from `currentColor` so both hosts stay muted.
 */
export function OverviewIcon({
	id,
	size = 14,
	strokeWidth = 1.1,
}: {
	id: OverviewAction
	size?: number
	strokeWidth?: number
}) {
	return (
		<Icon size={size} strokeWidth={strokeWidth} viewBox="0 0 16 16">
			{id === "files" && (
				<>
					<path d="M9 1.8H4.6A1.6 1.6 0 0 0 3 3.4v9.2a1.6 1.6 0 0 0 1.6 1.6h6.8a1.6 1.6 0 0 0 1.6-1.6V5.8z" />
					<path d="M9 1.8v4h4" />
				</>
			)}
			{id === "review" && (
				<>
					<path d="M3 6.5v6.3a1.2 1.2 0 0 0 1.2 1.2H9" />
					<path d="M6.7 2h3.8L13.5 5v5.3a1.2 1.2 0 0 1-1.2 1.2H6.7A1.2 1.2 0 0 1 5.5 10.3V3.2A1.2 1.2 0 0 1 6.7 2z" />
					<line x1="8.2" y1="5.5" x2="10.8" y2="5.5" />
					<line x1="9.5" y1="4.2" x2="9.5" y2="6.8" />
					<line x1="8.2" y1="8.7" x2="10.8" y2="8.7" />
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
		</Icon>
	)
}
