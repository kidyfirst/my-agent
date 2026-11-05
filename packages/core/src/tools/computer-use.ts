import { createTool } from "../core/index.js"
import { z } from "zod"
import type { PlaywrightBrowserManager } from "../browser/playwright-manager.js"
import {
	formatPageSnapshot,
	type PageSnapshot,
} from "../browser/page-snapshot.js"
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from "../browser/playwright-manager.js"

/** Map xdotool-style key names to Playwright key names. */
const KEY_MAP: Record<string, string> = {
	Return: "Enter",
	BackSpace: "Backspace",
	space: " ",
	Page_Up: "PageUp",
	Page_Down: "PageDown",
	Up: "ArrowUp",
	Down: "ArrowDown",
	Left: "ArrowLeft",
	Right: "ArrowRight",
	super: "Meta",
	ctrl: "Control",
	alt: "Alt",
	shift: "Shift",
}

function mapKey(key: string): string {
	return key
		.split("+")
		.map((k) => KEY_MAP[k] || k)
		.join("+")
}

const ACTIONS = [
	"screenshot",
	"left_click",
	"right_click",
	"double_click",
	"triple_click",
	"middle_click",
	"left_click_drag",
	"left_mouse_down",
	"left_mouse_up",
	"mouse_move",
	"type",
	"key",
	"hold_key",
	"scroll",
	"zoom",
	"cursor_position",
	"wait",
] as const

const computerInputSchema = z.object({
	action: z.enum(ACTIONS).describe("The browser action to perform"),
	element: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Element id from the latest screenshot snapshot"),
	coordinate: z
		.array(z.number())
		.min(2)
		.max(2)
		.optional()
		.describe(`Target point [x, y] within ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}`),
	start_coordinate: z
		.array(z.number())
		.min(2)
		.max(2)
		.optional()
		.describe("Drag start point [x, y] for left_click_drag"),
	text: z
		.string()
		.optional()
		.describe("Text for `type`, or a key combo like 'ctrl+a' / 'Return'"),
	scroll_direction: z
		.enum(["up", "down", "left", "right"])
		.optional()
		.describe("Direction for `scroll`"),
	scroll_amount: z
		.number()
		.min(1)
		.max(10)
		.optional()
		.describe("Scroll steps for `scroll` (default 3)"),
	duration: z
		.number()
		.min(0)
		.max(60)
		.optional()
		.describe("Seconds for `wait`, or milliseconds for `hold_key`"),
	region: z
		.array(z.number())
		.min(4)
		.max(4)
		.optional()
		.describe("Region [x1, y1, x2, y2] for `zoom`"),
})

type ComputerInput = z.infer<typeof computerInputSchema>

/**
 * Every provider sees this tool as an ordinary function tool.
 *
 * It used to be `anthropic.tools.computer_20251124`, a provider-defined tool:
 * OpenAI-compatible providers silently drop those (they only push a warning in
 * `prepareTools`), so DeepSeek and friends never even knew browser control
 * existed. Provider-defined tools are also returned untouched by
 * `toModelTool`, which meant `computer` bypassed the approval gate and the
 * `tool_start` / `tool_end` events entirely.
 *
 * The other half of the change is what `screenshot` returns. Images cannot be
 * sent back through a tool result on OpenAI-compatible providers — the whole
 * `content` branch is `JSON.stringify`-ed into a `role: "tool"` string — so the
 * model gets a text snapshot instead: visible page text plus numbered
 * interactive elements with their click coordinates. Any model can use it,
 * vision support is not required.
 *
 * The human watching the run gets a different channel: every action publishes a
 * JPEG frame through `browserManager.publishPreview()`, which the desktop app
 * mirrors in a floating panel and an optional pop-out window.
 */
