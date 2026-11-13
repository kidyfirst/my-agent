import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
	groupSlashCommands,
	SlashCommandAutocompleteView,
	type SlashCommand,
} from "../components/SlashCommandAutocomplete"

describe("SlashCommandAutocomplete with Skills Support", () => {
	const sampleItems: SlashCommand[] = [
		{
			name: "new",
			description: "Start a new thread",
			builtin: true,
			category: "command",
		},
		{
			name: "refresh",
			description: "Rescan and refresh skills in the current project",
			builtin: true,
			category: "command",
		},
		{
			name: "huashu-design",
			description: "Global design skill",
			category: "global_skill",
			skillScope: "global",
		},
		{
			name: "project-linter",
			description: "Project specific linter",
			category: "project_skill",
			skillScope: "project",
		},
	]

	it("groups and orders items hierarchically: project skills first, global skills second, commands third", () => {
		const grouped = groupSlashCommands(sampleItems, "")
		const groupKeys = Object.keys(grouped)

		expect(groupKeys[0]).toBe("project skills")
		expect(groupKeys[1]).toBe("global skills")
		expect(groupKeys[2]).toBe("commands")

		expect(grouped["project skills"][0].name).toBe("project-linter")
		expect(grouped["global skills"][0].name).toBe("huashu-design")
		expect(grouped["commands"].map((c) => c.name)).toEqual(["new", "refresh"])
	})

	it("renders distinct badges with different typography for project skills and global skills", () => {
		const grouped = groupSlashCommands(sampleItems, "")
		const html = renderToStaticMarkup(
			<SlashCommandAutocompleteView
				grouped={grouped}
				selectedIndex={0}
				onSelect={() => {}}
			/>,
		)

		// Check sections rendered
		expect(html).toContain("PROJECT SKILLS")
		expect(html).toContain("GLOBAL SKILLS")
		expect(html).toContain("COMMANDS")

		// Check project skill badge
		expect(html).toContain("project skill")
		expect(html).toContain("var(--font-mono)")

		// Check global skill badge
		expect(html).toContain("global skill")
		expect(html).toContain("inherit")

		// Check command badge
		expect(html).toContain("command")
	})
})
