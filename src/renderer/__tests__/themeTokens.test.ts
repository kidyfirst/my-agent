import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Colors live in `styles/global.css`; components may only reference them.
 *
 * A literal always "works" in whichever theme it was written in, which makes it
 * easy to miss — so this test walks the whole renderer instead of a file list.
 */
const ROOT = "src/renderer"
const CSS_PATH = "src/renderer/styles/global.css"

/**
 * Palette modules own literal colors by design: they map a domain value (file
 * type, branch) to a swatch, and xterm needs concrete hex per ANSI slot.
 */
const PALETTE_MODULES = [
	"utils/fileIcons.ts",
	"utils/project-list.ts",
	"components/TerminalPanel.tsx",
	// Brand identity colours (WhatsApp green, Facebook blue, …) are not theme
	// tokens: a brand mark has to look the same in both themes.
	"components/sidebar/brandMarks.tsx",
]

const read = (path: string) =>
	readFileSync(resolve(process.cwd(), path), "utf8")
const css = read(CSS_PATH)

function rendererSources(dir = ROOT): string[] {
	const out: string[] = []
	for (const entry of readdirSync(resolve(process.cwd(), dir))) {
		const path = join(dir, entry)
		if (statSync(resolve(process.cwd(), path)).isDirectory()) {
			if (entry === "__tests__") continue
			out.push(...rendererSources(path))
		} else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.tsx")) {
			out.push(relative(ROOT, path).split("\\").join("/"))
		}
	}
	return out
}

/** `#abc`, `#aabbcc`, `rgb(…)`, `rgba(…)` written straight into a component. */
const LITERAL = /(?<!&)#[0-9a-fA-F]{3,8}\b|\brgba?\(/g

describe("theme colors", () => {
	const sources = rendererSources().filter(
		(path) => !PALETTE_MODULES.includes(path),
	)

	it("walks the whole renderer", () => {
		expect(sources.length).toBeGreaterThan(50)
	})

	it("never writes a color literal outside the palette modules", () => {
		const offenders = sources
			.map((path) => ({ path, found: read(join(ROOT, path)).match(LITERAL) }))
			.filter((entry) => (entry.found?.length ?? 0) > 0)
			.map((entry) => `${entry.path}: ${entry.found?.join(", ")}`)
		expect(offenders).toEqual([])
	})

	it("defines every token a component references", () => {
		const defined = new Set(
			[...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
		)
		const missing = new Set<string>()
		for (const path of sources) {
			for (const match of read(join(ROOT, path)).matchAll(
				/var\(\s*(--[a-z0-9-]+)/g,
			)) {
				if (!defined.has(match[1])) missing.add(match[1])
			}
		}
		expect([...missing]).toEqual([])
	})

	it("keeps the shared surface tokens in both themes", () => {
		const lightBlock = css.slice(0, css.indexOf('[data-theme="dark"]'))
		const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'))
		for (const token of [
			"--scrim",
			"--scrim-subtle",
			"--shadow-modal",
			"--shadow-popover",
			"--shadow-sm",
			"--on-accent",
			"--accent-2",
			"--replay",
			"--issue",
			"--thinking-accent",
			"--action",
			"--action-hover",
			"--code-bg",
			"--code-text",
		]) {
			expect(lightBlock).toContain(`${token}:`)
			expect(darkBlock).toContain(`${token}:`)
		}
	})
})
