import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { buildFullPrompt } from "../index.js"

/**
 * "No key" and "key rejected" look identical to a model that only knows it has no
 * search tool: it picks the first story and tells the user to configure something
 * they already configured. These two states therefore get their own sections, and
 * the failure one must never ask for a key.
 */

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

describe("mcp connection failure guidance", () => {
	it("says the key is saved but the server could not be reached", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "fast",
			toolNames: ["view"],
			mcpFailures: [{ title: "LangSearch", error: "HTTP 401 Unauthorized" }],
		})

		expect(prompt).toContain("# MCP server configured but not connected")
		expect(prompt).toContain("**LangSearch**")
		expect(prompt).toContain("HTTP 401 Unauthorized")
		expect(prompt).toContain("Settings → MCP → LangSearch")
		// The one thing the model must not say in this state.
		expect(prompt).toMatch(/do not tell the user to add one/i)
		expect(prompt).toMatch(/Never claim you searched/)
	})

	it("never appears alongside the missing-key section", () => {
		const missingKey = buildFullPrompt({
			...base,
			modeId: "fast",
			toolNames: ["view"],
			mcpSetup: [
				{
					name: "langsearch",
					title: "LangSearch",
					description: "Web search.",
					apiKeyUrl: "https://langsearch.com/dashboard",
				},
			],
			mcpFailures: [],
		})
		expect(missingKey).toContain("MCP servers installed but not connected")
		expect(missingKey).not.toContain("configured but not connected")
	})

	it("stays out of the prompt when the server is connected", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view"],
			mcpToolNames: ["langsearch_web_search"],
			mcpFailures: [],
		})
		expect(prompt).not.toContain("configured but not connected")
		expect(prompt).toContain("# Web access (live)")
	})

	it("the harness derives it from live server statuses", () => {
		const source = read("../../harness/instructions.ts")
		expect(source).toContain("getMcpServerStatuses")
		expect(source).toMatch(
			/mcpFailures:[\s\S]{0,400}status\.builtin && status\.hasApiKey && !status\.connected/,
		)
	})
})
