import { describe, expect, it } from "vitest"
import { selectReadOnlyTools } from "../readonly-tools.js"

const tools = {
	view: {},
	search_content: {},
	find_files: {},
	web_search: {},
	web_extract: {},
	write_file: {},
	string_replace_lsp: {},
	ast_smart_edit: {},
	execute_command: {},
	subagent: {},
	mcp__db__drop_table: {},
	langsearch_web_search: {},
}

describe("selectReadOnlyTools", () => {
	it("keeps file inspection, search and web tools", () => {
		expect(Object.keys(selectReadOnlyTools(tools)).sort()).toEqual([
			"find_files",
			"langsearch_web_search",
			"search_content",
			"view",
			"web_extract",
			"web_search",
		])
	})

	it("keeps a connected search server — including in Fast mode", () => {
		// Dropping it left Fast mode with no way to answer anything current,
		// while the prompt still described the tool as available.
		expect(selectReadOnlyTools(tools)).toHaveProperty("langsearch_web_search")
	})

	it("drops writes, shell, subagents and MCP tools with unknown effects", () => {
		const selected = selectReadOnlyTools(tools)
		for (const name of [
			"write_file",
			"string_replace_lsp",
			"ast_smart_edit",
			"execute_command",
			"subagent",
			"mcp__db__drop_table",
		]) {
			expect(selected).not.toHaveProperty(name)
		}
	})

	it("tolerates an empty or missing toolset", () => {
		expect(selectReadOnlyTools(undefined)).toEqual({})
		expect(selectReadOnlyTools(null)).toEqual({})
		expect(selectReadOnlyTools({})).toEqual({})
	})

	it("skips falsy entries instead of passing them to the model", () => {
		expect(
			Object.keys(selectReadOnlyTools({ view: {}, write_file: null })),
		).toEqual(["view"])
	})
})
