import { describe, expect, it } from "vitest"
import { buildFullPrompt } from "../index.js"
import { SkillExecutor } from "../../skills/skill-executor.js"
import type { Skill } from "../../skills/types.js"

describe("skills prompt injection", () => {
	const baseCtx = {
		modeId: "react",
		currentDate: "2026-11-12",
		workingDir: "/workspace/test-app",
		projectName: "test-app",
		toolNames: ["view", "invoke_skill"],
	}

	it("injects compact available-skills catalog into system prompt when provided", () => {
		const skills: Skill[] = [
			{
				name: "project-refactor",
				description: "Refactor legacy components into modern TypeScript",
				scope: "project",
				path: "/workspace/test-app/.agent/skills/refactor/SKILL.md",
				directory: "/workspace/test-app/.agent/skills/refactor",
				enabled: true,
			},
			{
				name: "huashu-design",
				description: "HTML-native design skill for UI and prototypes",
				scope: "global",
				path: "/home/.my-agent/skills/huashu-design/SKILL.md",
				directory: "/home/.my-agent/skills/huashu-design",
				enabled: true,
			},
		]

		const executor = new SkillExecutor({ skills })
		const catalog = executor.formatStage1Catalog()

		const prompt = buildFullPrompt({
			...baseCtx,
			skillsCatalog: catalog,
		})

		expect(prompt).toContain("<available-skills>")
		expect(prompt).toContain("Project Skills (Current Workspace):")
		expect(prompt).toContain(
			"- project-refactor: Refactor legacy components into modern TypeScript",
		)
		expect(prompt).toContain("Global Skills (Installed):")
		expect(prompt).toContain(
			"- huashu-design: HTML-native design skill for UI and prototypes",
		)
		expect(prompt).toContain("invoke_skill")
		expect(prompt).toContain("</available-skills>")
	})

	it("omits skills catalog when empty", () => {
		const executor = new SkillExecutor({ skills: [] })
		const catalog = executor.formatStage1Catalog()

		const prompt = buildFullPrompt({
			...baseCtx,
			skillsCatalog: catalog,
		})

		expect(prompt).not.toContain("<available-skills>")
	})
})
