import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SkillManager } from "../skill-manager.js"

describe("SkillManager", () => {
	let tempDir: string
	let projectDir: string
	let globalSkillsDir: string
	let manager: SkillManager

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-manager-test-"))
		projectDir = path.join(tempDir, "test-project")
		globalSkillsDir = path.join(tempDir, "global-skills")
		fs.mkdirSync(projectDir, { recursive: true })
		fs.mkdirSync(globalSkillsDir, { recursive: true })

		manager = new SkillManager({ globalSkillsDir })
	})

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	it("discovers project skills from .myagent/skills, supported compatibility directories and custom directories", async () => {
		// 1. .myagent/skills/myagent-skill/SKILL.md (primary directory)
		const myagentSkillDir = path.join(
			projectDir,
			".myagent",
			"skills",
			"myagent-skill",
		)
		fs.mkdirSync(myagentSkillDir, { recursive: true })
		fs.writeFileSync(
			path.join(myagentSkillDir, "SKILL.md"),
			`---
name: myagent-skill
description: Skill from .myagent folder
---
# MyAgent Skill
Do something smart.`,
		)

		// 2. .agent/skills/agent-skill/SKILL.md
		const agentSkillDir = path.join(
			projectDir,
			".agent",
			"skills",
			"agent-skill",
		)
		fs.mkdirSync(agentSkillDir, { recursive: true })
		fs.writeFileSync(
			path.join(agentSkillDir, "SKILL.md"),
			`---
name: agent-skill
description: Skill from agent folder
---
# Agent Skill
Do something smart.`,
		)

		// 3. .claude/skills/claude-skill/SKILL.md
		const claudeSkillDir = path.join(
			projectDir,
			".claude",
			"skills",
			"claude-skill",
		)
		fs.mkdirSync(claudeSkillDir, { recursive: true })
		fs.writeFileSync(
			path.join(claudeSkillDir, "SKILL.md"),
			`---
name: claude-skill
description: Skill from claude folder
---
# Claude Skill`,
		)

		// 4. Custom dir: custom/my-skills/custom-skill/SKILL.md
		const customDir = path.join(
			projectDir,
			"custom",
			"my-skills",
			"custom-skill",
		)
		fs.mkdirSync(customDir, { recursive: true })
		fs.writeFileSync(
			path.join(customDir, "SKILL.md"),
			`---
name: custom-skill
description: Skill from custom folder
---
# Custom Skill`,
		)

		const skills = await manager.scanProjectSkills(projectDir, [
			"custom/my-skills",
		])
		expect(skills.length).toBe(4)
		const names = skills.map((s) => s.name).sort()
		expect(names).toEqual([
			"agent-skill",
			"claude-skill",
			"custom-skill",
			"myagent-skill",
		])
		expect(skills.every((s) => s.scope === "project")).toBe(true)
	})

	it("detects additions, modifications, and removals for /refresh", async () => {
		const skillDir = path.join(projectDir, ".agent", "skills", "test-skill")
		fs.mkdirSync(skillDir, { recursive: true })
		const skillFile = path.join(skillDir, "SKILL.md")
		fs.writeFileSync(
			skillFile,
			`---
name: test-skill
description: Original description
---
Initial content`,
		)

		const initialScan = await manager.scanProjectSkills(projectDir)
		expect(initialScan.length).toBe(1)
		const initialSkill = initialScan[0]

		const knownSkills = [
			{
				name: initialSkill.name,
				path: initialSkill.path,
				hash: initialSkill.hash!,
			},
		]

		// 1. No changes
		const scanNoChange = await manager.detectProjectSkillsChanges(
			projectDir,
			knownSkills,
		)
		expect(scanNoChange.hasChanges).toBe(false)
		expect(scanNoChange.added.length).toBe(0)
		expect(scanNoChange.removed.length).toBe(0)
		expect(scanNoChange.modified.length).toBe(0)

		// 2. Modification (content change)
		fs.writeFileSync(
			skillFile,
			`---
name: test-skill
description: Updated description
---
Updated content with new instructions`,
		)

		const scanModified = await manager.detectProjectSkillsChanges(
			projectDir,
			knownSkills,
		)
		expect(scanModified.hasChanges).toBe(true)
		expect(scanModified.modified.length).toBe(1)
		expect(scanModified.modified[0].name).toBe("test-skill")

		// 3. Addition
		const newSkillDir = path.join(projectDir, ".codex", "skills", "new-skill")
		fs.mkdirSync(newSkillDir, { recursive: true })
		fs.writeFileSync(
			path.join(newSkillDir, "SKILL.md"),
			`---
name: new-skill
description: Brand new skill
---
New content`,
		)

		const scanAdded = await manager.detectProjectSkillsChanges(
			projectDir,
			knownSkills,
		)
		expect(scanAdded.hasChanges).toBe(true)
		expect(scanAdded.added.length).toBe(1)
		expect(scanAdded.added[0].name).toBe("new-skill")

		// 4. Removal
		fs.rmSync(skillDir, { recursive: true, force: true })
		const scanRemoved = await manager.detectProjectSkillsChanges(
			projectDir,
			knownSkills,
		)
		expect(scanRemoved.hasChanges).toBe(true)
		expect(scanRemoved.removed.length).toBe(1)
		expect(scanRemoved.removed[0].name).toBe("test-skill")
	})

	it("installs, audits, lists, and uninstalls global skills", async () => {
		const skillContent = `---
name: huashu-design
description: HTML-native design skill for UI, PPTX, and prototypes
author: alchaincyf
permissions: []
---
# Huashu Design
Instructions for design.`

		const installResult = await manager.installSkill({
			name: "huashu-design",
			owner: "alchaincyf",
			repositoryUrl: "https://github.com/alchaincyf/huashu-design",
			headSha: "804f2193ef39e9cbe68c0e23d0701141f440a344",
			manifestContent: skillContent,
			files: { "SKILL.md": skillContent },
		})

		expect(installResult.success).toBe(true)
		expect(installResult.auditReport.safe).toBe(true)

		const installedSkills = await manager.scanGlobalSkills()
		expect(installedSkills.length).toBe(1)
		expect(installedSkills[0].name).toBe("huashu-design")
		expect(installedSkills[0].scope).toBe("global")
		expect(installedSkills[0].installedSha).toBe(
			"804f2193ef39e9cbe68c0e23d0701141f440a344",
		)

		// Check updates detection
		const updatedSkills = await manager.checkUpdates([
			{
				name: "huashu-design",
				fullName: "alchaincyf/huashu-design",
				owner: "alchaincyf",
				description: "Updated description",
				headSha: "newer-sha-99999999",
			},
		])

		expect(updatedSkills.length).toBe(1)
		expect(updatedSkills[0].hasUpdate).toBe(true)
		expect(updatedSkills[0].latestSha).toBe("newer-sha-99999999")

		// Uninstall
		const uninstallResult = await manager.uninstallSkill("huashu-design")
		expect(uninstallResult).toBe(true)

		const remaining = await manager.scanGlobalSkills()
		expect(remaining.length).toBe(0)
	})
})
