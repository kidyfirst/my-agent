import type { IpcCommandHandler } from "./types.js"
import { counterUrl, isFeedbackKind } from "../../utils/feedback.js"
import type { FeedbackKind } from "../../utils/feedback.js"

/**
 * Counter clicks are fire-and-forget from the UI's point of view, so a dead
 * network must not leave a promise (and its socket) hanging forever.
 */
const REQUEST_TIMEOUT_MS = 8000

/**
 * `get` exists only for the resting tooltip, and every rendered reply shares
 * one global number — caching it here turns N messages into one request.
 * `hit` never reads this cache: its whole point is the fresh total.
 */
const GET_TTL_MS = 60 * 1000

const lastKnown = new Map<FeedbackKind, { value: number; at: number }>()

async function readCounter(url: string): Promise<number | null> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: { accept: "application/json" },
		})
		if (!res.ok) return null
		const data = (await res.json()) as { value?: unknown }
		return typeof data.value === "number" ? data.value : null
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Anonymous like / bad-response counters.
 *
 * The provider only ever increments, so the client is responsible for sending
 * at most one `hit` per rendered reply (see `MessageFeedback`). Every failure
 * path resolves to `{ value: null }` rather than throwing — a blocked network
 * degrades the button to a purely local highlight instead of an error.
 */
export function getFeedbackHandlers(): Record<string, IpcCommandHandler> {
	return {
		feedbackCounter: async (command: { kind?: unknown; action?: unknown }) => {
			const kind = command?.kind
			if (!isFeedbackKind(kind)) return { value: null }

			const action = command?.action === "get" ? "get" : "hit"

			if (action === "get") {
				const cached = lastKnown.get(kind)
				if (cached && Date.now() - cached.at < GET_TTL_MS) {
					return { value: cached.value, cached: true }
				}
			}

			const value = await readCounter(counterUrl(kind, action))
			if (value !== null) {
				lastKnown.set(kind, { value, at: Date.now() })
				return { value }
			}

			// A failed bump must not resurrect a stale total: the UI keeps
			// whatever it optimistically decided to show.
			return {
				value: action === "get" ? (lastKnown.get(kind)?.value ?? null) : null,
			}
		},
	}
}
