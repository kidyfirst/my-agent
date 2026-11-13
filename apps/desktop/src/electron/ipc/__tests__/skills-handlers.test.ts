import { describe, expect, it, vi, beforeEach } from "vitest"
import type { IpcContext } from "../types.js"

let mockSettingsState: Record<string, any> = {}

vi.mock("@my-agent/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@my-agent/core")>()
	return {
		...actual,
		loadSettings: () => ({ ...actual.DEFAULT_SETTINGS, ...mockSettingsState }),
		saveSettings: (s: any) => {
			mockSettingsState = { ...s }
		},
	}
})

import { getSkillsHandlers } from "../skills-handlers.js"
import { getSlashCommandHandlers } from "../slash-command-handlers.js"

describe("skills-handlers and slash commands integration", () => {
	const mockCtx = {
		getActiveSession: () => ({
			projectRoot: "/mock/project",
		}),
	} as unknown as IpcContext

	it("registers skills IPC handlers and fetches categories", async () => {
		const handlers = getSkillsHandlers()
		expect(handlers.getSkillHubCategories).toBeDefined()
		expect(handlers.getInstalledSkills).toBeDefined()
		expect(handlers.auditSkill).toBeDefined()
		expect(handlers.installSkill).toBeDefined()
		expect(handlers.uninstallSkill).toBeDefined()
		expect(handlers.getSkillHubSources).toBeDefined()
		expect(handlers.addSkillHubSource).toBeDefined()
		expect(handlers.removeSkillHubSource).toBeDefined()
		expect(handlers.setActiveSkillHubSource).toBeDefined()
		expect(handlers.validateSkillHubSource).toBeDefined()

		const categories = await handlers.getSkillHubCategories({}, mockCtx)
		expect(Array.isArray(categories)).toBe(true)
		expect(categories.length).toBeGreaterThan(0)
	})

	it("returns hierarchical slash commands: project skills first, global skills second, commands third", async () => {
		const slashHandlers = getSlashCommandHandlers({
			getProjectSkills: async () => [
				{
					name: "project-linter",
					description: "Workspace custom linter",
					scope: "project",
					enabled: true,
				},
			],
			getGlobalSkills: async () => [
				{
					name: "huashu-design",
					description: "Global design skill",
					scope: "global",
					enabled: true,
				},
			],
		} as any)

		const commands = (await slashHandlers.getSlashCommands(
			{},
			mockCtx,
		)) as Array<{ name: string; category?: string }>

		expect(commands.length).toBeGreaterThan(2)

		// First item is project skill
		expect(commands[0].name).toBe("project-linter")
		expect(commands[0].category).toBe("project_skill")

		// Second item is global skill
		expect(commands[1].name).toBe("huashu-design")
		expect(commands[1].category).toBe("global_skill")

		// Commands follow
		const cmdItems = commands.filter((c) => c.category === "command")
		expect(cmdItems.length).toBeGreaterThan(0)
		expect(cmdItems.some((c) => c.name === "refresh")).toBe(true)
	})

	it("processSlashCommand activates and hydrates skills when invoked as a slash command", async () => {
		const slashHandlers = getSlashCommandHandlers({
			getProjectSkills: async () => [],
			getGlobalSkills: async () => [
				{
					name: "Study-Mate",
					description: "AI study partner skill",
					scope: "global",
					instructions: "You are Study-Mate. Follow study plan procedures.",
					enabled: true,
				},
			],
		} as any)

		const result = (await slashHandlers.processSlashCommand(
			{
				commandName: "Study-Mate",
				args: ["introduce", "the", "project"],
			},
			mockCtx,
		)) as string

		expect(typeof result).toBe("string")
		expect(result).toContain("# Activated Skill: Study-Mate (global skill)")
		expect(result).toContain(
			"You are Study-Mate. Follow study plan procedures.",
		)
		expect(result).toContain("introduce the project")
	})

	it("processSlashCommand returns null when skill or command is not found or skill file was removed", async () => {
		const slashHandlers = getSlashCommandHandlers({
			getProjectSkills: async () => [
				{
					name: "deleted-skill",
					path: "/non/existent/path/SKILL.md",
					scope: "project",
					enabled: true,
				},
			],
			getGlobalSkills: async () => [],
		} as any)

		// 1. Skill whose file on disk was deleted returns null without throwing
		const deletedResult = await slashHandlers.processSlashCommand(
			{
				commandName: "deleted-skill",
				args: [],
			},
			mockCtx,
		)
		expect(deletedResult).toBeNull()

		// 2. Completely unknown command returns null without throwing error
		const unknownResult = await slashHandlers.processSlashCommand(
			{
				commandName: "skill-a",
				args: ["test"],
			},
			mockCtx,
		)
		expect(unknownResult).toBeNull()
	})

	it("manages SkillHub sources: gets builtin sources, sets active source, removes sources", async () => {
		const handlers = getSkillsHandlers()

		// 1. Get default sources
		const initial = (await handlers.getSkillHubSources({}, mockCtx)) as {
			sources: Array<{ name: string; url: string; isBuiltin?: boolean }>
			activeSourceUrl: string
		}
		expect(Array.isArray(initial.sources)).toBe(true)
		expect(initial.sources.some((s) => s.name === "skillhub.cn")).toBe(true)
		expect(initial.sources.some((s) => s.name === "clawhub.ai")).toBe(true)
		expect(initial.activeSourceUrl).toBeDefined()

		// 2. Set active source
		const setOk = await handlers.setActiveSkillHubSource(
			{ url: "https://clawhub.ai" },
			mockCtx,
		)
		expect(setOk).toBe(true)

		const afterSet = (await handlers.getSkillHubSources({}, mockCtx)) as {
			sources: Array<{ name: string; url: string }>
			activeSourceUrl: string
		}
		expect(afterSet.activeSourceUrl).toBe("https://clawhub.ai")

		// 3. Reset active source back to default
		await handlers.setActiveSkillHubSource(
			{ url: "https://api.skillhub.cn" },
			mockCtx,
		)

		// 4. Validate source with invalid URL returns error without crashing
		const invalidRes = (await handlers.validateSkillHubSource(
			{ url: "" },
			mockCtx,
		)) as { valid: boolean; error?: string }
		expect(invalidRes.valid).toBe(false)
		expect(invalidRes.error).toBeDefined()
	})
})
