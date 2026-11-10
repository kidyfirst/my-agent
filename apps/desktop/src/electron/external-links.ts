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

export const DOC_EXTENSIONS = [
	".docx",
	".doc",
	".pptx",
	".ppt",
	".xlsx",
	".xls",
	".pdf",
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
	".md",
	".txt",
	".csv",
	".tsv",
]

/**
 * Extracts a Library item ID / filename from a URL or relative path if it points to a document.
 */
export function extractLibraryItemIdFromUrl(
	raw: string,
	rendererOrigin?: string,
): string | null {
	if (!raw) return null
	const lower = raw.toLowerCase().trim()

	// 1. Explicit library: schemes
	if (lower.startsWith("library://")) {
		return decodeURIComponent(raw.slice("library://".length).trim())
	}
	if (lower.startsWith("library:")) {
		return decodeURIComponent(raw.slice("library:".length).trim())
	}

	// 2. Paths with /my-library/
	const myLibIdx = lower.indexOf("/my-library/")
	if (myLibIdx !== -1) {
		return decodeURIComponent(
			raw.slice(myLibIdx + "/my-library/".length).trim(),
		)
	}

	// 3. URLs matching renderer dev server or local paths
	let pathname = raw
	try {
		const parsed = new URL(raw)
		pathname = parsed.pathname
	} catch {}

	const decoded = decodeURIComponent(pathname.replace(/^\/+/, "").trim())
	for (const ext of DOC_EXTENSIONS) {
		if (
			decoded.toLowerCase().endsWith(ext) ||
			decoded.toLowerCase().includes(`${ext}?`) ||
			decoded.toLowerCase().includes(`${ext}#`)
		) {
			const clean = decoded
				.replace(/^.*[\\/]/, "")
				.replace(/\?.*$/, "")
				.replace(/#.*$/, "")
				.trim()
			if (clean) return clean
		}
	}

	return null
}

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
