import fs from "node:fs/promises"
import path from "node:path"
import { evaluateWithJudge, type JudgeOptions } from "./judge.js"
import type { EvalCase, CaseResult, EvalReport, CategoryStat } from "./types.js"
import type { AgentInvoker } from "./invoker.js"

export interface RunOptions {
	datasetPaths: string[]
	outputPath?: string
	invoker: AgentInvoker
	judgeOptions?: JudgeOptions
	modelName?: string
	agentProvider?: string
	judgeProvider?: string
	judgeModel?: string
	onCaseStart?: (c: EvalCase, index: number, total: number) => void
	onCaseComplete?: (result: CaseResult, index: number, total: number) => void
}

/**
 * Mapping between abstract test case tools and concrete agent runtime tools.
 */
export const TOOL_ALIASES: Record<string, string[]> = {
	read_file: ["read_file", "view", "assets_fetch"],
	view: ["view", "read_file", "assets_fetch"],
	write_file: ["write_file"],
	edit_file: [
		"edit_file",
		"string_replace_lsp",
		"ast_smart_edit",
		"write_file",
	],
	string_replace_lsp: [
		"string_replace_lsp",
		"ast_smart_edit",
		"edit_file",
		"write_file",
	],
	ast_smart_edit: [
		"ast_smart_edit",
		"string_replace_lsp",
		"edit_file",
		"write_file",
	],
	run_command: [
		"run_command",
		"execute_command",
		"exec",
		"terminal",
		"search_content",
		"find_files",
	],
	execute_command: [
		"execute_command",
		"run_command",
		"exec",
		"terminal",
		"search_content",
		"find_files",
	],
	find_files: [
		"find_files",
		"search_content",
		"glob",
		"execute_command",
		"run_command",
	],
	search_content: [
		"search_content",
		"find_files",
		"grep",
		"execute_command",
		"run_command",
	],
	search_my_library: ["search_my_library", "assets_fetch"],
	subagent: ["subagent"],
	submit_plan: ["submit_plan"],
}

export function isToolSatisfied(
	expectedTool: string,
	actualTools: string[],
): boolean {
	if (actualTools.includes(expectedTool)) return true
	const aliases = TOOL_ALIASES[expectedTool] || []
	return aliases.some((a) => actualTools.includes(a))
}

export function getMissingTools(
	expectedTools: string[],
	actualTools: string[],
): string[] {
	return expectedTools.filter((exp) => !isToolSatisfied(exp, actualTools))
}

/**
 * Loads and parses JSONL evaluation dataset files.
 */
export async function loadJsonlDataset(filePath: string): Promise<EvalCase[]> {
	try {
		const content = await fs.readFile(filePath, "utf-8")
		const cases: EvalCase[] = []
		for (const line of content.split("\n")) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) {
				continue
			}
			cases.push(JSON.parse(trimmed))
		}
		return cases
	} catch (err: any) {
		if (err.code === "ENOENT") {
			return []
		}
		throw err
	}
}

/**
 * Generates human-readable Markdown summary from an EvalReport.
 */
export function generateMarkdownReport(report: EvalReport): string {
	const passPercent = (report.pass_rate * 100).toFixed(1)
	const lines = [
		`# 📊 Agent Evaluation Benchmark Report`,
		``,
		`- **Timestamp**: ${report.timestamp}`,
		`- **Agent Provider**: ${report.agent_provider || "Unknown"}`,
		`- **Agent Model**: \`${report.model || "Default"}\``,
		`- **Judge Provider**: ${report.judge_provider || "Unknown"}`,
		`- **Judge Model**: \`${report.judge_model || "heuristic"}\``,
		`- **Overall Pass Rate**: **${passPercent}%** (${report.passed_count}/${report.total_cases})`,
		`- **Average Steps**: ${report.avg_steps}`,
		`- **Average Latency**: ${report.avg_latency}s`,
		``,
		`## 📁 Category Breakdown`,
		``,
		`| Category | Total | Passed | Pass Rate |`,
		`| :--- | :---: | :---: | :---: |`,
	]

	for (const [cat, stats] of Object.entries(report.category_stats)) {
		const rate = (stats.pass_rate * 100).toFixed(1)
		lines.push(
			`| \`${cat}\` | ${stats.total} | ${stats.passed} | **${rate}%** |`,
		)
	}

	lines.push(``, `## 📝 Detailed Results`, ``)
	lines.push(`| ID | Category | Status | Tools | Steps | Latency | Reason |`)
	lines.push(`| :--- | :--- | :---: | :---: | :---: | :---: | :--- |`)

	for (const d of report.details) {
		const icon = d.passed ? "✅ PASS" : "❌ FAIL"
		const missing = getMissingTools(d.expected_tools, d.actual_tools)
		const toolsText = d.tool_ok ? "OK" : `Missing [${missing.join(",")}]`
		lines.push(
			`| \`${d.id}\` | ${d.category} | ${icon} | ${toolsText} | ${d.steps}/${d.max_steps} | ${d.latency}s | ${d.reason.replace(/\|/g, "/")} |`,
		)
	}

	return lines.join("\n")
}

