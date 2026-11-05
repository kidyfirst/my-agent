/**
 * Real-browser smoke test for web-level computer use.
 * Serves a local HTML page, then drives PlaywrightBrowserManager +
 * navigate-browser / computer tools end to end.
 *
 * Run: npx tsx packages/core/scripts/browser-smoke.ts
 */
import http from "http"
import { PlaywrightBrowserManager } from "../src/browser/playwright-manager.js"
import { createNavigateBrowserTool } from "../src/tools/navigate-browser.js"
import { createComputerUseTool } from "../src/tools/computer-use.js"

const HTML = `<!doctype html>
<html><head><title>Smoke Page</title></head>
<body>
  <h1>Computer Use Smoke Test</h1>
  <p id="status">waiting</p>
  <input id="field" placeholder="type here" />
  <button id="btn" onclick="document.getElementById('status').textContent='clicked:' + document.getElementById('field').value">Submit</button>
  <a href="#link" id="link">A link</a>
</body></html>`

function startServer(): Promise<{ url: string; close: () => void }> {
	return new Promise((resolve) => {
		const server = http.createServer((_req, res) => {
			res.writeHead(200, { "content-type": "text/html" })
			res.end(HTML)
		})
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as { port: number }
			resolve({
				url: `http://127.0.0.1:${addr.port}`,
				close: () => server.close(),
			})
		})
	})
}

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
	if (cond) {
		console.log(`  PASS  ${name}`)
	} else {
		failures++
		console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
	}
}

/** Pull `[id] <tag> label` lines out of a formatted snapshot. */
function extractElementId(
	snapshot: string,
	tag: string,
	labelPart: string,
): number {
	for (const line of snapshot.split("\n")) {
		const m = line.match(/^\[(\d+)\] <(\w+)> (.*)$/)
		if (m && m[2] === tag && m[3]!.includes(labelPart)) return Number(m[1])
	}
	return -1
}

async function main() {
	console.log("== browser smoke ==")
	const { url, close } = await startServer()
	const manager = new PlaywrightBrowserManager()
	const navigate = createNavigateBrowserTool(manager)
	const computer = createComputerUseTool(manager)

	try {
		// 1. navigate returns a text snapshot
		const nav = (await navigate.execute({ url })) as unknown as string
		check(
			"navigate returns text snapshot",
			typeof nav === "string" && nav.includes("Computer Use Smoke Test"),
			String(nav).slice(0, 120),
		)
		check(
			"snapshot lists interactive elements",
			nav.includes("[1]") &&
				nav.includes("Submit") &&
				nav.includes("type here"),
		)

		// 2. screenshot re-snapshots, element ids resolve
		const shot = (await computer.execute({
			action: "screenshot",
		})) as unknown as string
		check(
			"screenshot returns snapshot",
			typeof shot === "string" && shot.includes("Smoke Page"),
		)

		// 3. click the input, then type into it
		const inputId = extractElementId(shot, "input", "type here")
		check("found input element id", inputId > 0, `got ${inputId}`)
		await computer.execute({ action: "left_click", element: inputId })
		const typed = (await computer.execute({
			action: "type",
			text: "hello agent",
		})) as unknown as string
		check("type ok", typeof typed === "string" && typed.includes("ok"))

		// 4. click Submit, verify the click handler ran
		const btnId = extractElementId(shot, "button", "Submit")
		check("found button element id", btnId > 0, `got ${btnId}`)
		await computer.execute({ action: "left_click", element: btnId })
		const after = (await computer.execute({
			action: "screenshot",
		})) as unknown as string
		check(
			"click submitted typed value",
			after.includes("clicked:hello agent"),
			after.slice(0, 300),
		)

		// 5. a stale element id is rejected gracefully
		await navigate.execute({ url })
		const stale = (await computer.execute({
			action: "left_click",
			element: 999,
		})) as unknown as string
		check(
			"stale element id handled",
			typeof stale === "string" && stale.includes("not in the latest snapshot"),
			String(stale).slice(0, 120),
		)

		// 6. coordinate clicks work too
		const fresh = (await computer.execute({
			action: "screenshot",
		})) as unknown as string
		const btnId2 = extractElementId(fresh, "button", "Submit")
		const resolved = manager.getElementCenter(btnId2)
		check("getElementCenter resolves", resolved !== null)
		if (resolved) {
			const drag = (await computer.execute({
				action: "double_click",
				coordinate: [resolved.x, resolved.y],
			})) as unknown as string
			check("coordinate click ok", drag.includes("ok"))
		}

		check(
			"launched a real chromium build",
			manager.isActive(),
			String(manager.getExecutablePath() ?? "playwright default"),
		)

		// 7. the preview mirror: a subscriber receives JPEG frames after actions
		const frames: Array<{ dataUrl: string; url: string; title: string }> = []
		const unsubscribe = manager.subscribePreview((frame) => frames.push(frame))
		let releaseFirst: (() => void) | null = null
		const firstFrame = new Promise<void>((resolve) => {
			releaseFirst = resolve
			setTimeout(resolve, 5000)
		})
		const unsubscribeWait = manager.subscribePreview(() => releaseFirst?.())
		await computer.execute({ action: "left_click", element: btnId2 })
		await firstFrame
		unsubscribe()
		unsubscribeWait()
		check(
			"preview frames are published",
			frames.length > 0,
			`got ${frames.length}`,
		)
		check(
			"frame carries a jpeg data url",
			frames[0]?.dataUrl.startsWith("data:image/jpeg;base64,") ?? false,
		)
		check(
			"frame carries the page url",
			(frames[0]?.url ?? "").startsWith("http://127.0.0.1:"),
			frames[0]?.url,
		)

		console.log(
			failures === 0
				? "\nALL SMOKE CHECKS PASSED"
				: `\n${failures} CHECK(S) FAILED`,
		)
	} finally {
		// Teardown is best-effort: a stuck browser close must not hide the result.
		await Promise.race([
			manager.close().finally(close),
			new Promise((resolve) => setTimeout(resolve, 5000)),
		])
	}
	// A dangling Chromium handle keeps the event loop alive after the checks
	// are done, so exit explicitly instead of waiting for a graceful teardown.
	process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
	console.error("smoke crashed:", e)
	process.exit(1)
})
