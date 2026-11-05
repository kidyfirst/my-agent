import { describe, expect, it } from "vitest"
import { describeToolNames, createDynamicTools } from "../tools.js"
import { buildFullPrompt } from "../../prompts/index.js"

const EXTRA = {
	computer: { id: "computer" },
	"navigate-browser": { id: "navigate-browser" },
	"some-future-tool": { id: "some-future-tool" },
}

function requestContext(options: { mode?: string; state?: any } = {}) {
	const session = {
		state: { get: () => options.state ?? {} },
		mode: { get: () => options.mode ?? "react" },
	}
	return {
		get: (key: string) => (key === "session" ? session : undefined),
		set: () => {},
	} as any
}

function toolNamesFor(options: {
	mode?: string
	state?: any
	browserToolsAvailable?: boolean
}) {
	const getTools = createDynamicTools(undefined, EXTRA, undefined, {
		browserToolsAvailable: options.browserToolsAvailable ?? true,
	})
	return Object.keys(
		getTools({
			requestContext: requestContext({
				mode: options.mode,
				state: options.state,
			}),
		}),
	)
}

describe("describeToolNames", () => {
	it("keeps browser tools out of the default (CLI) toolset", () => {
		expect(describeToolNames("react")).not.toContain("computer")
		expect(describeToolNames("react")).not.toContain("navigate-browser")
	})

	it("advertises them when the host opts in", () => {
		const names = describeToolNames("react", { browserTools: true })
		expect(names).toContain("navigate-browser")
		expect(names).toContain("computer")
	})

	it("never adds them to read-only modes", () => {
		for (const mode of ["fast", "plan"]) {
			const names = describeToolNames(mode, { browserTools: true })
			expect(names).not.toContain("computer")
			expect(names).not.toContain("navigate-browser")
		}
	})
})

describe("createDynamicTools browser gating", () => {
	it("registers both browser tools for the desktop host", () => {
		const names = toolNamesFor({ browserToolsAvailable: true })
		expect(names).toContain("computer")
		expect(names).toContain("navigate-browser")
	})

	it("drops them when the host has no browser manager", () => {
		const names = toolNamesFor({ browserToolsAvailable: false })
		expect(names).not.toContain("computer")
		expect(names).not.toContain("navigate-browser")
		// Other extras are unaffected.
		expect(names).toContain("some-future-tool")
	})

	it("honours the settings toggle", () => {
		const names = toolNamesFor({
			browserToolsAvailable: true,
			state: { browserToolsEnabled: false },
		})
		expect(names).not.toContain("computer")
		expect(names).not.toContain("navigate-browser")
	})

	it("keeps them out of read-only modes", () => {
		for (const mode of ["fast", "plan"]) {
			const names = toolNamesFor({ mode, browserToolsAvailable: true })
			expect(names).not.toContain("computer")
		}
	})
})

const promptBase = {
	projectPath: "/tmp/project",
	projectName: "demo",
	platform: "darwin",
	date: "2026-11-04",
	currentDate: "2026-11-04",
	workingDir: "/tmp/project",
}

describe("browser tooling in the system prompt", () => {
	it("explains text snapshots when computer is registered", () => {
		const prompt = buildFullPrompt({
			...promptBase,
			modeId: "react",
			toolNames: describeToolNames("react", { browserTools: true }),
		})
		expect(prompt).toContain("`navigate-browser`")
		expect(prompt).toContain("`computer`")
		expect(prompt).toContain("text snapshot")
		expect(prompt).toContain("element: <id>")
	})

	it("says nothing about a browser when the toolset has none", () => {
		const prompt = buildFullPrompt({
			...promptBase,
			modeId: "react",
			toolNames: describeToolNames("react"),
		})
		expect(prompt).not.toContain("**navigate-browser**")
		expect(prompt).not.toContain("headless Chromium")
	})
})
