/**
 * Log glyph: a page with a folded corner and two text lines.
 *
 * Shared by the developer Logging row in the sidebar and the log console's
 * title tile so both read as the same entry point. Drawn at 1.5px like the
 * Agents robot so those rows sit on the same optical weight — the literal
 * "LOG" lettering of the reference icon collapses into a blob at 16px.
 *
 * A tile icon is drawn smaller (13px), so pass a thicker `strokeWidth` there
 * to keep the same visual weight.
 */
export function LogIcon({
	size = 16,
	strokeWidth = 1.5,
}: {
	size?: number
	strokeWidth?: number
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0 }}
			aria-hidden="true"
		>
			<path d="M14.25 3.25H7A2.25 2.25 0 0 0 4.75 5.5v13A2.25 2.25 0 0 0 7 20.75h10a2.25 2.25 0 0 0 2.25-2.25V8.25z" />
			<path d="M14.25 3.25V8.25H19.25" />
			<path d="M8.5 12.5h7" />
			<path d="M8.5 16h4.5" />
		</svg>
	)
}
