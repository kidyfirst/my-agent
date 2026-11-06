import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import {
	loadProjectContext,
	updateProjectContext,
	loadProjectRules,
	saveProjectRule,
	deleteProjectRule,
	type ProjectContextData,
} from "../memory/project-memory.js"

export function createProjectMemoryTool(defaultProjectRoot?: string) {
	return createTool({
		id: "project_memory",
		description:
			"Manage persistent project-level working memory and rules stored under .myagent/. Use this tool to read, update, or record project preferences (e.g. packageManager, testFramework), conventions, architecture notes, or custom rule files (.myagent/rules/*.md). Everything recorded here is persistent and automatically injected into all future conversations for this project.",
		inputSchema: z.object({
			action: z
				.enum([
					"read",
					"update_context",
					"save_rule",
					"delete_rule",
					"list_rules",
				])
				.describe(
					"The action to perform: 'read' (inspect memory and rules), 'update_context' (record/merge preferences, conventions, notes in project-context.json), 'save_rule' (save a .myagent/rules/<ruleName>.md guideline file), 'delete_rule' (remove a rule), 'list_rules' (list rule files)",
				),
			preferences: z
				.record(z.union([z.string(), z.number(), z.boolean()]))
				.optional()
				.describe(
					"Key-value project preferences (e.g. { packageManager: 'pnpm', styling: 'tailwind4' }) for 'update_context'",
				),
			conventions: z
				.array(z.string())
				.optional()
				.describe(
					"List of project coding or architectural conventions to remember for 'update_context'",
				),
			notes: z
				.array(z.string())
				.optional()
				.describe(
					"Important implementation or design notes to remember for 'update_context'",
				),
			ruleName: z
				.string()
				.optional()
				.describe(
					"Name of the rule (e.g. 'coding-style' or 'git-workflow') for 'save_rule' or 'delete_rule'",
				),
			ruleContent: z
				.string()
				.optional()
				.describe("Markdown content of the rule guideline for 'save_rule'"),
		}),
		execute: async (
			{ action, preferences, conventions, notes, ruleName, ruleContent },
			context,
		) => {
			const reqCtx = context?.requestContext
			const harness = (reqCtx?.get?.("harness") ||
				reqCtx?.get?.("controller")) as any
			const state = harness?.state ?? harness?.getState?.()
			const projectRoot =
				state?.projectPath || defaultProjectRoot || process.cwd()

			switch (action) {
				case "read": {
					const ctx = loadProjectContext(projectRoot)
					const rules = loadProjectRules(projectRoot)
					return {
						success: true,
						projectRoot,
						context: ctx,
						rules: rules.map((r) => ({
							name: r.name,
							scope: r.scope,
							content: r.content,
						})),
						message: "Project working memory and rules retrieved successfully.",
					}
				}
				case "update_context": {
					if (!preferences && !conventions && !notes) {
						return {
							success: false,
							error:
								"At least one of 'preferences', 'conventions', or 'notes' must be provided for 'update_context'.",
						}
					}
					const updated = updateProjectContext(projectRoot, {
						preferences,
						conventions,
						notes,
					})
					return {
						success: true,
						projectRoot,
						updatedContext: updated,
						message:
							"Project context updated in .myagent/project-context.json and will be active in all future turns.",
					}
				}
				case "save_rule": {
					if (!ruleName || !ruleName.trim()) {
						return {
							success: false,
							error: "'ruleName' is required for 'save_rule'.",
						}
					}
					if (!ruleContent || !ruleContent.trim()) {
						return {
							success: false,
							error: "'ruleContent' is required for 'save_rule'.",
						}
					}
					const filePath = saveProjectRule(projectRoot, ruleName, ruleContent)
					return {
						success: true,
						projectRoot,
						rulePath: filePath,
						message: `Rule saved to ${filePath} and will be enforced across all conversations in this repository.`,
					}
				}
				case "delete_rule": {
					if (!ruleName || !ruleName.trim()) {
						return {
							success: false,
							error: "'ruleName' is required for 'delete_rule'.",
						}
					}
					const deleted = deleteProjectRule(projectRoot, ruleName)
					return {
						success: deleted,
						message: deleted
							? `Rule '${ruleName}' was successfully deleted.`
							: `Rule '${ruleName}' was not found.`,
					}
				}
				case "list_rules": {
					const rules = loadProjectRules(projectRoot)
					return {
						success: true,
						projectRoot,
						rules: rules.map((r) => ({
							name: r.name,
							scope: r.scope,
							path: r.path,
						})),
					}
				}
				default:
					return {
						success: false,
						error: `Unknown action '${action}'`,
					}
			}
		},
	})
}
