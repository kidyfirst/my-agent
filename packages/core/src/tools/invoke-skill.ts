import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import type { SkillExecutor } from "../skills/skill-executor.js"

export function createInvokeSkillTool(executor: SkillExecutor) {
	return createTool({
		id: "invoke_skill",
		description:
			"Activate and load full instructions for a specialized skill from the available skills catalog. Use this when a user request matches a skill listed under <available-skills>.",
		inputSchema: z.object({
			skill_name: z
				.string()
				.describe(
					"The exact name identifier of the skill to invoke (e.g. 'huashu-design')",
				),
			parameters: z
				.record(z.any())
				.optional()
				.describe(
					"Optional key-value parameters or contextual inputs for the skill",
				),
		}),
		execute: async (context: {
			skill_name: string
			parameters?: Record<string, unknown>
		}) => {
			const res = await executor.invokeSkill({
				skillName: context.skill_name,
				parameters: context.parameters,
			})
			return res.output
		},
	})
}
