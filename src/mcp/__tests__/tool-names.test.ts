import { describe, expect, it } from "vitest"
import { isReadOnlyMcpToolName } from "../tool-names.js"
import { getToolCategory } from "../../permissions.js"

/**
 * A hosted search server answers a query and returns text, but MCP tells us
 * nothing about side effects, so every MCP tool defaulted to the `mcp` category.
 * That produced two visible bugs: an approval dialog on every lookup, and Fast
 * mode dropping the search tool from its toolset and then telling the user it had
 * no internet access. Both come down to this classification.
 */

describe("isReadOnlyMcpToolName", () => {
	it("recognises namespaced lookup tools", () => {
		for (const name of [
			"langsearch_web_search",
			"tavily_web_extract",
			"mock_web_search",
			"web_search",
			"web-extract",
			"brave_web_fetch",
		]) {
			expect(isReadOnlyMcpToolName(name)).toBe(true)
		}
	})

	it("leaves file search and mutating MCP tools alone", () => {
		for (const name of [
			"search_content",
			"find_files",
			"mcp__notion__create_page",
			"mcp__db__drop_table",
			"langsearch_write_note",
			"web_search_index_rebuild",
		]) {
			expect(isReadOnlyMcpToolName(name)).toBe(false)
		}
	})
})

describe("getToolCategory", () => {
	it("classifies a namespaced web lookup as read", () => {
		expect(getToolCategory("langsearch_web_search")).toBe("read")
		expect(getToolCategory("langsearch_web_extract")).toBe("read")
	})

	it("keeps every other MCP tool behind the mcp category", () => {
		expect(getToolCategory("mcp__notion__create_page")).toBe("mcp")
		expect(getToolCategory("langsearch_write_note")).toBe("mcp")
	})

	it("does not change built-in classifications", () => {
		expect(getToolCategory("view")).toBe("read")
		expect(getToolCategory("search_content")).toBe("read")
		expect(getToolCategory("write_file")).toBe("edit")
		expect(getToolCategory("execute_command")).toBe("execute")
	})
})
