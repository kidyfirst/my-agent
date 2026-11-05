import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TerminalPanel } from "../components/TerminalPanel"

describe("TerminalPanel", () => {
	it("is just the shell — no header row of its own", () => {
		const html = renderToStaticMarkup(
			<TerminalPanel projectPath="/repo/demo" />,
		)
		// The sidebar tab strip above already names the panel; a second tab bar
		// inside it duplicated that and cost a row of terminal.
		expect(html).toContain('data-testid="terminal-panel"')
		expect(html).not.toContain("TERMINAL")
		expect(html).not.toContain("Terminal 1")
		expect(html).not.toContain("New terminal")
	})

	it("fills the pane instead of taking a docked height", () => {
		const html = renderToStaticMarkup(
			<TerminalPanel projectPath="/repo/demo" />,
		)
		expect(html).toContain("flex:1 1 0")
	})

	it("keeps the empty state when no worktree is open", () => {
		const html = renderToStaticMarkup(<TerminalPanel projectPath={null} />)
		expect(html).toContain("Select a worktree")
		expect(html).not.toContain('data-testid="terminal-panel"')
	})
})
