import { describe, expect, it } from "vitest"
import { createInvokeSkillTool } from "../invoke-skill.js"
import { SkillExecutor } from "../../skills/skill-executor.js"

describe("createInvokeSkillTool", () => {
	it("invokes a skill via the tool and returns execution output", async () => {
		const executor = new SkillExecutor({
			skills: [
				{
					name: "git-commit-helper",
					description: "Generates semantic commit messages",
					scope: "global",
					path: "/mock/git-commit-helper/SKILL.md",
					directory: "/mock/git-commit-helper",
					instructions: "Format: feat(scope): message",
					enabled: true,
				},
			],
		})

		const tool = createInvokeSkillTool(executor)
		expect(tool.id).toBe("invoke_skill")

		const result = await (tool as any).execute({
			skill_name: "git-commit-helper",
			parameters: { diff: "changed files" },
		})

		expect(result).toContain("Skill Activated: git-commit-helper")
		expect(result).toContain("Format: feat(scope): message")
	})
})
