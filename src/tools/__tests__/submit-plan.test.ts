import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { createSubmitPlanTool } from "../submit-plan.js"
import { createWriteFileTool } from "../write.js"
import { RequestContext, ExecutionMode } from "../../core/index.js"

describe("submit_plan tool", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "submit-plan-test-"))
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("creates a plan markdown file under .myagent/plans/", async () => {
		const tool = createSubmitPlanTool(tempDir)
		const res = await (tool as any).execute({
			title: "Refactor Auth Service",
			plan: "## Overview\nMigrate auth to JWT\n\n## Steps\n1. Install packages",
		})

		expect(res.isError).toBe(false)
		expect(res.content).toContain(".myagent/plans/refactor-auth-service.md")

		const writtenPath = path.join(
			tempDir,
			".myagent/plans/refactor-auth-service.md",
		)
		expect(fs.existsSync(writtenPath)).toBe(true)
		const content = fs.readFileSync(writtenPath, "utf-8")
		expect(content).toContain("# Refactor Auth Service")
		expect(content).toContain("Migrate auth to JWT")
	})

	it("emits plan_approval_required and handles user approval", async () => {
		const tool = createSubmitPlanTool(tempDir)
		const events: any[] = []
		let planResolver: any = null

		const mockHarness = {
			emitEvent: (evt: any) => events.push(evt),
			registerPlanApproval: ({ resolve }: any) => {
				planResolver = resolve
			},
			setState: async () => {},
		}

		const rc = new RequestContext()
		rc.set("harness", mockHarness)
		const toolContext = { requestContext: rc }

		const executePromise = (tool as any).execute(
			{
				title: "Add Dark Mode",
				plan: "## Steps\n1. Add CSS vars",
			},
			toolContext,
		)

		// Wait a tick for execution to register
		await new Promise((r) => setTimeout(r, 10))

		expect(events.length).toBe(1)
		expect(events[0].type).toBe("plan_approval_required")
		expect(events[0].title).toBe("Add Dark Mode")
		expect(planResolver).toBeDefined()

		// User approves
		planResolver({ action: "approved" })

		const res = await executePromise
		expect(res.isError).toBe(false)
		expect(res.content).toContain("APPROVED")
		expect(events.some((e) => e.type === "plan_approved")).toBe(true)
	})

	it("handles user rejection with feedback", async () => {
		const tool = createSubmitPlanTool(tempDir)
		const events: any[] = []
		let planResolver: any = null

		const mockHarness = {
			emitEvent: (evt: any) => events.push(evt),
			registerPlanApproval: ({ resolve }: any) => {
				planResolver = resolve
			},
			setState: async () => {},
		}

		const rc = new RequestContext()
		rc.set("harness", mockHarness)
		const toolContext = { requestContext: rc }

		const executePromise = (tool as any).execute(
			{
				title: "Major Architecture Rewrite",
				plan: "## Steps\nRewrite everything",
			},
			toolContext,
		)

		await new Promise((r) => setTimeout(r, 10))
		planResolver({
			action: "rejected",
			feedback: "Too risky, break it into smaller phases",
		})

		const res = await executePromise
		expect(res.isError).toBe(false)
		expect(res.content).toContain("REJECTED")
		expect(res.content).toContain("Too risky, break it into smaller phases")
	})

	it("guards write_file in Plan mode against modifying source code", async () => {
		const writeTool = createWriteFileTool(tempDir)

		const rc = new RequestContext()
		rc.set("harness", { modeId: ExecutionMode.PLAN })
		const toolContext = { requestContext: rc }

		// Attempt to write source code in plan mode
		const srcRes = await (writeTool as any).execute(
			{ path: "src/index.ts", content: "console.log('hello')" },
			toolContext,
		)
		expect(srcRes.isError).toBe(true)
		expect(srcRes.content).toContain(
			"In Plan mode, source files cannot be modified",
		)

		// Writing to .myagent/plans/ is allowed
		const planRes = await (writeTool as any).execute(
			{ path: ".myagent/plans/custom-plan.md", content: "# Custom Plan" },
			toolContext,
		)
		expect(planRes.isError).toBe(false)
		expect(
			fs.existsSync(path.join(tempDir, ".myagent/plans/custom-plan.md")),
		).toBe(true)
	})
})
