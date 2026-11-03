import { describe, expect, it } from "vitest"
import { buildFullPrompt } from "../index.js"

const base = {
	projectPath: "/tmp/project",
	projectName: "demo",
	platform: "darwin",
	date: "2026-10-30",
	currentDate: "2026-10-30",
	workingDir: "/tmp/project",
}

const fastToolNames = [
	"view",
	"search_content",
	"find_files",
	"request_sandbox_access",
]

describe("fast mode prompt", () => {
	it("advertises the read-only toolset", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "fast",
			toolNames: fastToolNames,
		})
		for (const name of fastToolNames) {
			expect(prompt).toContain(`\`${name}\``)
		}
		expect(prompt).toContain("# Mode: Fast (Read-Only Tools)")
	})

	it("forbids every write path instead of claiming there are no tools", () => {
		const prompt = buildFullPrompt({
			...base,
			modeId: "fast",
			toolNames: fastToolNames,
		})
		expect(prompt).not.toContain("There are NO tools registered")
		expect(prompt).toContain("no `write_file`")
		expect(prompt).toContain("ReAct mode")
	})

	it("drops the edit-and-verify workflow, which needs tools it lacks", () => {
		const fast = buildFullPrompt({
			...base,
			modeId: "fast",
			toolNames: fastToolNames,
		})
		expect(fast).not.toContain("How to Work on Tasks")
		expect(fast).not.toContain("Run the relevant tests")
	})

	it("still states the no-tools case when nothing is registered", () => {
		const prompt = buildFullPrompt({ ...base, modeId: "fast", toolNames: [] })
		expect(prompt).toContain("Direct Conversation (No Tools)")
	})

	it("leaves react and plan on the full tool rules", () => {
		for (const modeId of ["react", "plan"]) {
			const prompt = buildFullPrompt({
				...base,
				modeId,
				toolNames: ["view", "search_content", "find_files", "execute_command"],
			})
			expect(prompt).toContain("# Tool Usage Rules")
			expect(prompt).toContain("How to Work on Tasks")
			expect(prompt).not.toContain("Read-Only Tools")
		}
	})
})
