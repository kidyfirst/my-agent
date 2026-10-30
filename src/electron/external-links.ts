/**
 * Which links belong to the operating system instead of the app.
 *
 * The app used to hand every `window.open` / external navigation to its own
 * browser tab. That is the wrong default: a link in a chat answer, a settings
 * hint or the docs is something the user expects to land in the browser they
 * already use, with their session and extensions.
 *
 * The in-app browser stays available for what it is good at — previewing a dev
 * server — but only when the user asks for it explicitly.
 */

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

/**
 * Normalized URL to hand to the OS, or null when it should stay inside the app
 * (or be dropped): malformed input, `file:`, `javascript:` and friends.
 */
export function parseExternalUrl(raw: string): string | null {
	if (!raw) return null
	let parsed: URL
	try {
		parsed = new URL(raw)
	} catch {
		return null
	}
	if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null
	return parsed.toString()
}
