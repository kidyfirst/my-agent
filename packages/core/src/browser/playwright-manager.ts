import {
	chromium,
	type Browser,
	type Page,
	type BrowserContext,
} from "playwright-core"
import { execFile } from "child_process"
import { promisify } from "util"
import {
	type PageElement,
	type PageSnapshot,
	MAX_SNAPSHOT_ELEMENTS,
	MAX_SNAPSHOT_TEXT,
} from "./page-snapshot.js"
import { chromiumFallbacks } from "./chromium-path.js"

const execFileAsync = promisify(execFile)

/** True when Playwright could not find its bundled browser build. */
function isMissingExecutable(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error)
	return (
		msg.includes("Executable doesn't exist") ||
		msg.includes("browserType.launch") ||
		msg.includes("ENOENT")
	)
}

export const DISPLAY_WIDTH = 1024
export const DISPLAY_HEIGHT = 768

/**
 * A frame the host mirrors into its UI so the user can watch what the agent is
 * doing in the browser. JPEG data URL — small enough to send over IPC on every
 * action, unlike a full PNG.
 */
export interface BrowserPreviewFrame {
	dataUrl: string
	url: string
	title: string
	capturedAt: number
}

/** Minimum gap between automatic frames, so a burst of clicks is not a burst of screenshots. */
export const PREVIEW_MIN_INTERVAL_MS = 400

const LAUNCH_ARGS = [
	`--window-size=${DISPLAY_WIDTH},${DISPLAY_HEIGHT}`,
	"--disable-gpu",
	"--no-sandbox",
]

interface RawDomSnapshot {
	url: string
	title: string
	text: string
	elements: PageElement[]
}

/**
 * Manages a single headless Chromium browser instance with a persistent page.
 * Lazily creates the browser on first use and tears it down on close or thread change.
 * Auto-installs Chromium on first launch if not present.
 */
export class PlaywrightBrowserManager {
	private browser: Browser | null = null
	private context: BrowserContext | null = null
	private page: Page | null = null
	private threadId: string | null = null
	private installing: Promise<void> | null = null
	/** Elements from the most recent snapshot, keyed by their 1-based id. */
	private lastElements: PageElement[] = []
	/** Set when launch reused an installed build instead of Playwright's own. */
	private executablePath: string | null = null
	/** Hosts that want live frames (the desktop UI). Empty means capture nothing. */
	private previewListeners = new Set<(frame: BrowserPreviewFrame) => void>()
	private lastPreviewAt = 0
	private previewInFlight = false

	/** Which browser binary is running, for diagnostics. */
	getExecutablePath(): string | null {
		return this.executablePath
	}

	/**
	 * Watch the browser. Listeners receive a JPEG frame after every action the
	 * agent takes. Returns an unsubscribe function.
	 */
	subscribePreview(listener: (frame: BrowserPreviewFrame) => void): () => void {
		this.previewListeners.add(listener)
		return () => {
			this.previewListeners.delete(listener)
		}
	}

	/**
	 * Publish one frame to the preview listeners.
	 *
	 * Screenshots cost real time (~30-60ms), so this does nothing when nobody is
	 * watching, collapses concurrent calls, and throttles bursts. Failures are
	 * swallowed: a preview is a nicety and must never fail a tool call.
	 */
	async publishPreview(
		options: { force?: boolean; minIntervalMs?: number } = {},
	): Promise<void> {
		if (this.previewListeners.size === 0) return
		if (this.previewInFlight) return
		const minInterval = options.minIntervalMs ?? PREVIEW_MIN_INTERVAL_MS
		if (!options.force && Date.now() - this.lastPreviewAt < minInterval) {
			return
		}

		this.previewInFlight = true
		try {
			const page = await this.getPage()
			if (page.isClosed()) return
			const buffer = await page.screenshot({ type: "jpeg", quality: 55 })
			const frame: BrowserPreviewFrame = {
				dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
				url: page.url(),
				title: await page.title().catch(() => ""),
				capturedAt: Date.now(),
			}
			this.lastPreviewAt = frame.capturedAt
			for (const listener of this.previewListeners) {
				try {
					listener(frame)
				} catch {
					// A broken listener must not break the run.
				}
			}
		} catch {
			// Browser gone, page navigating away, screenshot raced a close.
		} finally {
			this.previewInFlight = false
		}
	}

	/** Get (or lazily create) the persistent page. Closes and restarts if threadId changed. */
	async getPage(threadId?: string): Promise<Page> {
		if (threadId && this.threadId && threadId !== this.threadId) {
			await this.close()
		}
		if (this.page && !this.page.isClosed()) {
			return this.page
		}
		this.threadId = threadId ?? null
		this.browser = await this.launchBrowser()
		this.context = await this.browser.newContext({
			viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
			deviceScaleFactor: 1,
		})
		this.page = await this.context.newPage()
		return this.page
	}

