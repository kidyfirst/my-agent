import { describe, expect, it } from "vitest"
import { createMyAgent } from "../index.js"
import { RequestContext } from "../../core/context/index.js"

async function getTools(modeId?: string) {
	const { harness } = await createMyAgent({
		cwd: process.cwd(),
		disableMcp: true,
		disableHooks: true,
		storage: { url: "file::memory:" },
	})
	await harness.init()
	if (modeId) await harness.switchMode({ modeId })

	const rc = new RequestContext()
	rc.set("controller", harness.controller)
	rc.set("session", harness.activeSession)
	rc.set("harness", harness.controller)

	const agent = (harness.controller as any).agent
	const tools = await agent.listTools({ requestContext: rc })
	return Object.keys(tools)
}

describe("main agent toolset", () => {
	it("exposes filesystem and terminal tools", async () => {
		const tools = await getTools()
		// Without the workspace toolset the agent can only browse the web and
		// cannot inspect or change the repo at all.
		expect(tools).toEqual(
			expect.arrayContaining([
				"view",
				"search_content",
				"find_files",
				"execute_command",
				"write_file",
				"string_replace_lsp",
			]),
		)
	})

	it("keeps plan mode read-only", async () => {
		const tools = await getTools("plan")
		expect(tools).toContain("view")
		expect(tools).toContain("execute_command")
		expect(tools).not.toContain("write_file")
		expect(tools).not.toContain("string_replace_lsp")
		expect(tools).not.toContain("ast_smart_edit")
	})

	// The system prompt used to advertise `grep` / `glob` / `task_write` /
	// `task_check` / `ask_user`, none of which exist. Models then called them,
	// got "unknown tool", and concluded that no tools were available at all.
	it("describes only tools that are actually registered", async () => {
		const { describeToolNames } = await import("../tools.js")
		const buildTools = await getTools()
		const planTools = await getTools("plan")

		for (const name of describeToolNames("build")) {
			expect(buildTools).toContain(name)
		}
		for (const name of describeToolNames("plan")) {
			expect(planTools).toContain(name)
		}
		expect(buildTools).toEqual(
			expect.arrayContaining([...describeToolNames("build")]),
		)
	})

	it("puts the live toolset into the system prompt", async () => {
		const { harness } = await createMyAgent({
			cwd: process.cwd(),
			disableMcp: true,
			disableHooks: true,
			storage: { url: "file::memory:" },
		})
		await harness.init()
		const rc = new RequestContext()
		rc.set("controller", harness.controller)
		rc.set("session", harness.activeSession)
		rc.set("harness", harness.controller)

		const instructions = await (
			harness.controller as any
		).agent.getInstructions({
			requestContext: rc,
		})
		expect(instructions).toContain("# Runtime Toolset (authoritative)")
		expect(instructions).toContain("`execute_command`")
		expect(instructions).toContain("`search_content`")
		// Stale tool names must not resurface.
		expect(instructions).not.toContain("**grep**")
		expect(instructions).not.toContain("**glob**")
		expect(instructions).not.toContain("task_write")
		expect(instructions).not.toContain("task_check")
	})
})
