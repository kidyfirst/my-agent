/**
 * Everything the sidebar's community banner points at.
 *
 * Kept out of the component so the strings and URLs can be asserted without
 * rendering, and so a fork only has to change this file.
 */

export const REPO_OWNER = "kidyfirst"
export const REPO_NAME = "my-agent"
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`
export const APP_NAME = "MyAgent"

/** Prefilled copy for every share target — short, factual, no marketing voice. */
export const SHARE_TITLE = `${APP_NAME} — build software by talking to it. Open source, local-first, runs on your machine.`

/** Account the tweet is attributed to (`via=` in the share.js template). */
export const SHARE_ORIGIN = REPO_OWNER

export type ShareTargetId = "wechat" | "facebook" | "twitter" | "whatsapp"

export interface ShareTarget {
	id: ShareTargetId
	label: string
	/** Where to open the share dialog. Absent for targets that only copy. */
	href?: string
	/** Short description shown as the button tooltip. */
	hint: string
}

/**
 * The four share destinations, following the `share.js` social templates
 * (https://github.com/overtrue/share.js — `{{URL}}`, `{{TITLE}}`, `{{ORIGIN}}`
 * resolved here).
 *
 * Two deliberate departures from that file: Google+ (`plus.google.com`) was
 * shut down in 2019, so the last slot is WhatsApp; and WeChat's template is
 * `javascript:` (the library pops a QR dialog), which a desktop app cannot hand
 * to a browser, so that row copies the link instead.
 */
export function shareTargets(
	url: string = REPO_URL,
	title: string = SHARE_TITLE,
	origin: string = SHARE_ORIGIN,
): ShareTarget[] {
	const e = encodeURIComponent
	return [
		{
			id: "wechat",
			label: "WeChat",
			hint: "Copy the link for WeChat",
		},
		{
			id: "facebook",
			label: "Facebook",
			hint: "Share on Facebook",
			href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
		},
		{
			id: "twitter",
			label: "X",
			hint: "Post on X",
			href: `https://twitter.com/intent/tweet?text=${e(title)}&url=${e(url)}&via=${e(origin)}`,
		},
		{
			id: "whatsapp",
			label: "WhatsApp",
			hint: "Send on WhatsApp",
			href: `https://wa.me/?text=${e(`${title} ${url}`)}`,
		},
	]
}

/**
 * The ceiling of each star band. Exported because the banner falls back to
 * `under100` when the count cannot be read at all — a badge that silently
 * vanishes (offline, GitHub blocked, main process not restarted yet) reads as
 * a broken button, and the lowest band is the honest floor for a young repo.
 */
export const STAR_TIERS = {
	under100: "99+",
	under1000: "999+",
	over1000: "1k+",
} as const

/**
 * Star count as a tier badge, not an exact number.
 *
 * The banner is a nudge, not a dashboard: "99+" reads as momentum, while "7"
 * reads as a project nobody uses yet — and a live number invites people to
 * watch it move instead of clicking. So the button only ever reports the
 * ceiling of the band the repository currently sits in:
 *
 *   < 100        → "99+"
 *   < 1 000      → "999+"
 *   ≥ 1 000      → "1k+"
 *
 * Returns null when the count is unknown (offline, rate-limited, bad payload)
 * so the button can drop the number and keep just the star.
 */
export function formatStarCount(
	count: number | null | undefined,
): string | null {
	if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
		return null
	}
	if (count < 100) return STAR_TIERS.under100
	if (count < 1000) return STAR_TIERS.under1000
	return STAR_TIERS.over1000
}

/** Position for a popover anchored under an element, kept inside the window. */
export function anchoredLeft(
	rect: { left: number; width: number },
	panelWidth: number,
	windowWidth: number,
	margin = 8,
): number {
	const centered = rect.left + rect.width / 2 - panelWidth / 2
	const max = Math.max(margin, windowWidth - panelWidth - margin)
	return Math.min(Math.max(margin, centered), max)
}