	/**
	 * Launch Chromium.
	 *
	 * Playwright pins one exact browser revision, so a machine whose cache holds
	 * a different build fails with "Executable doesn't exist" and falls back to
	 * a ~150MB download while the agent's tool call silently waits. Reusing an
	 * installed build first keeps the first run fast and offline-friendly;
	 * installing is the last resort.
	 */
	private async launchBrowser(): Promise<Browser> {
		const launch = (executablePath?: string) =>
			chromium.launch({
				headless: true,
				args: LAUNCH_ARGS,
				...(executablePath ? { executablePath } : {}),
			})

		try {
			return await launch()
		} catch (error: unknown) {
			if (!isMissingExecutable(error)) throw error
			for (const executablePath of chromiumFallbacks()) {
				try {
					const browser = await launch(executablePath)
					this.executablePath = executablePath
					return browser
				} catch {
					// Try the next candidate before downloading anything.
				}
			}
			await this.installChromium()
			return await launch()
		}
	}

	/** Install Chromium via the Playwright CLI. Deduplicates concurrent calls. */
	private async installChromium(): Promise<void> {
		if (this.installing) return this.installing
		this.installing = (async () => {
			try {
				await execFileAsync("npx", ["playwright", "install", "chromium"], {
					timeout: 5 * 60 * 1000,
				})
			} finally {
				this.installing = null
			}
		})()
		return this.installing
	}

	/** Navigate to a URL. */
	async navigate(url: string): Promise<void> {
		const page = await this.getPage()
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
		this.lastElements = []
	}

	/**
	 * Capture a text snapshot of the current page: visible text plus numbered
	 * interactive elements with their viewport coordinates. This is what the
	 * model reads instead of an image, so it works with text-only providers.
	 */
	async snapshot(): Promise<PageSnapshot> {
		const page = await this.getPage()
		const raw = await page.evaluate((): RawDomSnapshot => {
			const selector = [
				"a[href]",
				"button",
				"input",
				"select",
				"textarea",
				"summary",
				'[role="button"]',
				'[role="link"]',
				'[contenteditable="true"]',
			].join(",")
			const elements: PageElement[] = []
			for (const node of Array.from(document.querySelectorAll(selector))) {
				// Bounds are inlined: page.evaluate serialises the function, so it
				// cannot close over module constants. snapshot() re-applies them.
				if (elements.length >= 120) break
				const rect = node.getBoundingClientRect()
				if (rect.width < 2 || rect.height < 2) continue
				if (rect.bottom < 0 || rect.top > window.innerHeight) continue
				const style = window.getComputedStyle(node)
				if (
					style.visibility === "hidden" ||
					style.display === "none" ||
					Number(style.opacity) === 0
				) {
					continue
				}
				const el = node as HTMLElement
				const label = (
					el.getAttribute("aria-label") ||
					el.getAttribute("placeholder") ||
					(el as HTMLInputElement).value ||
					el.getAttribute("title") ||
					el.innerText ||
					el.getAttribute("href") ||
					""
				)
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, 100)
				elements.push({
					id: elements.length + 1,
					tag: el.tagName.toLowerCase(),
					label: label || "(unlabelled)",
					x: Math.round(rect.left + rect.width / 2),
					y: Math.round(rect.top + rect.height / 2),
				})
			}
			return {
				url: location.href,
				title: document.title,
				text: (document.body?.innerText || "").slice(0, 6000),
				elements,
			}
		})

		const elements = raw.elements.slice(0, MAX_SNAPSHOT_ELEMENTS)
		this.lastElements = elements
		return {
			url: raw.url,
			title: raw.title,
			text: raw.text.slice(0, MAX_SNAPSHOT_TEXT),
			elements,
			viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
		}
	}

	/** Resolve an element id from the last snapshot into click coordinates. */
	getElementCenter(id: number): { x: number; y: number } | null {
		const el = this.lastElements.find((candidate) => candidate.id === id)
		return el ? { x: el.x, y: el.y } : null
	}

	/** Take a screenshot, return base64 JPEG (much smaller than PNG for token efficiency). */
	async screenshot(): Promise<string> {
		const page = await this.getPage()
		const buffer = await page.screenshot({
			type: "jpeg",
			quality: 55,
			fullPage: false,
		})
		return buffer.toString("base64")
	}

	/** Clean up all resources. */
	async close(): Promise<void> {
		try {
			await this.page?.close()
		} catch {}
		try {
			await this.context?.close()
		} catch {}
		try {
			await this.browser?.close()
		} catch {}
		this.page = null
		this.context = null
		this.browser = null
		this.threadId = null
		this.lastElements = []
		this.executablePath = null
	}

	isActive(): boolean {
		return this.browser !== null && this.page !== null && !this.page.isClosed()
	}
}
