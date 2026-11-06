import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { buildFullPrompt } from "../index.js"
import {
	saveProjectContext,
	saveProjectRule,
} from "../../memory/project-memory.js"

describe("project working memory prompt injection", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-prompt-test-"))
	})

	afterEach(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		} catch {}
	})

	it("omits project working memory section when .myagent is empty", () => {
		const prompt = buildFullPrompt({
			projectPath: tmpDir,
			projectName: "test-proj",
			platform: "darwin",
			date: "2026-11-06",
			currentDate: "2026-11-06",
			workingDir: tmpDir,
			modeId: "react",
			toolNames: ["view"],
		})
		expect(prompt).not.toContain("<project-working-memory>")
	})

	it("injects project-context and rules into buildFullPrompt", () => {
		saveProjectContext(tmpDir, {
			preferences: {
				language: "zh-CN",
				packageManager: "pnpm",
			},
			conventions: ["Use TypeScript strict mode"],
		})
		saveProjectRule(tmpDir, "style-guide", "Always write clean code.")

		const prompt = buildFullPrompt({
			projectPath: tmpDir,
			projectName: "test-proj",
			platform: "darwin",
			date: "2026-11-06",
			currentDate: "2026-11-06",
			workingDir: tmpDir,
			modeId: "react",
			toolNames: ["view", "project_memory"],
		})

		expect(prompt).toContain("<project-working-memory>")
		expect(prompt).toContain("**language**: zh-CN")
		expect(prompt).toContain("**packageManager**: pnpm")
		expect(prompt).toContain("Use TypeScript strict mode")
		expect(prompt).toContain("[Rule: style-guide.md]")
		expect(prompt).toContain("Always write clean code.")
	})
})
