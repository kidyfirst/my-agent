import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { WorktreeIndicator } from "../components/project-list/WorktreeIndicator"
import { ProjectList } from "../components/ProjectList"
import type { EnrichedProject } from "../types/project-list"

/**
 * A worktree row is marked by a fork glyph, not a bare dot. Its three nodes are
 * filled while the worktree's sessions are open and hollow while they are
 * folded, which is what tells a reader whether a click will reveal or hide
 * anything — the same job the open/closed folder does one level up.
 */

const circles = (html: string) => html.match(/<circle[^>]*>/g) ?? []
const filled = (html: string) =>
	circles(html).filter((c) => !/fill="none"/.test(c)).length
const hollow = (html: string) =>
	circles(html).filter((c) => /fill="none"/.test(c)).length

const indicator = (expanded: boolean) =>
	renderToStaticMarkup(
		<WorktreeIndicator
			color="#e06c75"
			expanded={expanded}
			isSpinning={false}
			isGlowing={false}
		/>,
	)

const project = (
	name: string,
	rootPath: string,
	worktrees: Array<{ path: string; branch: string }> = [],
): EnrichedProject => ({
	name,
	rootPath,
	lastOpened: "",
	gitBranch: "main",
	worktrees,
})

function renderProjectList(overrides: Record<string, unknown> = {}) {
	const noop = vi.fn()
	return renderToStaticMarkup(
		<ProjectList
			projects={[
				project("my-agent", "/repo/my-agent", [
					{ path: "/repo/wt-hello", branch: "hellobore" },
				]),
			]}
			activeProjectPath="/repo/my-agent"
			isAgentActive={false}
			activeWorktrees={new Set<string>()}
			unreadWorktrees={new Set<string>()}
			worktreeStatuses={new Map()}
			threads={[]}
			onSwitchProject={noop}
			onOpenFolder={noop}
			onCloneRepo={noop}
			onRemoveProject={noop}
			onCreateWorktree={noop}
			onDeleteWorktree={noop}
			onRenameProject={noop}
			onSwitchThread={noop}
			onNewThread={noop}
			onDeleteThread={noop}
			onRenameThread={noop}
			{...overrides}
		/>,
	)
}

describe("worktree row glyph", () => {
	it("draws the branch fork, not a status dot", () => {
		const html = indicator(true)

		expect(circles(html)).toHaveLength(3)
		// Two connector strokes: the trunk between the left nodes and the
		// branch curving into the right one.
		expect(html.match(/<path/g) ?? []).toHaveLength(2)
		// The old mark was a plain filled circle with no stroke geometry.
		expect(html).not.toContain("border-radius:50%")
	})

	it("fills the nodes while the worktree is expanded", () => {
		const html = indicator(true)

		expect(filled(html)).toBe(3)
		expect(hollow(html)).toBe(0)
	})

	it("hollows the nodes while the worktree is folded", () => {
		const html = indicator(false)

		expect(hollow(html)).toBe(3)
		expect(filled(html)).toBe(0)
	})

	it("paints the glyph in the worktree's own colour", () => {
		expect(indicator(true)).toContain('stroke="#e06c75"')
		expect(indicator(true)).toContain('fill="#e06c75"')
	})

	it("keeps the live states on the glyph", () => {
		const busy = renderToStaticMarkup(
			<WorktreeIndicator color="#e06c75" expanded isSpinning isGlowing />,
		)
		expect(busy).toContain("wt-busy")
		expect(busy).toContain("drop-shadow")

		const idle = indicator(true)
		expect(idle).not.toContain("animation")
		expect(idle).not.toContain("drop-shadow")
	})

	it("starts a worktree row expanded, so its nodes start solid", () => {
		const html = renderProjectList()
		const at = html.indexOf("hellobore")
		const start = html.lastIndexOf("<svg", at)
		const glyph = html.slice(start, html.indexOf("</svg>", start) + 6)

		expect(circles(glyph)).toHaveLength(3)
		expect(filled(glyph)).toBe(3)
		expect(hollow(glyph)).toBe(0)
	})

	it("passes the fold state down from the row", () => {
		const source = readFileSync(
			new URL("../components/ProjectList.tsx", import.meta.url),
			"utf-8",
		)
		const worktreeRow = source.slice(source.indexOf("worktrees.map((wt)"))

		expect(worktreeRow).toContain("expanded={wtExpanded}")
	})
})
