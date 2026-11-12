/**
 * The worktree mark: three nodes and the branch that joins them — the trunk on
 * the left, a second node up to the right, its line curving back into the
 * trunk. Shared by the sidebar row and the "New worktree" menu item so both
 * read as the same thing.
 *
 * The branch line is drawn *into* the trunk (rather than stopping short, as a
 * generic git icon does) because at 13px a detached curve collapses into a
 * comma-like blob and the shape stops reading as a fork at all.
 *
 * `filled` fills the three nodes: the sidebar uses it to say "this worktree is
 * open, its sessions are listed", the menu leaves the nodes as rings.
 */
export function WorktreeGlyph({
	size = 13,
	color = "currentColor",
	filled = false,
	style,
}: {
	size?: number
	color?: string
	filled?: boolean
	style?: React.CSSProperties
}) {
	const node = filled ? color : "none"
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ display: "block", flexShrink: 0, ...style }}
		>
			{/* Trunk between the two left nodes. */}
			<path d="M6 9v6" />
			{/* Branch from the right node, curving into the trunk's foot. */}
			<path d="M18 7.5v2.2c0 3.6-2.6 6.3-6.3 6.3H8.9" />
			<circle cx="6" cy="6" r="3" fill={node} />
			<circle cx="18" cy="6" r="3" fill={node} />
			<circle cx="6" cy="18" r="3" fill={node} />
		</svg>
	)
}
