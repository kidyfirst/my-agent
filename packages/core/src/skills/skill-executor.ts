import * as fs from "fs"
import type { Skill } from "./types.js"

export interface SkillExecutorOptions {
	skills?: Skill[]
	maxCallsPerTurn?: number
	timeoutMs?: number
	maxOutputLength?: number
}

export interface InvokeSkillOptions {
	skillName: string
	parameters?: Record<string, unknown>
}

export interface SkillExecutionResult {
	success: boolean
	output: string
	skill?: Skill
}

export class SkillExecutor {
	skills: Skill[]
	readonly maxCallsPerTurn: number
	readonly timeoutMs: number
	readonly maxOutputLength: number
	private callCount: number = 0

	constructor(options: SkillExecutorOptions = {}) {
		this.skills = options.skills || []
		this.maxCallsPerTurn = options.maxCallsPerTurn ?? 5
		this.timeoutMs = options.timeoutMs ?? 25000
		this.maxOutputLength = options.maxOutputLength ?? 6000
	}

	setSkills(skills: Skill[]): void {
		this.skills = skills
	}

	resetTurn(): void {
		this.callCount = 0
	}

	async invokeSkill(
		options: InvokeSkillOptions,
	): Promise<SkillExecutionResult> {
		this.callCount++
		if (this.callCount > this.maxCallsPerTurn) {
			return {
				success: false,
				output: `Circuit breaker tripped: Maximum ${this.maxCallsPerTurn} skill invocations reached for this turn to prevent infinite loops. Review the problem and proceed manually or complete the task.`,
			}
		}

		const targetName = normalizeSkillName(options.skillName)
		const skill = this.skills.find(
			(s) => normalizeSkillName(s.name) === targetName && s.enabled !== false,
		)

		if (!skill) {
			const availableNames = this.skills
				.filter((s) => s.enabled !== false)
				.map((s) => s.name)
			return {
				success: false,
				output: `Skill '${options.skillName}' not found. Available skills: ${
					availableNames.length > 0 ? availableNames.join(", ") : "None"
				}. Please verify the skill name.`,
			}
		}

		// Stage 2: Hydrate full instructions
		let instructions = skill.instructions
		if (!instructions && skill.path && fs.existsSync(skill.path)) {
			try {
				const raw = fs.readFileSync(skill.path, "utf-8")
				const bodyMatch = raw.match(/^---\s*[\s\S]*?---\s*([\s\S]*)$/)
				instructions = bodyMatch ? bodyMatch[1].trim() : raw.trim()
			} catch (err) {
				return {
					success: false,
					output: `Failed to load instructions for skill '${skill.name}': ${
						err instanceof Error ? err.message : String(err)
					}`,
				}
			}
		}

		let output = `# Skill Activated: ${skill.name} (${skill.scope} skill)\n\n${
			instructions || "No detailed instructions provided."
		}`

		if (options.parameters && Object.keys(options.parameters).length > 0) {
			output += `\n\n### Provided Invocation Parameters\n\`\`\`json\n${JSON.stringify(
				options.parameters,
				null,
				2,
			)}\n\`\`\``
		}

		// Output truncation to prevent context explosion
		if (output.length > this.maxOutputLength) {
			output = `${output.slice(
				0,
				this.maxOutputLength,
			)}\n\n... [Output truncated to stay within token limits] (${
				output.length - this.maxOutputLength
			} characters omitted)`
		}

		return {
			success: true,
			output,
			skill,
		}
	}

	/**
	 * Formats Stage 1 progressive disclosure catalog for System Prompt.
	 * Kept compact (name + 1-sentence description) to avoid context bloat.
	 */
	formatStage1Catalog(skills: Skill[] = this.skills): string {
		const activeSkills = skills.filter((s) => s.enabled !== false)
		if (activeSkills.length === 0) return ""

		const projectSkills = activeSkills.filter((s) => s.scope === "project")
		const globalSkills = activeSkills.filter((s) => s.scope === "global")

		const lines: string[] = ["<available-skills>"]
		lines.push(
			"You have access to specialized skills. To activate and view complete instructions for any skill, call the `invoke_skill` tool with the skill's name.\n" +
				"Directory Convention: In MyAgent, project skills belong in `.myagent/skills/<skill-name>/SKILL.md`. When asked to create, write, or install a skill for the workspace, always save it to `.myagent/skills/<skill-name>/SKILL.md`.",
		)

		if (projectSkills.length > 0) {
			lines.push("\nProject Skills (Current Workspace):")
			for (const s of projectSkills) {
				lines.push(
					`- ${s.name}: ${s.description || "No description"} (path: ${s.path})`,
				)
			}
		}

		if (globalSkills.length > 0) {
			lines.push("\nGlobal Skills (Installed):")
			for (const s of globalSkills) {
				lines.push(
					`- ${s.name}: ${s.description || "No description"} (path: ${s.path})`,
				)
			}
		}

		lines.push("</available-skills>")
		return lines.join("\n")
	}
}

function normalizeSkillName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
}
