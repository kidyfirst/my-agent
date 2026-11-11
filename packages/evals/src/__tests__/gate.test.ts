import { describe, it, expect } from "vitest"
import { checkRegressionGate } from "../gate.js"
import type { EvalReport } from "../types.js"

describe("checkRegressionGate", () => {
	const baseline: EvalReport = {
		timestamp: "2026-11-10T10:00:00Z",
		total_cases: 2,
		passed_count: 2,
		failed_count: 0,
		pass_rate: 1.0,
		avg_steps: 2.0,
		avg_latency: 1.5,
		category_stats: {},
		details: [
			{
				id: "case_001",
				category: "test",
				input: "foo",
				passed: true,
				tool_ok: true,
				step_ok: true,
				judge_ok: true,
				steps: 2,
				max_steps: 4,
				latency: 1.5,
				actual_tools: [],
				expected_tools: [],
				actual_answer: "ok",
				reason: "ok",
			},
			{
				id: "case_002",
				category: "test",
				input: "bar",
				passed: true,
				tool_ok: true,
				step_ok: true,
				judge_ok: true,
				steps: 2,
				max_steps: 4,
				latency: 1.5,
				actual_tools: [],
				expected_tools: [],
				actual_answer: "ok",
				reason: "ok",
			},
		],
	}

	it("passes when metrics are stable or improved", () => {
		const latest: EvalReport = {
			...baseline,
			timestamp: "2026-11-11T10:00:00Z",
			avg_latency: 1.2,
		}
		const result = checkRegressionGate(baseline, latest)
		expect(result.passed).toBe(true)
		expect(result.regressedCases).toHaveLength(0)
	})

	it("blocks when a previously passed case fails", () => {
		const latest: EvalReport = {
			...baseline,
			pass_rate: 0.5,
			passed_count: 1,
			failed_count: 1,
			details: [
				baseline.details[0],
				{
					...baseline.details[1],
					passed: false,
					reason: "Model hallucinated",
				},
			],
		}
		const result = checkRegressionGate(baseline, latest)
		expect(result.passed).toBe(false)
		expect(result.regressedCases).toHaveLength(1)
		expect(result.regressedCases[0].id).toBe("case_002")
	})

	it("blocks when latency increases beyond threshold", () => {
		const latest: EvalReport = {
			...baseline,
			avg_latency: 3.5, // diff = +2.0s > max 1.5s
		}
		const result = checkRegressionGate(baseline, latest, {
			maxLatencyIncrease: 1.5,
		})
		expect(result.passed).toBe(false)
		expect(result.failureReasons.some((f) => f.includes("latency"))).toBe(true)
	})
})
