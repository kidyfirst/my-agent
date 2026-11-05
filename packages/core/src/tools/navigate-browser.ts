import { createTool } from "../core/index.js"
import { z } from "zod"
import type { PlaywrightBrowserManager } from "../browser/playwright-manager.js"
import { formatPageSnapshot } from "../browser/page-snapshot.js"

export function createNavigateBrowserTool(
	browserManager: PlaywrightBrowserManager,
) {
	return createTool({
		id: "navigate-browser",
		description: [
			"Open a URL in the persistent headless Chromium browser and return a text",
			"snapshot of the page (visible text plus numbered interactive elements).",
			"Use `computer` afterwards to click, type and scroll. The browser keeps its",
			"state across calls, so navigate once and then interact with `computer`.",
		].join(" "),
		inputSchema: z.object({
			url: z.string().describe("The URL to navigate to (http/https)"),
		}),
		outputSchema: z.string(),
		execute: async ({ url }) => {
			try {
				await browserManager.navigate(url)
				const snapshot = await browserManager.snapshot()
				// A plain string becomes `{ type: "text" }` in the model message;
				// an object would be JSON.stringify-ed with escaped newlines.
				return formatPageSnapshot(snapshot)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				return `Navigation to ${url} failed: ${message}`
			} finally {
				// A navigation is the most interesting moment to mirror: publish
				// immediately instead of waiting out the throttle window.
				void browserManager.publishPreview({ force: true })
			}
		},
	})
}
