/**
 * Text representation of a browser page.
 *
 * Provider tools that return an image only work on Anthropic: OpenAI-compatible
 * providers (DeepSeek, most local models) serialise a tool result's `content`
 * branch with `JSON.stringify` into a plain `role: "tool"` string, so a base64
 * screenshot reaches the model as noise and burns a huge number of tokens.
 *
 * A text snapshot works for every model: it carries the visible page text and
 * the numbered interactive elements with their click coordinates. The agent
 * reads the snapshot, then clicks by element id (or by raw coordinate).
 */

export interface PageElement {
	id: number
	tag: string
	label: string
	x: number
	y: number
}

export interface PageSnapshot {
	url: string
	title: string
	text: string
	elements: PageElement[]
	viewport: { width: number; height: number }
}

export const MAX_SNAPSHOT_TEXT = 6000
export const MAX_SNAPSHOT_ELEMENTS = 120

/**
 * Serialises a snapshot into the string the model actually reads. Keeping this
 * a pure function makes the shape testable without launching Chromium.
 */
export function formatPageSnapshot(snapshot: PageSnapshot): string {
	const lines = [
		`URL: ${snapshot.url}`,
		`Title: ${snapshot.title}`,
		`Viewport: ${snapshot.viewport.width}x${snapshot.viewport.height}`,
		"",
		"## Interactive elements (click with `element: <id>`)",
	]

	if (snapshot.elements.length === 0) {
		lines.push("(none visible — the page may still be loading)")
	} else {
		for (const el of snapshot.elements) {
			lines.push(`[${el.id}] <${el.tag}> ${el.label} @ (${el.x}, ${el.y})`)
		}
	}

	lines.push("", "## Visible page text")
	lines.push(snapshot.text || "(empty)")
	lines.push("")
	lines.push(
		"Use `screenshot` again after any action that changes the page: element ids are only valid for the snapshot they came from.",
	)

	return lines.join("\n")
}
