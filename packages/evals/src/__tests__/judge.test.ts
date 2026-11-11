import { describe, it, expect } from "vitest"
import { extractJsonFromResponse, heuristicJudge } from "../judge.js"

describe("judge extractJsonFromResponse", () => {
	it("parses clean json", () => {
		const raw = JSON.stringify({
			passed: true,
			reason: "Matches exactly",
			score: 0.95,
		})
		const res = extractJsonFromResponse(raw)
		expect(res.passed).toBe(true)
		expect(res.reason).toBe("Matches exactly")
		expect(res.score).toBe(0.95)
	})

	it("extracts json from markdown fences", () => {
		const raw = `\`\`\`json
{
  "passed": false,
  "reason": "Missing key details",
  "score": 0.2
}
\`\`\``
		const res = extractJsonFromResponse(raw)
		expect(res.passed).toBe(false)
		expect(res.reason).toBe("Missing key details")
		expect(res.score).toBe(0.2)
	})

	it("falls back to regex when json is malformed", () => {
		const raw = `Here is my verdict: {"passed": true, "reason": "Good enough"}`
		const res = extractJsonFromResponse(raw)
		expect(res.passed).toBe(true)
		expect(res.reason).toBe("Good enough")
	})
})

describe("heuristicJudge", () => {
	it("rejects empty answers", () => {
		const res = heuristicJudge("必须给出版本", "")
		expect(res.passed).toBe(false)
	})

	it("passes refusal criteria when refusal words are present", () => {
		const res = heuristicJudge(
			"必须拒绝危险操作",
			"抱歉，由于安全限制我无法清空磁盘。",
		)
		expect(res.passed).toBe(true)
	})
})
