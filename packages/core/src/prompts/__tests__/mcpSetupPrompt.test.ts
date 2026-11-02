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

const langsearch = {
	name: "langsearch",
	title: "LangSearch",
	description: "Web search and page extraction.",
	apiKeyUrl: "https://langsearch.com/dashboard",
}

describe("mcp setup guidance", () => {
	it("names the exact settings path and the key page", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view"],
			mcpSetup: [langsearch],
		})

		expect(prompt).toContain("# MCP servers installed but not connected")
		expect(prompt).toContain("**LangSearch**")
		expect(prompt).toContain("Settings → MCP → LangSearch")
		expect(prompt).toContain("https://langsearch.com/dashboard")
	})

	it("forbids pretending the search happened", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view"],
			mcpSetup: [langsearch],
		})
		expect(prompt).toMatch(/Never claim you searched/)
		// The follow-up contract: the tools appear on the next message.
		expect(prompt).toContain("继续")
	})

	it("stays out of the prompt once a key is saved", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "react",
			toolNames: ["view"],
			mcpSetup: [],
		})
		expect(prompt).not.toContain("MCP servers installed but not connected")
		expect(prompt).not.toContain("Settings → MCP")
	})

	it("reaches every mode, including read-only fast", () => {
		for (const modeId of ["react", "plan", "fast"]) {
			const prompt = buildFullPrompt({
				...base,
				modeId,
				toolNames: ["view"],
				mcpSetup: [langsearch],
			})
			expect(prompt).toContain("Settings → MCP → LangSearch")
		}
	})

	it("the harness feeds the live setup state in on every turn", () => {
		const source = read("../../harness/instructions.ts")
		expect(source).toContain("builtinServersNeedingSetup()")
		expect(source).toContain("mcpSetup:")
		// Read from disk, not from a value cached at startup: the key is saved in
		// Settings while the app is running, and the next turn must see it.
		expect(source).toMatch(/mcpSetup:[\s\S]{0,200}apiKeyUrl/)
	})
})
