/**
 * Anonymous feedback counters — the thumbs under every assistant reply.
 *
 * There is no backend and no account. A click fires one silent request at a
 * public counter service, which bumps a global number; the same number is
 * rendered in README through a shields.io badge, so what a user bumps in the
 * app is what people see on GitHub.
 *
 * Three deliberate constraints:
 *  - Every request goes through the main process. The renderer window has no
 *    CORS allowance for third-party hosts (the same reason `getRepoStars`
 *    lives in `electron/ipc/repo-handlers.ts`).
 *  - Nobody is identified. The counters are global, so a click means "someone
 *    found this useful", never "you liked this".
 *  - Nothing is persisted locally. A restart shows the pill unvoted again,
 *    which is why the counter — not the client — owns the state.
 */

export type FeedbackKind = "like" | "dislike"

/** Groups both keys under this project on the counter provider. */
const COUNTER_NAMESPACE = "kidyfirst"

/**
 * One key per button. Renaming a key starts its counter over from zero, so
 * treat these strings as schema — they are baked into the README badges too.
 */
export const COUNTER_KEYS: Record<FeedbackKind, string> = {
	like: "my-agent-likes",
	dislike: "my-agent-bad",
}

/** Public, account-free counter service. Answers `{ "value": <number> }`. */
const COUNTER_ORIGIN = "https://abacus.jasoncameron.dev"

/** Resting label of each counter, shared by the button tooltip and the badge. */
export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
	like: "Helpful",
	dislike: "Bad response",
}

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["like", "dislike"]

export function isFeedbackKind(value: unknown): value is FeedbackKind {
	return value === "like" || value === "dislike"
}

/**
 * `hit` bumps the counter and returns the new total; `get` only reads it.
 * Both answer `{ "value": <number> }`, or 404 while a key has never been hit.
 */
export function counterUrl(kind: FeedbackKind, action: "hit" | "get"): string {
	return `${COUNTER_ORIGIN}/${action}/${COUNTER_NAMESPACE}/${COUNTER_KEYS[kind]}`
}

/**
 * README badge for a counter.
 *
 * shields.io reads the counter's JSON through `/get`, so merely rendering the
 * badge never bumps the number — only a real click in the app does. The badge
 * is re-checked every five minutes; without `cacheSeconds` shields would keep
 * a stale value for much longer.
 */
export function badgeUrl(kind: FeedbackKind): string {
	const source = encodeURIComponent(counterUrl(kind, "get"))
	const label = encodeURIComponent(kind === "like" ? "likes" : "bad response")
	// Orange matches the product accent; grey keeps the negative badge quiet.
	const color = kind === "like" ? "FF8C42" : "6b7280"
	return `https://img.shields.io/badge/dynamic/json?url=${source}&query=%24.value&label=${label}&color=${color}&style=flat&cacheSeconds=300`
}

/** The two badge images that README must show, in display order. */
export const FEEDBACK_BADGES: Record<FeedbackKind, string> = {
	like: badgeUrl("like"),
	dislike: badgeUrl("dislike"),
}
