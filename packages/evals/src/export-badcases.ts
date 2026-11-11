import fs from "node:fs/promises"
import type { EvalCase } from "./types.js"

export interface RawBadTrace {
	traceId?: string
	userInput: string
	actualAnswer?: string
	error?: string
	feedback?: "thumbs_down" | "thumbs_up" | "none"
	latency?: number
	steps?: number
	timestamp?: string
}

/**
 * Strips personally identifiable and confidential information from raw text.
 */
export function sanitizeTraceText(text: string): string {
	if (!text) return ""
	return (
		text
			// China/international mobile phone numbers
			.replace(/(?:\+?86)?1[3-9]\d{9}\b/g, "13800000000")
			// Email addresses
			.replace(
				/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
				"user@example.com",
			)
			// API keys (OpenAI sk-, Anthropic, Github tokens, JWT)
			.replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-********************")
			.replace(/ghp_[A-Za-z0-9]{30,}/g, "ghp_********************")
			.replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]")
			// Absolute user home directories
			.replace(/(?:\/Users|\/home)\/[a-zA-Z0-9._-]+/g, "/Users/developer")
			// Passwords / tokens in JSON or URLs
			.replace(
				/("?(?:password|token|secret|apiKey)"?\s*[:=]\s*)"[^"]+"/gi,
				'$1"***"',
			)
	)
}

/**
 * Converts a raw bad trace (thumbs_down or error) into an EvalCase.
 */
export function convertTraceToEvalCase(
	trace: RawBadTrace,
	index: number,
): EvalCase {
	const sanitizedInput = sanitizeTraceText(trace.userInput)
	const id = trace.traceId
		? `bad_${sanitizeTraceText(trace.traceId).replace(/[^a-zA-Z0-9_-]/g, "_")}`
		: `bad_${Date.now()}_${index}`

	return {
		id,
		category: trace.error ? "error_recovery" : "user_negative_feedback",
		input: sanitizedInput,
		expected_tools: [],
		expected_answer_criteria: trace.error
			? "系统异常或工具失败时需友好降级提示，不能暴露原始堆栈或无响应"
			: "需准确理解用户意图并满足要求，不能编造错误信息或答非所问",
		max_steps: 4,
		metadata: {
			exportedAt: new Date().toISOString(),
			originalError: trace.error ? sanitizeTraceText(trace.error) : undefined,
			feedback: trace.feedback,
		},
	}
}

/**
 * Appends exported bad cases into target JSONL dataset file.
 */
export async function appendBadCasesToJsonl(
	targetFile: string,
	cases: EvalCase[],
): Promise<number> {
	if (cases.length === 0) return 0

	let lines = ""
	for (const c of cases) {
		lines += JSON.stringify(c) + "\n"
	}

	await fs.appendFile(targetFile, lines, "utf-8")
	return cases.length
}
