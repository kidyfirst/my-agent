import { describe, it, expect } from "vitest"
import { createAgentCard } from "../src/card.js"

describe("A2A Agent Card", () => {
	it("generates default agent card with valid schema", () => {
		const card = createAgentCard()

		expect(card.name).toBe("My Agent")
		expect(card.version).toBe("0.1.3")
		expect(card.url).toBe("http://localhost:3888/a2a")
		expect(card.capabilities.streaming).toBe(true)
		expect(card.capabilities.stateTransitionHistory).toBe(true)

		// Check skills
		expect(card.skills.length).toBeGreaterThanOrEqual(5)
		const skillIds = card.skills.map((s) => s.id)
		expect(skillIds).toContain("projects/manage")
		expect(skillIds).toContain("threads/manage")
		expect(skillIds).toContain("code-engineering")
		expect(skillIds).toContain("approvals/manage")
		expect(skillIds).toContain("tasks/rollback")
	})

	it("respects custom host, port, and name", () => {
		const card = createAgentCard({
			name: "Custom Agent",
			description: "Custom Description",
			port: 9000,
			host: "127.0.0.1",
		})

		expect(card.name).toBe("Custom Agent")
		expect(card.description).toBe("Custom Description")
		expect(card.url).toBe("http://127.0.0.1:9000/a2a")
	})
})