/**
 * Executes evaluation suite against a collection of dataset paths.
 */
export async function runEvaluation(options: RunOptions): Promise<EvalReport> {
	const cases: EvalCase[] = []
	for (const file of options.datasetPaths) {
		const loaded = await loadJsonlDataset(file)
		cases.push(...loaded)
	}

	if (cases.length === 0) {
		throw new Error(
			`No evaluation cases found in paths: ${options.datasetPaths.join(", ")}`,
		)
	}

	const results: CaseResult[] = []

	for (let i = 0; i < cases.length; i++) {
		const c = cases[i]
		options.onCaseStart?.(c, i, cases.length)

		const start = performance.now()
		const agentOut = await options.invoker(c)
		const latency = Number(((performance.now() - start) / 1000).toFixed(2))

		const actualTools = agentOut.toolCalls.map((t) => t.name)
		const expectedTools = c.expected_tools ?? []
		const missingTools = getMissingTools(expectedTools, actualTools)
		const toolOk = missingTools.length === 0
		const maxSteps = c.max_steps ?? 6
		const stepOk = agentOut.steps <= maxSteps

		const judgeRes = await evaluateWithJudge(
			c.input,
			c.expected_answer_criteria,
			agentOut.answer,
			options.judgeOptions,
		)

		const passed = toolOk && stepOk && judgeRes.passed

		let finalReason = judgeRes.reason
		if (!toolOk) {
			finalReason = `Missing required tools: ${missingTools.join(", ")}; ${judgeRes.reason}`
		} else if (!stepOk) {
			finalReason = `Exceeded max allowed steps (${agentOut.steps} > ${maxSteps}); ${judgeRes.reason}`
		}

		const result: CaseResult = {
			id: c.id,
			category: c.category,
			input: c.input,
			passed,
			tool_ok: toolOk,
			step_ok: stepOk,
			judge_ok: judgeRes.passed,
			steps: agentOut.steps,
			max_steps: maxSteps,
			latency,
			actual_tools: actualTools,
			expected_tools: expectedTools,
			actual_answer: agentOut.answer,
			reason: finalReason,
		}

		results.push(result)
		options.onCaseComplete?.(result, i, cases.length)
	}

	// Calculate metrics
	const total = results.length
	const passedCount = results.filter((r) => r.passed).length
	const categoryStats: Record<string, CategoryStat> = {}

	for (const r of results) {
		if (!categoryStats[r.category]) {
			categoryStats[r.category] = { total: 0, passed: 0, pass_rate: 0 }
		}
		categoryStats[r.category].total++
		if (r.passed) categoryStats[r.category].passed++
	}

	for (const key of Object.keys(categoryStats)) {
		const cat = categoryStats[key]
		cat.pass_rate = Number((cat.passed / cat.total).toFixed(4))
	}

	const report: EvalReport = {
		timestamp: new Date().toISOString(),
		model: options.modelName,
		agent_provider: options.agentProvider,
		judge_provider: options.judgeProvider,
		judge_model: options.judgeModel,
		total_cases: total,
		passed_count: passedCount,
		failed_count: total - passedCount,
		pass_rate: Number((passedCount / total).toFixed(4)),
		avg_steps: Number(
			(results.reduce((s, r) => s + r.steps, 0) / total).toFixed(2),
		),
		avg_latency: Number(
			(results.reduce((s, r) => s + r.latency, 0) / total).toFixed(2),
		),
		category_stats: categoryStats,
		details: results,
	}

	if (options.outputPath) {
		await fs.mkdir(path.dirname(options.outputPath), { recursive: true })
		await fs.writeFile(
			options.outputPath,
			JSON.stringify(report, null, 2),
			"utf-8",
		)
		const mdPath = options.outputPath.replace(/\.json$/i, ".md")
		await fs.writeFile(mdPath, generateMarkdownReport(report), "utf-8")
	}

	return report
}
