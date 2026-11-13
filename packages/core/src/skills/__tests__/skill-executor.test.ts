import { describe, expect, it } from "vitest"
import { SkillExecutor } from "../skill-executor.js"
import type { Skill } from "../types.js"

describe("SkillExecutor", () => {
	const sampleSkill: Skill = {
		name: "json-formatter",
		description: "Formats and validates JSON content",
		scope: "project",
		path: "/mock/skills/json-formatter/SKILL.md",
		directory: "/mock/skills/json-formatter",
		enabled: true,
		instructions: `## JSON Formatter Guidelines
1. Parse the input string.
2. Format with 2 spaces indentation.`,
	}

	it("hydrates skill instructions dynamically on invoke (Stage 2 progressive disclosure)", async () => {
		const executor = new SkillExecutor({
			skills: [sampleSkill],
		})

		const result = await executor.invokeSkill({
			skillName: "json-formatter",
			parameters: { input: '{"a":1}' },
		})

		expect(result.success).toBe(true)
		expect(result.output).toContain("JSON Formatter Guidelines")
		expect(result.output).toContain("Format with 2 spaces indentation")
	})

	it("returns natural language feedback for unknown skill", async () => {
		const executor = new SkillExecutor({
			skills: [sampleSkill],
		})

		const result = await executor.invokeSkill({
			skillName: "non-existent-skill",
			parameters: {},
		})

		expect(result.success).toBe(false)
		expect(result.output).toContain("Skill 'non-existent-skill' not found")
		expect(result.output).toContain("Available skills: json-formatter")
	})

	it("truncates oversized output to prevent context explosion", async () => {
		const verboseSkill: Skill = {
			name: "verbose-skill",
			description: "Outputs huge text",
			scope: "project",
			path: "/mock/verbose/SKILL.md",
			directory: "/mock/verbose",
			enabled: true,
			instructions: "A".repeat(10000),
		}

		const executor = new SkillExecutor({
			skills: [verboseSkill],
			maxOutputLength: 2000,
		})

		const result = await executor.invokeSkill({
			skillName: "verbose-skill",
			parameters: {},
		})

		expect(result.success).toBe(true)
		expect(result.output.length).toBeLessThanOrEqual(2100) // includes truncation notice
		expect(result.output).toContain(
			"[Output truncated to stay within token limits]",
		)
	})

	it("enforces circuit breaker for consecutive calls", async () => {
		const executor = new SkillExecutor({
			skills: [sampleSkill],
			maxCallsPerTurn: 3,
		})

		await executor.invokeSkill({ skillName: "json-formatter" })
		await executor.invokeSkill({ skillName: "json-formatter" })
		await executor.invokeSkill({ skillName: "json-formatter" })

		const fourthCall = await executor.invokeSkill({
			skillName: "json-formatter",
		})
		expect(fourthCall.success).toBe(false)
		expect(fourthCall.output).toContain(
			"Circuit breaker tripped: Maximum 3 skill invocations",
		)
	})
})
