import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	getRecentProjectSkillsConfig,
	loadRecentProjects,
	saveRecentProject,
	saveRecentProjectSkillsConfig,
} from "../recent-projects.js"

describe("recent-projects skills config", () => {
	let tempDir: string
	let testFilePath: string
	const originalEnvPath = process.env.MYAGENT_RECENT_PROJECTS_PATH

	beforeEach(() => {
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "recent-projects-skills-test-"),
		)
		testFilePath = path.join(tempDir, "recent-projects.json")
		process.env.MYAGENT_RECENT_PROJECTS_PATH = testFilePath
	})

	afterEach(() => {
		process.env.MYAGENT_RECENT_PROJECTS_PATH = originalEnvPath
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("returns null when no skillsConfig exists for project", () => {
		const projectDir = path.join(tempDir, "sample-project")
		fs.mkdirSync(projectDir, { recursive: true })
		saveRecentProject(projectDir, "sample-project")

		const config = getRecentProjectSkillsConfig(projectDir)
		expect(config).toBeNull()
	})

	it("saves and loads skillsConfig for a project", () => {
		const projectDir = path.join(tempDir, "my-code-repo")
		fs.mkdirSync(projectDir, { recursive: true })
		saveRecentProject(projectDir, "my-code-repo")

		saveRecentProjectSkillsConfig(projectDir, {
			prompted: true,
			enabled: true,
			customDirs: [".my-custom/skills"],
			knownSkills: [
				{
					name: "local-lint",
					path: path.join(projectDir, ".agent/skills/local-lint/SKILL.md"),
					hash: "abc123hash",
				},
			],
		})

		const config = getRecentProjectSkillsConfig(projectDir)
		expect(config).not.toBeNull()
		expect(config?.prompted).toBe(true)
		expect(config?.enabled).toBe(true)
		expect(config?.customDirs).toEqual([".my-custom/skills"])
		expect(config?.knownSkills.length).toBe(1)
		expect(config?.knownSkills[0].name).toBe("local-lint")
	})

	it("merges partial updates to skillsConfig", () => {
		const projectDir = path.join(tempDir, "merge-repo")
		fs.mkdirSync(projectDir, { recursive: true })
		saveRecentProject(projectDir, "merge-repo")

		saveRecentProjectSkillsConfig(projectDir, {
			prompted: true,
			enabled: false,
			knownSkills: [],
		})

		saveRecentProjectSkillsConfig(projectDir, {
			enabled: true,
		})

		const updated = getRecentProjectSkillsConfig(projectDir)
		expect(updated?.prompted).toBe(true)
		expect(updated?.enabled).toBe(true)
	})
})
