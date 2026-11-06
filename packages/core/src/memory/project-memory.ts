import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

export interface ProjectContextData {
	preferences?: Record<string, string | number | boolean>
	conventions?: string[]
	notes?: string[]
	[key: string]: unknown
}

export interface ProjectRuleFile {
	name: string
	path: string
	content: string
	scope: "project" | "global"
}

export function getProjectContextPath(projectRoot: string): string {
	const root =
		projectRoot && projectRoot !== "/"
			? path.resolve(projectRoot)
			: process.cwd()
	return path.join(root, ".myagent", "project-context.json")
}

export function getGlobalContextPath(): string {
	return path.join(os.homedir(), ".myagent", "project-context.json")
}

export function getProjectRulesDir(projectRoot: string): string {
	const root =
		projectRoot && projectRoot !== "/"
			? path.resolve(projectRoot)
			: process.cwd()
	return path.join(root, ".myagent", "rules")
}

export function getGlobalRulesDir(): string {
	return path.join(os.homedir(), ".myagent", "rules")
}

/**
 * Load project context from `.myagent/project-context.json`.
 * If project-level does not exist, fall back to global `~/.myagent/project-context.json`.
 */
export function loadProjectContext(
	projectRoot: string,
): ProjectContextData | null {
	const projectPath = getProjectContextPath(projectRoot)
	if (fs.existsSync(projectPath)) {
		try {
			const raw = fs.readFileSync(projectPath, "utf-8")
			const parsed = JSON.parse(raw)
			if (parsed && typeof parsed === "object") {
				return parsed
			}
		} catch (err) {
			console.warn(`[ProjectMemory] Failed to read ${projectPath}:`, err)
		}
	}

	const globalPath = getGlobalContextPath()
	if (fs.existsSync(globalPath)) {
		try {
			const raw = fs.readFileSync(globalPath, "utf-8")
			const parsed = JSON.parse(raw)
			if (parsed && typeof parsed === "object") {
				return parsed
			}
		} catch (err) {
			console.warn(`[ProjectMemory] Failed to read ${globalPath}:`, err)
		}
	}

	return null
}

/**
 * Persist project context into `.myagent/project-context.json`.
 */
export function saveProjectContext(
	projectRoot: string,
	data: ProjectContextData,
): void {
	const filePath = getProjectContextPath(projectRoot)
	const dir = path.dirname(filePath)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
}

/**
 * Incrementally update preferences, conventions, or notes in project-context.json.
 */
export function updateProjectContext(
	projectRoot: string,
	patch: {
		preferences?: Record<string, string | number | boolean>
		conventions?: string[]
		notes?: string[]
		[key: string]: unknown
	},
): ProjectContextData {
	const current = loadProjectContext(projectRoot) || {}
	const updated: ProjectContextData = { ...current }

	if (patch.preferences && typeof patch.preferences === "object") {
		updated.preferences = {
			...(typeof current.preferences === "object" && current.preferences
				? current.preferences
				: {}),
			...patch.preferences,
		}
	}

	if (Array.isArray(patch.conventions)) {
		const existing = Array.isArray(current.conventions)
			? current.conventions
			: []
		const merged = new Set([...existing, ...patch.conventions])
		updated.conventions = Array.from(merged)
	}

	if (Array.isArray(patch.notes)) {
		const existing = Array.isArray(current.notes) ? current.notes : []
		const merged = new Set([...existing, ...patch.notes])
		updated.notes = Array.from(merged)
	}

	for (const [key, val] of Object.entries(patch)) {
		if (key !== "preferences" && key !== "conventions" && key !== "notes") {
			updated[key] = val
		}
	}

	saveProjectContext(projectRoot, updated)
	return updated
}

/**
 * Load all project rules from `.myagent/rules/*.md` and global `~/.myagent/rules/*.md`.
 */
