export interface EvalCase {
	id: string
	category: string
	input: string
	expected_tools?: string[]
	expected_tool_args?: Record<string, any>
	expected_answer_criteria: string
	max_steps?: number
	metadata?: Record<string, any>
}

export interface AgentResponse {
	answer: string
	toolCalls: Array<{ name: string; args?: Record<string, any> }>
	steps: number
	cost?: number
}

export interface JudgeVerdict {
	passed: boolean
	reason: string
	score?: number
}

export interface CaseResult {
	id: string
	category: string
	input: string
	passed: boolean
	tool_ok: boolean
	step_ok: boolean
	judge_ok: boolean
	steps: number
	max_steps: number
	latency: number
	actual_tools: string[]
	expected_tools: string[]
	actual_answer: string
	reason: string
}

export interface CategoryStat {
	total: number
	passed: number
	pass_rate: number
}

export interface EvalReport {
	timestamp: string
	model?: string
	total_cases: number
	passed_count: number
	failed_count: number
	pass_rate: number
	avg_steps: number
	avg_latency: number
	category_stats: Record<string, CategoryStat>
	details: CaseResult[]
}

export interface GateConfig {
	maxPassRateDrop?: number
	maxStepIncrease?: number
	maxLatencyIncrease?: number
	strictRegressionCheck?: boolean
}

export interface GateResult {
	passed: boolean
	passRateDiff: number
	stepDiff: number
	latencyDiff: number
	regressedCases: Array<{ id: string; reason: string }>
	failureReasons: string[]
}
