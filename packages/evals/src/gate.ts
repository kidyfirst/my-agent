import fs from "node:fs/promises"
import type { EvalReport, GateConfig, GateResult } from "./types.js"

export const DEFAULT_GATE_CONFIG: Required<GateConfig> = {
	maxPassRateDrop: 0.02, // 2% tolerance
	maxStepIncrease: 0.5, // max +0.5 avg steps
	maxLatencyIncrease: 1.5, // max +1.5s avg latency
	strictRegressionCheck: true, // no previously passed case may fail
}

/**
 * Compares latest evaluation report against baseline report.
 */
export function checkRegressionGate(
	baseline: EvalReport,
	latest: EvalReport,
	config: GateConfig = {},
): GateResult {
	const cfg = { ...DEFAULT_GATE_CONFIG, ...config }
	const passRateDiff = Number(
		(latest.pass_rate - baseline.pass_rate).toFixed(4),
	)
	const stepDiff = Number((latest.avg_steps - baseline.avg_steps).toFixed(2))
	const latencyDiff = Number(
		(latest.avg_latency - baseline.avg_latency).toFixed(2),
	)

	const basePassedIds = new Set(
		baseline.details.filter((r) => r.passed).map((r) => r.id),
	)

	const regressedCases: Array<{ id: string; reason: string }> = []
	for (const item of latest.details) {
		if (basePassedIds.has(item.id) && !item.passed) {
			regressedCases.push({ id: item.id, reason: item.reason })
		}
	}

	const failureReasons: string[] = []

	if (passRateDiff < -cfg.maxPassRateDrop) {
		failureReasons.push(
			`Pass rate drop exceeded limit: ${(passRateDiff * 100).toFixed(1)}% (allowed: -${(cfg.maxPassRateDrop * 100).toFixed(1)}%)`,
		)
	}

	if (stepDiff > cfg.maxStepIncrease) {
		failureReasons.push(
			`Average steps increased too much: +${stepDiff} (allowed: +${cfg.maxStepIncrease})`,
		)
	}

	if (latencyDiff > cfg.maxLatencyIncrease) {
		failureReasons.push(
			`Average latency increased too much: +${latencyDiff}s (allowed: +${cfg.maxLatencyIncrease}s)`,
		)
	}

	if (cfg.strictRegressionCheck && regressedCases.length > 0) {
		failureReasons.push(
			`Found ${regressedCases.length} regression cases that previously passed: [${regressedCases.map((r) => r.id).join(", ")}]`,
		)
	}

	return {
		passed: failureReasons.length === 0,
		passRateDiff,
		stepDiff,
		latencyDiff,
		regressedCases,
		failureReasons,
	}
}

/**
 * Formats gate verification result into a clean terminal report string.
 */
export function formatGateResult(
	result: GateResult,
	baseline: EvalReport,
	latest: EvalReport,
): string {
	const lines = [
		`\n================ 🚦 REGRESSION GATE VERIFICATION ================`,
		`Timestamp       : Baseline (${baseline.timestamp}) vs Latest (${latest.timestamp})`,
		`Pass Rate       : ${(latest.pass_rate * 100).toFixed(1)}% (Diff: ${(result.passRateDiff >= 0 ? "+" : "") + (result.passRateDiff * 100).toFixed(1)}%)`,
		`Avg Steps       : ${latest.avg_steps} (Diff: ${(result.stepDiff >= 0 ? "+" : "") + result.stepDiff})`,
		`Avg Latency     : ${latest.avg_latency}s (Diff: ${(result.latencyDiff >= 0 ? "+" : "") + result.latencyDiff}s)`,
	]

	if (result.regressedCases.length > 0) {
		lines.push(`\n⚠️  Regressed Cases (${result.regressedCases.length}):`)
		for (const r of result.regressedCases) {
			lines.push(`   - [${r.id}] ${r.reason}`)
		}
	}

	if (!result.passed) {
		lines.push(`\n❌ Gate Check FAILED:`)
		for (const f of result.failureReasons) {
			lines.push(`   * ${f}`)
		}
		lines.push(`\n🚫 Merge blocked. Please fix regressions before release.\n`)
	} else {
		lines.push(
			`\n✅ Gate Check PASSED: All benchmark quality thresholds satisfied.\n`,
		)
	}

	return lines.join("\n")
}

/**
 * Helper to load reports from disk and perform gate comparison.
 */
export async function runGateFromFile(
	baselineFile: string,
	latestFile: string,
	config: GateConfig = {},
): Promise<GateResult> {
	const baseline: EvalReport = JSON.parse(
		await fs.readFile(baselineFile, "utf-8"),
	)
	const latest: EvalReport = JSON.parse(await fs.readFile(latestFile, "utf-8"))
	const result = checkRegressionGate(baseline, latest, config)
	console.log(formatGateResult(result, baseline, latest))
	return result
}
