/**
 * Utility to trigger opening the Library item preview modal from anywhere in the app.
 */
export function openLibraryPreview(itemId: string): void {
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("open-library-preview", { detail: { itemId } }),
		)
	}
}
