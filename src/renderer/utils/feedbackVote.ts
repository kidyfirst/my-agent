import type { FeedbackKind } from "../../utils/feedback"

/**
 * Client-side vote bookkeeping for one rendered reply.
 *
 * The public counter can only ever be incremented — there is no "undo" call —
 * so the tricky part is not the UI but *when to stay silent*. These two rules
 * live here, away from React, because they are the whole contract:
 *
 *  1. A reply contributes at most one hit, ever. Clicking the same thumb twice
 *     changes nothing.
 *  2. Switching thumbs (👍 then 👎) restyles the pill but sends nothing. A
 *     second hit would inflate both numbers for a single reply.
 */
export interface VoteState {
	voted: FeedbackKind | null
	/** True once a hit has been dispatched for this reply. */
	sent: boolean
}

export interface VoteStep {
	next: VoteState
	/** The counter to bump, or null when this click must stay silent. */
	send: FeedbackKind | null
}

export const INITIAL_VOTE: VoteState = { voted: null, sent: false }

export function applyVote(state: VoteState, kind: FeedbackKind): VoteStep {
	if (state.voted === kind) return { next: state, send: null }
	const send = state.sent ? null : kind
	return { next: { voted: kind, sent: true }, send }
}
