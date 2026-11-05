export interface PanelSizeIconProps {
	/** Maximized: the glyph points inward (restore). Otherwise outward. */
	maximized: boolean
	size?: number
}

/**
 * Panel size glyph: four corner brackets.
 *
 * Outward corners mean "grow to fill", inward corners mean "shrink back" —
 * the same pairing macOS and VS Code use for their maximize controls, so the
 * icon's direction always describes what the click will do.
 */
export function PanelSizeIcon({ maximized, size = 16 }: PanelSizeIconProps) {
	const d = maximized
		? // Brackets pulled inward: restoring shrinks the panel back.
			"M6.5 2.5 V6.5 H2.5 M9.5 2.5 V6.5 H13.5 M13.5 9.5 H9.5 V13.5 M6.5 13.5 V9.5 H2.5"
		: // Brackets pushed outward: maximizing grows the panel to the edge.
			"M2.5 6.5 V2.5 H6.5 M9.5 2.5 H13.5 V6.5 M13.5 9.5 V13.5 H9.5 M6.5 13.5 H2.5 V9.5"

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0, display: "block" }}
		>
			<path d={d} />
		</svg>
	)
}