export function createComputerUseTool(
	browserManager: PlaywrightBrowserManager,
) {
	const renderSnapshot = async (): Promise<string> => {
		const snapshot: PageSnapshot = await browserManager.snapshot()
		return formatPageSnapshot(snapshot)
	}

	const perform = async (input: ComputerInput): Promise<string> => {
		const page = await browserManager.getPage()

		// A screenshot is the only action that always produces a full snapshot.
		if (input.action === "screenshot") return renderSnapshot()

		const resolved =
			input.element != null
				? browserManager.getElementCenter(input.element)
				: null
		if (input.element != null && !resolved) {
			return `Element ${input.element} is not in the latest snapshot. Call \`screenshot\` again to refresh element ids.`
		}
		const point: [number, number] | undefined = resolved
			? [resolved.x, resolved.y]
			: input.coordinate
				? [input.coordinate[0]!, input.coordinate[1]!]
				: undefined

		const ok = "ok. Call `screenshot` to see the updated page."
		const needPoint =
			"Provide `element` (id from the latest screenshot) or `coordinate: [x, y]`."

		switch (input.action) {
			case "left_click":
				if (!point) return needPoint
				await page.mouse.click(point[0], point[1])
				return ok

			case "right_click":
				if (!point) return needPoint
				await page.mouse.click(point[0], point[1], { button: "right" })
				return ok

			case "double_click":
				if (!point) return needPoint
				await page.mouse.dblclick(point[0], point[1])
				return ok

			case "triple_click":
				if (!point) return needPoint
				await page.mouse.click(point[0], point[1], { clickCount: 3 })
				return ok

			case "middle_click":
				if (!point) return needPoint
				await page.mouse.click(point[0], point[1], { button: "middle" })
				return ok

			case "left_click_drag": {
				const start = input.start_coordinate
				if (!point || !start) {
					return "Provide `start_coordinate: [x, y]` and a target via `element` or `coordinate`."
				}
				await page.mouse.move(start[0]!, start[1]!)
				await page.mouse.down()
				await page.mouse.move(point[0], point[1])
				await page.mouse.up()
				return ok
			}

			case "left_mouse_down":
				if (point) await page.mouse.move(point[0], point[1])
				await page.mouse.down()
				return ok

			case "left_mouse_up":
				if (point) await page.mouse.move(point[0], point[1])
				await page.mouse.up()
				return ok

			case "mouse_move":
				if (!point) return needPoint
				await page.mouse.move(point[0], point[1])
				return ok

			case "type":
				if (!input.text) return "Provide `text` to type."
				await page.keyboard.type(input.text, { delay: 12 })
				return ok

			case "key":
				if (!input.text) return "Provide `text` as a key name or combo."
				await page.keyboard.press(mapKey(input.text))
				return ok

			case "hold_key":
				if (!input.text) return "Provide `text` as a key name."
				await page.keyboard.down(mapKey(input.text))
				await page.waitForTimeout(input.duration ?? 500)
				await page.keyboard.up(mapKey(input.text))
				return ok

			case "scroll": {
				if (point) await page.mouse.move(point[0], point[1])
				const amount = (input.scroll_amount ?? 3) * 100
				const direction = input.scroll_direction ?? "down"
				const deltaX =
					direction === "left" ? -amount : direction === "right" ? amount : 0
				const deltaY =
					direction === "up" ? -amount : direction === "down" ? amount : 0
				await page.mouse.wheel(deltaX, deltaY)
				await page.waitForTimeout(300)
				return ok
			}

			case "zoom": {
				if (!input.region) {
					return "Provide `region: [x1, y1, x2, y2]`."
				}
				const [x1, y1, x2, y2] = input.region
				const snapshot = await browserManager.snapshot()
				const inRegion = snapshot.elements.filter(
					(el) =>
						el.x >= (x1 ?? 0) &&
						el.x <= (x2 ?? 0) &&
						el.y >= (y1 ?? 0) &&
						el.y <= (y2 ?? 0),
				)
				if (inRegion.length === 0) {
					return "No interactive elements in that region. Use `screenshot` for the full page."
				}
				return inRegion
					.map(
						(el) => `[${el.id}] <${el.tag}> ${el.label} @ (${el.x}, ${el.y})`,
					)
					.join("\n")
			}

			case "cursor_position":
				return "Cursor position is not tracked in headless mode. Use `element` or `coordinate` to target clicks."

			case "wait":
				await page.waitForTimeout((input.duration ?? 1) * 1000)
				return "ok. Finished waiting."

			default:
				return `Unknown action: ${(input as { action?: string }).action}`
		}
	}

	return createTool({
		id: "computer",
		description: [
			"Control a persistent headless Chromium browser (1024x768 viewport).",
			`Call \`navigate-browser\` first to open a URL, then \`screenshot\` to read the page.`,
			"`screenshot` returns a TEXT snapshot: page text and numbered interactive",
			"elements with their coordinates — there is no image to look at.",
			"Click an element with `element: <id>` (preferred) or `coordinate: [x, y]`.",
			"Element ids are only valid for the snapshot they came from: take a new",
			"`screenshot` after any action that changes the page.",
			"`type` writes into the currently focused element; click an input first.",
		].join(" "),
		inputSchema: computerInputSchema,
		execute: async (input) => {
			try {
				return await perform(input)
			} finally {
				// Mirror the browser into the host UI. Fire-and-forget: the tool result
				// must never wait on a screenshot.
				void browserManager.publishPreview()
			}
		},
	})
}

/** Tool names the desktop host injects; also used by the prompt builder. */
export const BROWSER_TOOL_NAMES = ["navigate-browser", "computer"] as const
