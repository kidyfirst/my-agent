/**
 * Utility to trigger opening a project file in an editor tab in the current session window.
 */
export function openFileTab(filePath: string): void {
	if (!filePath) return
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("open-file-tab", { detail: { filePath } }),
		)
	}
}
