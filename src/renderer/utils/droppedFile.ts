/**
 * Helpers for files dropped onto the window.
 *
 * Electron 32 removed `File.path`, so a dropped file no longer carries its absolute
 * path. `webUtils.getPathForFile` (exposed through the preload bridge) is the only
 * supported replacement; older builds still have `File.path`, and drag sources such as
 * Finder additionally publish a `file://` URI on the data transfer.
 */

export const RECORDING_EXTENSIONS = [".json", ".jsonl"] as const

export function hasRecordingExtension(value: string): boolean {
	const lower = value.toLowerCase()
	return RECORDING_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Minimal shape of the preload bridge, kept narrow so it is easy to fake in tests. */
export interface PathForFileBridge {
	getPathForFile?: (file: File) => string
}

interface UriDataSource {
	getData?: (format: string) => string
}

function fromUriList(dataTransfer: UriDataSource | null): string {
	if (!dataTransfer?.getData) return ""
	let raw = ""
	try {
		raw =
			dataTransfer.getData("text/uri-list") ||
			dataTransfer.getData("text/plain") ||
			""
	} catch {
		return ""
	}
	for (const line of raw.split(/\r?\n/)) {
		const candidate = line.trim()
		if (!candidate.startsWith("file://")) continue
		try {
			return decodeURIComponent(new URL(candidate).pathname)
		} catch {
			/* ignore malformed URIs and keep looking */
		}
	}
	return ""
}

export function resolveDroppedFilePath(
	file: File,
	dataTransfer: UriDataSource | null,
	bridge?: PathForFileBridge | null,
): string {
	const effectiveBridge =
		bridge === undefined
			? (globalThis as { window?: { api?: PathForFileBridge } }).window?.api
			: bridge

	try {
		const viaBridge = effectiveBridge?.getPathForFile?.(file)
		if (viaBridge) return viaBridge
	} catch {
		/* fall through to the legacy strategies */
	}

	const legacyPath = (file as unknown as { path?: string }).path
	if (legacyPath) return legacyPath

	return fromUriList(dataTransfer)
}
