import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { createProjectMemoryTool } from "../project-memory.js"

describe("project_memory Tool", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-proj-tool-test-"))
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("executes update_context and saves to project-context.json", async () => {
		const tool = createProjectMemoryTool(tempDir)
		const res = await (tool.execute as any)(
			{
				action: "update_context",
				preferences: { packageManager: "pnpm", styling: "tailwind4" },
				conventions: ["Strict TypeScript", "Prefer functional React"],
				notes: ["Uses Vite dev server"],
			},
			{},
		)

		expect(res.success).toBe(true)
		expect(res.updatedContext.preferences).toEqual({
			packageManager: "pnpm",
			styling: "tailwind4",
		})
		expect(res.updatedContext.conventions).toContain("Strict TypeScript")

		// Verify file on disk
		const contextFile = path.join(tempDir, ".myagent", "project-context.json")
		expect(fs.existsSync(contextFile)).toBe(true)
	})

	it("executes save_rule, list_rules, and delete_rule", async () => {
		const tool = createProjectMemoryTool(tempDir)
		// 1. Save rule
		const saveRes = await (tool.execute as any)(
			{
				action: "save_rule",
				ruleName: "git-commit-convention",
				ruleContent: "Always use format: <type>(<scope>): <subject>",
			},
			{},
		)
		expect(saveRes.success).toBe(true)
		expect(fs.existsSync(saveRes.rulePath)).toBe(true)

		// 2. List rules
		const listRes = await (tool.execute as any)({ action: "list_rules" }, {})
		expect(listRes.success).toBe(true)
		expect(
			listRes.rules.some((r: any) => r.name === "git-commit-convention.md"),
		).toBe(true)

		// 3. Read
		const readRes = await (tool.execute as any)({ action: "read" }, {})
		expect(readRes.success).toBe(true)
		expect(readRes.rules.length).toBeGreaterThanOrEqual(1)

		// 4. Delete rule
		const delRes = await (tool.execute as any)(
			{ action: "delete_rule", ruleName: "git-commit-convention" },
			{},
		)
		expect(delRes.success).toBe(true)
	})
})
