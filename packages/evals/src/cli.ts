#!/usr/bin/env tsx
import path from "node:path"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { runEvaluation } from "./runner.js"
import { runGateFromFile } from "./gate.js"
import {
	convertTraceToEvalCase,
	appendBadCasesToJsonl,
	type RawBadTrace,
} from "./export-badcases.js"
import {
	createCoreAgentInvoker,
	createMockInvoker,
	detectAgentModelInfo,
} from "./invoker.js"
import { resolveJudgeConfig } from "./judge.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, "..")

async function main() {
	const args = process.argv.slice(2)
	const command = args[0] || "run"

	if (command === "run" || command === "eval") {
		const isMock = args.includes("--mock") || process.env.EVAL_MOCK === "true"
		const setBaseline =
			args.includes("--baseline") || args.includes("--init-baseline")
		const modelArg = args.find((a) => a.startsWith("--model="))?.split("=")[1]
		const timeoutArg = args
			.find((a) => a.startsWith("--timeout="))
			?.split("=")[1]
		const timeoutMs = timeoutArg ? Number(timeoutArg) * 1000 : 45000

		const datasetDir = path.join(ROOT_DIR, "dataset")
		const datasetPaths = [
			path.join(datasetDir, "baseline_30.jsonl"),
			path.join(datasetDir, "bad_cases.jsonl"),
		]

		const outputPath = path.join(ROOT_DIR, "reports/latest_report.json")

		const agentInfo = isMock
			? {
					provider: "Mock",
					modelId: "mock/eval-mock-v1",
					modelName: "eval-mock-v1",
				}
			: await detectAgentModelInfo({ modelId: modelArg })

		const judgeConfig = await resolveJudgeConfig({
			preferredProvider: agentInfo.provider.toLowerCase(),
			mock: isMock,
		})

		console.log(`\n======================================================`)
		console.log(`🔍 [Eval Runner] Starting Benchmark Evaluation`)
		console.log(`======================================================`)
		console.log(
			`📦 Mode      : ${isMock ? "Mock Invoker (Dry-run)" : "Core Agent Harness"}`,
		)
		console.log(
			`📂 Datasets  : ${datasetPaths.map((p) => path.basename(p)).join(", ")}`,
		)
		console.log(`🤖 Agent     : [${agentInfo.provider}] ${agentInfo.modelId}`)
		console.log(
			`⚖️  Judge     : [${judgeConfig.provider}] ${judgeConfig.model} (${judgeConfig.isHeuristicOnly ? "Heuristic Rules" : judgeConfig.baseURL})`,
		)
		console.log(`⏱️  Timeout   : ${timeoutMs / 1000}s per case`)
		console.log(`======================================================\n`)

		const invoker = isMock
			? createMockInvoker({ passRate: 0.95 })
			: createCoreAgentInvoker({ modelId: agentInfo.modelId, timeoutMs })

		const report = await runEvaluation({
			datasetPaths,
			outputPath,
			invoker,
			modelName: agentInfo.modelId,
			agentProvider: agentInfo.provider,
			judgeProvider: judgeConfig.provider,
			judgeModel: judgeConfig.model,
			judgeOptions: {
				preferredProvider: agentInfo.provider.toLowerCase(),
				mock: isMock,
			},
			onCaseStart: (c, idx, total) => {
				process.stdout.write(
					`[${idx + 1}/${total}] ${c.id.padEnd(14)} (${c.category}) ... `,
				)
			},
			onCaseComplete: (res) => {
				if (res.passed) {
					console.log(
						`\x1b[32mPASS\x1b[0m (${res.latency}s, ${res.steps} steps)`,
					)
				} else {
					console.log(`\x1b[31mFAIL\x1b[0m -> ${res.reason}`)
				}
			},
		})

		console.log(`\n================ EVALUATION SUMMARY ================`)
		console.log(`Agent Model : [${agentInfo.provider}] ${agentInfo.modelId}`)
		console.log(`Judge Model : [${judgeConfig.provider}] ${judgeConfig.model}`)
		console.log(`Total Cases : ${report.total_cases}`)
		console.log(
			`Pass Rate   : ${(report.pass_rate * 100).toFixed(1)}% (${report.passed_count}/${report.total_cases})`,
		)
		console.log(`Avg Steps   : ${report.avg_steps}`)
		console.log(`Avg Latency : ${report.avg_latency}s`)
		console.log(`Report JSON : ${outputPath}`)
		console.log(`Report MD   : ${outputPath.replace(/\.json$/, ".md")}`)

		if (setBaseline) {
			const baselinePath = path.join(ROOT_DIR, "reports/baseline_report.json")
			await fs.copyFile(outputPath, baselinePath)
			console.log(`\n📌 Established new baseline at: ${baselinePath}`)
		}

		process.exit(0)
	}

	if (command === "gate" || command === "check") {
		const baselinePath = path.join(ROOT_DIR, "reports/baseline_report.json")
		const latestPath = path.join(ROOT_DIR, "reports/latest_report.json")

		try {
			await fs.access(baselinePath)
			await fs.access(latestPath)
		} catch {
			console.error(`\n❌ Missing reports for regression gate!`)
			console.error(`Expected baseline: ${baselinePath}`)
			console.error(`Expected latest  : ${latestPath}`)
			console.log(
				`Hint: Run 'pnpm run eval -- --baseline' to create the initial baseline.`,
			)
			process.exit(1)
		}

		const result = await runGateFromFile(baselinePath, latestPath)
		process.exit(result.passed ? 0 : 1)
	}

	if (command === "export" || command === "badcases") {
		const targetFile = path.join(ROOT_DIR, "dataset/bad_cases.jsonl")

		// Sample demonstration export
		const sampleTraces: RawBadTrace[] = [
			{
				traceId: `trace_online_${Date.now()}`,
				userInput:
					"帮我查询手机号 13812345678 在 /Users/secret/project 下的部署状态",
				error: "Timeout reading remote deploy status",
				feedback: "thumbs_down",
				steps: 6,
				latency: 16.2,
			},
		]

		const cases = sampleTraces.map((t, i) => convertTraceToEvalCase(t, i))
		const count = await appendBadCasesToJsonl(targetFile, cases)
		console.log(
			`\n✅ Successfully exported & sanitized ${count} bad cases into: ${targetFile}`,
		)
		process.exit(0)
	}

	console.log(
		`Usage: my-agent-eval [run|gate|export] [--mock] [--baseline] [--model=xxx]`,
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
