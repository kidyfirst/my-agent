import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	BOOT_SPLASH_FADE_MS,
	BOOT_SPLASH_ID,
	BOOT_SPLASH_MIN_VISIBLE_MS,
	bootSplashReleaseDelay,
	hideBootSplash,
} from "../utils/bootSplash"

const read = (relative: string) =>
	readFileSync(new URL(relative, import.meta.url), "utf8")

describe("bootSplashReleaseDelay", () => {
	it("holds the splash for the minimum while the boot is still young", () => {
		expect(bootSplashReleaseDelay(0)).toBe(BOOT_SPLASH_MIN_VISIBLE_MS)
		expect(bootSplashReleaseDelay(200)).toBe(BOOT_SPLASH_MIN_VISIBLE_MS - 200)
	})

	it("releases immediately once the minimum has passed", () => {
		expect(bootSplashReleaseDelay(BOOT_SPLASH_MIN_VISIBLE_MS)).toBe(0)
		expect(bootSplashReleaseDelay(3000)).toBe(0)
	})

	it("does not stall on a nonsense clock reading", () => {
		expect(bootSplashReleaseDelay(Number.NaN)).toBe(0)
		expect(bootSplashReleaseDelay(-5)).toBe(0)
	})
})

describe("hideBootSplash", () => {
	type FakeNode = {
		dataset: Record<string, string>
		classList: { add: (c: string) => void }
		setAttribute: (k: string, v: string) => void
		remove: () => void
	}

	const makeNode = (): FakeNode & { classes: string[]; gone: boolean } => {
		const classes: string[] = []
		const node = {
			dataset: {} as Record<string, string>,
			classes,
			gone: false,
			classList: { add: (c: string) => classes.push(c) },
			setAttribute: (k: string, v: string) => {
				node.dataset[k] = v
			},
			remove: () => {
				node.gone = true
			},
		}
		return node
	}

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("fades the splash out and drops it from the DOM", () => {
		const node = makeNode()
		vi.stubGlobal("document", { getElementById: () => node })

		hideBootSplash()

		expect(node.classes).toContain("boot-splash--hidden")
		expect(node.dataset["aria-hidden"]).toBe("true")
		expect(node.gone).toBe(false)

		vi.advanceTimersByTime(BOOT_SPLASH_FADE_MS + 80)
		expect(node.gone).toBe(true)
	})

	it("is idempotent: StrictMode runs the effect twice", () => {
		const node = makeNode()
		vi.stubGlobal("document", { getElementById: () => node })

		hideBootSplash()
		hideBootSplash()

		expect(node.classes).toHaveLength(1)
	})

	it("does nothing when the splash was already retired", () => {
		vi.stubGlobal("document", { getElementById: () => null })
		expect(() => hideBootSplash()).not.toThrow()
	})

	it("does nothing while rendering without a DOM", () => {
		vi.stubGlobal("document", undefined)
		expect(() => hideBootSplash()).not.toThrow()
	})
})

describe("boot splash markup", () => {
	const html = read("../index.html")

	it("is part of the document, not of the React tree", () => {
		// The bundle still has to be parsed before React can paint anything.
		expect(html).toContain(`id="${BOOT_SPLASH_ID}"`)
		expect(html.indexOf(`id="${BOOT_SPLASH_ID}"`)).toBeLessThan(
			html.indexOf('type="module"'),
		)
	})

	it("resolves the skin before the first frame", () => {
		// The theme lives in localStorage; React only reads it back after the
		// async boot, which used to leave a white window for dark-theme users.
		const script = html.slice(0, html.indexOf('<script type="module"'))
		expect(script).toContain('localStorage.getItem("myagent-theme")')
		expect(script).toContain('setAttribute(\n\t\t\t\t\t\t"data-theme"')
		expect(script).toContain("prefers-color-scheme: dark")
	})

	it("ships a light and a dark background for the overlay", () => {
		expect(html).toContain("--boot-bg: #ffffff")
		expect(html).toContain("--boot-bg: #09090b")
		// Same value as --bg, so the fade reveals no seam.
		expect(html).toContain("background: var(--bg, var(--boot-bg))")
	})

	it("centres a bouncing logo", () => {
		expect(html).toContain("boot-splash__logo")
		expect(html).toContain("@keyframes boot-splash-hop")
		expect(html).toContain("infinite")
		expect(html).toContain("prefers-reduced-motion: reduce")
	})

	it("releases itself if the renderer never gets that far", () => {
		expect(html).toContain("boot-splash--hidden")
		expect(html).toContain("}, 8000)")
	})
})

describe("App hands the splash over to the sidebar", () => {
	const app = read("../App.tsx")

	it("waits for the boot and for the session snapshots", () => {
		expect(app).toContain("loaded: projectThreadsLoaded")
		expect(app).toContain(
			"booted && (project.enrichedProjects.length === 0 || projectThreadsLoaded)",
		)
	})

	it("marks the boot as done even when initialization throws", () => {
		const start = app.indexOf("} finally {")
		expect(start).toBeGreaterThan(-1)
		expect(app.slice(start, start + 240)).toContain("setBooted(true)")
	})
})
