import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import {
	loadProjectContext,
	saveProjectContext,
	updateProjectContext,
	loadProjectRules,
	saveProjectRule,
	deleteProjectRule,
	formatProjectWorkingMemory,
} from "../project-memory.js"

describe("Project Working Memory & Rules", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-proj-mem-test-"))
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("returns null when project-context.json does not exist", () => {
		const ctx = loadProjectContext(tempDir)
		expect(ctx).toBeNull()
	})

	it("saves and loads project-context.json correctly", () => {
		saveProjectContext(tempDir, {
			preferences: { packageManager: "pnpm", framework: "react" },
			conventions: ["Use Tailwind CSS 4", "Prefer async/await"],
			notes: ["Uses SQLite store"],
		})

		const loaded = loadProjectContext(tempDir)
		expect(loaded).toBeDefined()
		expect(loaded?.preferences?.packageManager).toBe("pnpm")
		expect(loaded?.conventions).toContain("Use Tailwind CSS 4")
		expect(loaded?.notes).toContain("Uses SQLite store")
	})

	it("updates project context incrementally and merges arrays without duplicates", () => {
		updateProjectContext(tempDir, {
			preferences: { packageManager: "pnpm" },
			conventions: ["Use TypeScript strict mode"],
		})

		const updated = updateProjectContext(tempDir, {
			preferences: { testRunner: "vitest" },
			conventions: ["Use TypeScript strict mode", "Write unit tests"],
			notes: ["Node >= 20 required"],
		})

		expect(updated.preferences).toEqual({
			packageManager: "pnpm",
			testRunner: "vitest",
		})
		expect(updated.conventions).toEqual([
			"Use TypeScript strict mode",
			"Write unit tests",
		])
		expect(updated.notes).toEqual(["Node >= 20 required"])
	})

	it("saves, lists, and deletes project rules (.myagent/rules/*.md)", () => {
		const rulePath = saveProjectRule(
			tempDir,
			"code-style",
			"# Code Style\nUse camelCase for variables.",
		)
		expect(fs.existsSync(rulePath)).toBe(true)

		const rules = loadProjectRules(tempDir)
		expect(rules.length).toBeGreaterThanOrEqual(1)
		const found = rules.find((r) => r.name === "code-style.md")
		expect(found).toBeDefined()
		expect(found?.content).toContain("Use camelCase for variables.")
		expect(found?.scope).toBe("project")

		const deleted = deleteProjectRule(tempDir, "code-style")
		expect(deleted).toBe(true)
		const afterDelete = loadProjectRules(tempDir)
		expect(afterDelete.find((r) => r.name === "code-style.md")).toBeUndefined()
	})

	it("formats project working memory and rules into system prompt section", () => {
		updateProjectContext(tempDir, {
			preferences: { packageManager: "pnpm" },
			conventions: ["Strict typing"],
			notes: ["Zero external dependencies for tokens"],
		})
		saveProjectRule(tempDir, "git-workflow", "Always use conventional commits.")

		const formatted = formatProjectWorkingMemory(tempDir)
		expect(formatted).toContain("<project-working-memory>")
		expect(formatted).toContain("packageManager")
		expect(formatted).toContain("Strict typing")
		expect(formatted).toContain("Zero external dependencies for tokens")
		expect(formatted).toContain("git-workflow.md")
		expect(formatted).toContain("Always use conventional commits.")
		expect(formatted).toContain("</project-working-memory>")
	})
})
