import type { IpcCommandHandler } from "./types.js"
import {
	SkillManager,
	getRecentProjectSkillsConfig,
	type Skill,
} from "@my-agent/core"

export interface SlashCommandHandlerDeps {
	getProjectSkills?: (projectRoot: string) => Promise<Skill[]>
	getGlobalSkills?: () => Promise<Skill[]>
	skillManager?: SkillManager
}

const BUILTIN_COMMANDS = [
	{
		name: "new",
		description: "Start a new thread",
		builtin: true,
		category: "command",
	},
	{
		name: "clear",
		description: "Clear current conversation",
		builtin: true,
		category: "command",
	},
	{
		name: "refresh",
		description: "Rescan and refresh skills in the current project",
		builtin: true,
		category: "command",
	},
	{
		name: "react",
		description: "Switch to ReAct mode",
		builtin: true,
		category: "command",
	},
	{
		name: "fast",
		description: "Switch to Fast mode",
		builtin: true,
		category: "command",
	},
	{
		name: "plan",
		description: "Switch to Plan & Solve mode",
		builtin: true,
		category: "command",
	},
	{
		name: "graph",
		description: "View execution graph",
		builtin: true,
		category: "command",
	},
	{
		name: "settings",
		description: "Open settings",
		builtin: true,
		category: "command",
	},
	{
		name: "record",
		description: "Start or stop session recording",
		builtin: true,
		category: "command",
	},
	{
		name: "replay",
		description: "Upload and replay a recorded session",
		builtin: true,
		category: "command",
	},
	{
		name: "help",
		description: "Show keyboard shortcuts & tips",
		builtin: true,
		category: "command",
	},
]

export function getSlashCommandHandlers(
	deps: SlashCommandHandlerDeps = {},
): Record<string, IpcCommandHandler> {
	const skillManager = deps.skillManager || new SkillManager()

	return {
		getSlashCommands: async (_command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const { loadCustomCommands } = await import("@my-agent/core")

			// 1. Project skills
			let projectSkills: Skill[] = []
			if (deps.getProjectSkills) {
				projectSkills = await deps.getProjectSkills(projectRoot)
			} else if (projectRoot) {
				const config = getRecentProjectSkillsConfig(projectRoot)
				if (config?.enabled !== false) {
					projectSkills = await skillManager.scanProjectSkills(
						projectRoot,
						config?.customDirs,
					)
				}
			}

			const projectSkillItems = projectSkills
				.filter((s) => s.enabled !== false)
				.map((s) => ({
					name: s.name,
					description: s.description,
					category: "project_skill" as const,
					skillScope: "project" as const,
					skill: s,
				}))

			// 2. Global skills
			let globalSkills: Skill[] = []
			if (deps.getGlobalSkills) {
				globalSkills = await deps.getGlobalSkills()
			} else {
				globalSkills = await skillManager.scanGlobalSkills()
			}

			const globalSkillItems = globalSkills
				.filter((s) => s.enabled !== false)
				.map((s) => ({
					name: s.name,
					description: s.description,
					category: "global_skill" as const,
					skillScope: "global" as const,
					skill: s,
				}))

			// 3. Builtin and custom commands
			const custom = await loadCustomCommands(projectRoot)
			const commandItems = [
				...BUILTIN_COMMANDS,
				...custom.map((c: any) => ({ ...c, category: "command" as const })),
			]

			// Hierarchy: Project Skills -> Global Skills -> Commands
			return [...projectSkillItems, ...globalSkillItems, ...commandItems]
		},

		processSlashCommand: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			if (command.commandName === "refresh") {
				const config = getRecentProjectSkillsConfig(projectRoot)
				const scanResult = await skillManager.detectProjectSkillsChanges(
					projectRoot,
					config?.knownSkills || [],
					config?.customDirs || [],
				)
				return {
					type: "skills_refresh",
					...scanResult,
				}
			}

			// 1. Check if commandName matches a project or global skill
			let projectSkills: Skill[] = []
			if (deps.getProjectSkills) {
				projectSkills = await deps.getProjectSkills(projectRoot)
			} else if (projectRoot) {
				const config = getRecentProjectSkillsConfig(projectRoot)
				if (config?.enabled !== false) {
					projectSkills = await skillManager.scanProjectSkills(
						projectRoot,
						config?.customDirs,
					)
				}
			}

			let globalSkills: Skill[] = []
			if (deps.getGlobalSkills) {
				globalSkills = await deps.getGlobalSkills()
			} else {
				globalSkills = await skillManager.scanGlobalSkills()
			}

			const allSkills = [...projectSkills, ...globalSkills]
			const targetName = String(command.commandName || "")
				.toLowerCase()
				.trim()
			const matchedSkill = allSkills.find(
				(s) => s.name.toLowerCase() === targetName && s.enabled !== false,
			)

			let validSkill: Skill | undefined
			if (matchedSkill) {
				try {
					const fs = await import("fs")
					if (!matchedSkill.path || fs.existsSync(matchedSkill.path)) {
						validSkill = matchedSkill
					}
				} catch {
					validSkill = matchedSkill
				}
			}

			if (validSkill) {
				let instructions = validSkill.instructions
				if (!instructions && validSkill.path) {
					try {
						const fs = await import("fs")
						if (fs.existsSync(validSkill.path)) {
							const raw = fs.readFileSync(validSkill.path, "utf-8")
							const bodyMatch = raw.match(/^---\s*[\s\S]*?---\s*([\s\S]*)$/)
							instructions = bodyMatch ? bodyMatch[1].trim() : raw.trim()
						}
					} catch {}
				}

				const userArgs = Array.isArray(command.args)
					? command.args.join(" ").trim()
					: String(command.args || "").trim()

				const promptParts: string[] = []
				promptParts.push(
					`# Activated Skill: ${validSkill.name} (${validSkill.scope} skill)`,
				)
				if (validSkill.description) {
					promptParts.push(`Description: ${validSkill.description}`)
				}
				promptParts.push(
					`\n## Skill Instructions\n${instructions || "Follow the skill guidelines."}`,
				)
				if (userArgs) {
					promptParts.push(`\n## User Task\n${userArgs}`)
				} else {
					promptParts.push(
						`\n## User Task\nPlease introduce yourself and your capabilities as ${validSkill.name}, and guide the user on how to proceed.`,
					)
				}

				return promptParts.join("\n")
			}

			// 2. Otherwise fall back to legacy custom commands (.my-agent/commands/)
			try {
				const { loadCustomCommands, processSlashCommand } =
					await import("@my-agent/core")
				const commands = await loadCustomCommands(projectRoot)
				const cmd = commands.find(
					(c: { name: string }) => c.name.toLowerCase() === targetName,
				)
				if (cmd) {
					return await processSlashCommand(cmd, command.args ?? [], projectRoot)
				}
			} catch {
				// Ignore custom command lookup errors and fall back gracefully
			}

			// 3. If neither a skill nor custom command is found, return null so renderer keeps raw user input
			return null
		},
	}
}
