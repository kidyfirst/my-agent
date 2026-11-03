import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { buildFullPrompt } from "../index.js"

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8")

const base = {
	projectPath: "/tmp/project",
	projectName: "demo",
	platform: "darwin",
	date: "2026-10-30",
	currentDate: "2026-10-30",
	workingDir: "/tmp/project",
}

/**
 * A connected MCP search server used to be absent from the prompt's
 * "authoritative" toolset list — the model read that list, concluded it had no
 * web access, and told the user so while `langsearch_web_search` sat in the same
 * request. These tests keep the tool name and the instruction in the prompt.
 */
describe("mcp tools in the runtime toolset", () => {
	it("lists the namespaced tool next to the built-ins", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view", "search_content"],
			mcpToolNames: ["langsearch_web_search"],
		})

		const toolset = prompt.slice(
			prompt.indexOf("# Runtime Toolset"),
			prompt.indexOf("# Web access"),
		)
		expect(toolset).toContain("- `view`")
		expect(toolset).toContain("- `langsearch_web_search`")
		// The list claims to be generated from the live toolset; it has to say so
		// about MCP too, otherwise an earlier "no web tools" answer reads as fact.
		expect(toolset).toContain("MCP servers")
	})

	it("tells the model to look current facts up instead of refusing", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "fast",
			toolNames: ["view"],
			mcpToolNames: ["langsearch_web_search"],
		})

		expect(prompt).toContain("# Web access (live)")
		expect(prompt).toContain("`langsearch_web_search`")
		expect(prompt).toMatch(/Never say you have no internet access/)
		expect(prompt).toMatch(/weather, prices, news/)
	})

	it("stays quiet when no search server is connected", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view"],
			mcpToolNames: [],
		})

		expect(prompt).not.toContain("# Web access (live)")
		// A file-search tool must never be mistaken for web access.
		const withGrep = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view"],
			mcpToolNames: ["langsearch_search_content"],
		})
		expect(withGrep).not.toContain("# Web access (live)")
	})

	it("the harness supplies the live names, not a startup snapshot", () => {
		const instructions = read("../../harness/instructions.ts")
		expect(instructions).toContain("getMcpToolNames")
		expect(instructions).toContain("mcpToolNames:")

		const harness = read("../../harness/index.ts")
		expect(harness).toContain("getMcpToolNames(): string[]")
		expect(harness).toContain("Object.keys(mcpManager.getTools())")
	})

	it("a session that never called init() still grows tools on the next read", () => {
		const manager = read("../../mcp/manager.ts")
		expect(manager).toMatch(
			/getTools\(\): Record<string, any> \{[\s\S]{0,900}void this\.init\(\)/,
		)
		// A key saved after construction has to be picked up by that same
		// connect attempt, otherwise the lazy path dials a headerless config
		// forever.
		expect(manager).toMatch(
			/getTools\(\): Record<string, any> \{[\s\S]{0,600}this\.refreshConfig\(\)/,
		)
	})
})
