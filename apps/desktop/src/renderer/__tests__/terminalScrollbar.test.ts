import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(
	resolve(process.cwd(), "apps/desktop/src/renderer/styles/global.css"),
	"utf8",
)

/**
 * The terminal scrolls by wheel and keyboard; a scrollbar there only covers the
 * last columns of a monospace grid. xterm 6 draws its own (VS Code's smooth
 * scroller) instead of using the native one, so both layers have to be closed.
 */
describe("terminal scrollbar", () => {
	it("hides xterm's own scrollbar element", () => {
		expect(css).toMatch(
			/\.xterm \.xterm-scrollable-element > \.scrollbar \{[^}]*display:\s*none/,
		)
	})

	it("hides the native viewport scrollbar as a fallback", () => {
		expect(css).toMatch(
			/\.xterm \.xterm-viewport \{[^}]*scrollbar-width:\s*none/,
		)
	})
})