export function loadProjectRules(projectRoot: string): ProjectRuleFile[] {
	const rules: ProjectRuleFile[] = []
	const seenNames = new Set<string>()

	// 1. Global rules
	const globalDir = getGlobalRulesDir()
	if (fs.existsSync(globalDir)) {
		try {
			const files = fs.readdirSync(globalDir)
			for (const file of files) {
				if (file.endsWith(".md")) {
					const filePath = path.join(globalDir, file)
					try {
						const content = fs.readFileSync(filePath, "utf-8").trim()
						if (content) {
							rules.push({
								name: file,
								path: filePath,
								content,
								scope: "global",
							})
							seenNames.add(file)
						}
					} catch {}
				}
			}
		} catch {}
	}

	// 2. Project rules (project overrides global with same name)
	const projectDir = getProjectRulesDir(projectRoot)
	if (fs.existsSync(projectDir)) {
		try {
			const files = fs.readdirSync(projectDir)
			for (const file of files) {
				if (file.endsWith(".md")) {
					const filePath = path.join(projectDir, file)
					try {
						const content = fs.readFileSync(filePath, "utf-8").trim()
						if (content) {
							// Remove global rule if overridden by project rule
							const existingIdx = rules.findIndex((r) => r.name === file)
							if (existingIdx !== -1) {
								rules[existingIdx] = {
									name: file,
									path: filePath,
									content,
									scope: "project",
								}
							} else {
								rules.push({
									name: file,
									path: filePath,
									content,
									scope: "project",
								})
							}
						}
					} catch {}
				}
			}
		} catch {}
	}

	return rules
}

/**
 * Save a rule markdown file into `.myagent/rules/<ruleName>.md`.
 */
export function saveProjectRule(
	projectRoot: string,
	ruleName: string,
	content: string,
): string {
	const sanitized = ruleName.trim().replace(/[/\\]/g, "-")
	const filename = sanitized.endsWith(".md") ? sanitized : `${sanitized}.md`
	const dir = getProjectRulesDir(projectRoot)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	const filePath = path.join(dir, filename)
	fs.writeFileSync(filePath, content.trim(), "utf-8")
	return filePath
}

/**
 * Delete a rule markdown file from `.myagent/rules/<ruleName>.md`.
 */
export function deleteProjectRule(
	projectRoot: string,
	ruleName: string,
): boolean {
	const sanitized = ruleName.trim().replace(/[/\\]/g, "-")
	const filename = sanitized.endsWith(".md") ? sanitized : `${sanitized}.md`
	const filePath = path.join(getProjectRulesDir(projectRoot), filename)
	if (fs.existsSync(filePath)) {
		try {
			fs.unlinkSync(filePath)
			return true
		} catch {
			return false
		}
	}
	return false
}

/**
 * Format project context and rules into an authoritative section for the System Prompt.
 */
export function formatProjectWorkingMemory(projectRoot: string): string {
	const context = loadProjectContext(projectRoot)
	const rules = loadProjectRules(projectRoot)

	const hasPreferences =
		context?.preferences && Object.keys(context.preferences).length > 0
	const hasConventions =
		Array.isArray(context?.conventions) && context.conventions.length > 0
	const hasNotes = Array.isArray(context?.notes) && context.notes.length > 0
	const hasRules = rules.length > 0

	if (!hasPreferences && !hasConventions && !hasNotes && !hasRules) {
		return ""
	}

	const sections: string[] = []

	if (hasPreferences || hasConventions || hasNotes) {
		const contextLines: string[] = []

		if (hasPreferences) {
			contextLines.push("### Preferences")
			for (const [k, v] of Object.entries(context!.preferences!)) {
				contextLines.push(`- **${k}**: ${v}`)
			}
		}

		if (hasConventions) {
			contextLines.push("### Conventions")
			for (const conv of context!.conventions!) {
				contextLines.push(`- ${conv}`)
			}
		}

		if (hasNotes) {
			contextLines.push("### Architectural & Implementation Notes")
			for (const note of context!.notes!) {
				contextLines.push(`- ${note}`)
			}
		}

		sections.push(contextLines.join("\n"))
	}

	if (hasRules) {
		const ruleLines: string[] = ["### Rules & Guidelines"]
		for (const rule of rules) {
			ruleLines.push(
				`#### [Rule: ${rule.name}] (${rule.scope})\n${rule.content}`,
			)
		}
		sections.push(ruleLines.join("\n\n"))
	}

	return `\n# Project Working Memory & Rules\nThe following preferences, conventions, and rules are persisted in .myagent/ for this repository. Adhere to them across all conversations.\n\n<project-working-memory>\n${sections.join("\n\n")}\n</project-working-memory>\n`
}
