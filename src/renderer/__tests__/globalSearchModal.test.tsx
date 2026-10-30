import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { GlobalSearchModal } from "../components/GlobalSearchModal"
import type { EnrichedProject } from "../types/project-list"

const projects: EnrichedProject[] = [
	{
		name: "mastra-code-ui",
		rootPath: "/repo/mastra",
		lastOpened: new Date().toISOString(),
		gitBranch: "main",
		worktrees: [],
	},
]

const threads = [
	{
		id: "t1",
		resourceId: "t1",
		title: "Electron Page Loading Control",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
]

describe("GlobalSearchModal", () => {
	const html = renderToStaticMarkup(
		<GlobalSearchModal
			projects={projects}
			threads={threads}
			activeProjectName="mastra-code-ui"
			onClose={vi.fn()}
			onSelectProject={vi.fn()}
			onSelectThread={vi.fn()}
		/>,
	)

	it("renders a search field instead of an inline filter", () => {
		expect(html).toContain("Search for projects and sessions...")
		expect(html).toContain("esc")
	})

	it("lists sessions and projects in separate sections", () => {
		expect(html).toContain("Sessions")
		expect(html).toContain("Projects")
		expect(html).toContain("Electron Page Loading Control")
		expect(html).toContain("mastra-code-ui")
		expect(html).toContain("main")
	})

	it("highlights the first row by default", () => {
		expect(html).toContain('data-selected="true"')
	})
})
