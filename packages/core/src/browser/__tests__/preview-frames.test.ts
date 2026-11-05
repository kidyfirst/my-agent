import { describe, expect, it, vi } from "vitest"
import {
	PlaywrightBrowserManager,
	PREVIEW_MIN_INTERVAL_MS,
	type BrowserPreviewFrame,
} from "../playwright-manager.js"

/**
 * The preview path must be invisible to the agent run: no page, no listeners or
 * a throwing listener may never surface as a tool failure.
 */
function managerWithFakePage(options: { failScreenshot?: boolean } = {}) {
	const manager = new PlaywrightBrowserManager()
	let screenshots = 0

	const page = {
		isClosed: () => false,
		url: () => "https://example.com/pricing",
		title: async () => "Pricing",
		screenshot: async () => {
			screenshots += 1
			if (options.failScreenshot) throw new Error("Target closed")
			return Buffer.from("fake-jpeg")
		},
	}

	// Only the page is faked; everything else in the manager stays real.
	;(manager as unknown as { getPage: () => Promise<unknown> }).getPage =
		async () => page

	return { manager, screenshotCount: () => screenshots }
}

describe("browser preview frames", () => {
	it("does nothing when nobody is watching", async () => {
		const { manager, screenshotCount } = managerWithFakePage()
		await manager.publishPreview()
		expect(screenshotCount()).toBe(0)
	})

	it("publishes a jpeg data url with the page url and title", async () => {
		const { manager } = managerWithFakePage()
		const frames: BrowserPreviewFrame[] = []
		manager.subscribePreview((frame) => frames.push(frame))

		await manager.publishPreview()

		expect(frames).toHaveLength(1)
		expect(frames[0]!.dataUrl).toBe(
			`data:image/jpeg;base64,${Buffer.from("fake-jpeg").toString("base64")}`,
		)
		expect(frames[0]!.url).toBe("https://example.com/pricing")
		expect(frames[0]!.title).toBe("Pricing")
		expect(frames[0]!.capturedAt).toBeGreaterThan(0)
	})

	it("throttles bursts of actions into one frame", async () => {
		const { manager, screenshotCount } = managerWithFakePage()
		const frames: BrowserPreviewFrame[] = []
		manager.subscribePreview((frame) => frames.push(frame))

		await manager.publishPreview()
		await manager.publishPreview()
		await manager.publishPreview()

		expect(screenshotCount()).toBe(1)
		expect(frames).toHaveLength(1)
	})

	it("force bypasses the throttle window", async () => {
		const { manager, screenshotCount } = managerWithFakePage()
		manager.subscribePreview(() => {})

		await manager.publishPreview()
		await manager.publishPreview({ force: true })

		expect(screenshotCount()).toBe(2)
	})

	it("respects a custom throttle window", async () => {
		const { manager, screenshotCount } = managerWithFakePage()
		manager.subscribePreview(() => {})

		await manager.publishPreview({ minIntervalMs: 0 })
		await manager.publishPreview({ minIntervalMs: 0 })

		expect(screenshotCount()).toBe(2)
		// Sanity: the default window is the reason the plain path was throttled.
		expect(PREVIEW_MIN_INTERVAL_MS).toBeGreaterThan(0)
	})

	it("collapses concurrent captures", async () => {
		const { manager, screenshotCount } = managerWithFakePage()
		manager.subscribePreview(() => {})

		await Promise.all([
			manager.publishPreview({ force: true }),
			manager.publishPreview({ force: true }),
			manager.publishPreview({ force: true }),
		])

		expect(screenshotCount()).toBe(1)
	})

	it("stops delivering after unsubscribe", async () => {
		const { manager } = managerWithFakePage()
		const listener = vi.fn()
		const unsubscribe = manager.subscribePreview(listener)

		await manager.publishPreview()
		unsubscribe()
		await manager.publishPreview({ force: true })

		expect(listener).toHaveBeenCalledTimes(1)
	})

	it("keeps notifying other listeners when one throws", async () => {
		const { manager } = managerWithFakePage()
		const healthy = vi.fn()
		manager.subscribePreview(() => {
			throw new Error("renderer gone")
		})
		manager.subscribePreview(healthy)

		await expect(manager.publishPreview()).resolves.toBeUndefined()
		expect(healthy).toHaveBeenCalledTimes(1)
	})

	it("swallows a screenshot failure", async () => {
		const { manager } = managerWithFakePage({ failScreenshot: true })
		const listener = vi.fn()
		manager.subscribePreview(listener)

		await expect(manager.publishPreview()).resolves.toBeUndefined()
		expect(listener).not.toHaveBeenCalled()
	})
})
