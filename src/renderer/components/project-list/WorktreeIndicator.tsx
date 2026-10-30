import { WorktreeGlyph } from "./WorktreeGlyph"

/**
 * Worktree mark on a sidebar worktree row.
 *
 * It used to be a plain colour dot, which said "this is a worktree" to nobody:
 * the shape carried no meaning and only the fill was modulated for state. The
 * row now shows the fork glyph the "New worktree" menu item uses, so the shape
 * itself identifies a worktree, and the fill of its three nodes carries the
 * fold state the way the folder glyph carries it on a project row:
 *
 *   expanded  -> solid nodes (the branch is "open", its sessions are listed)
 *   collapsed -> hollow nodes (rings: closed)
 *
 * The colour stays the per-worktree hue (same one as the row's left accent),
 * and the live states are kept: a pulse while an agent runs in this worktree,
 * a soft glow while it holds unread output.
 */
export function WorktreeIndicator({
	color,
	isSpinning,
	isGlowing,
	expanded,
	size = 13,
}: {
	color: string
	isSpinning: boolean
	isGlowing: boolean
	expanded: boolean
	size?: number
}) {
	return (
		<WorktreeGlyph
			size={size}
			color={color}
			filled={expanded}
			style={{
				// Unread worktrees keep the halo the old dot had, just on the
				// glyph instead of a box-shadow.
				filter: isGlowing ? `drop-shadow(0 0 3px ${color})` : undefined,
				animation: isSpinning ? "wt-busy 1.1s ease-in-out infinite" : undefined,
			}}
		/>
	)
}
