import type { AgentResponse, EvalCase } from "./types.js"

export type AgentInvoker = (testCase: EvalCase) => Promise<AgentResponse>

/**
 * High-fidelity mock invoker used for tests, dry-runs, and sandbox environments.
 * Simulates tool calls, steps, and responses according to the test case definition.
 */
export function createMockInvoker(
	options: {
		passRate?: number
		avgLatencyMs?: number
	} = {},
): AgentInvoker {
	const passRate = options.passRate ?? 0.95

	return async (testCase: EvalCase): Promise<AgentResponse> => {
		const isPass = Math.random() <= passRate
		const expected = testCase.expected_tools ?? []

		// Simulate step duration
		const latency = options.avgLatencyMs ?? 50
		await new Promise((r) => setTimeout(r, latency))

		if (!isPass) {
			// Simulate a failure: omitted tool or incomplete answer
			return {
				answer: "执行出错，无法获取相关信息。",
				toolCalls: [],
				steps: (testCase.max_steps ?? 4) + 1,
			}
		}

		// Simulate expected tool calls
		const toolCalls = expected.map((t) => ({
			name: t,
			args: testCase.expected_tool_args ?? {},
		}))

		let answer = `针对用例 [${testCase.id}] 的回答：已成功处理 ${testCase.category} 请求。`
		if (testCase.category === "safety_refusal") {
			answer = "抱歉，由于安全限制，我无法执行清空系统文件等高危操作。"
		} else if (testCase.category === "file_read") {
			answer = "已读取文件，react 版本为 ^19.2.4。"
		} else if (testCase.category === "git_ops") {
			answer = "当前分支为 main，最近一次提交为 c2bd2c72: fix(library)。"
		}

		return {
			answer,
			toolCalls,
			steps: Math.max(1, expected.length),
		}
	}
}

/**
 * Real agent harness invoker that initializes `@my-agent/core`.
 */
export function createCoreAgentInvoker(
	options: {
		modelId?: string
		cwd?: string
	} = {},
): AgentInvoker {
	let harnessPromise: Promise<any> | null = null

	async function getHarness() {
		if (!harnessPromise) {
			harnessPromise = (async () => {
				const { createMyAgent } = await import("@my-agent/core")
				const { harness } = await createMyAgent({
					cwd: options.cwd || process.cwd(),
					disableMcp: true,
					disableHooks: true,
					storage: { url: "file::memory:", isRemote: false },
					initialState: { yolo: true },
				})
				await harness.init()
				if (options.modelId) {
					await harness.switchModel({ modelId: options.modelId })
				}
				return harness
			})()
		}
		return harnessPromise
	}

	return async (testCase: EvalCase): Promise<AgentResponse> => {
		try {
			const harness = await getHarness()
			const thread = await harness.createThread({
				title: `Eval_${testCase.id}`,
			})
			const toolCalls: Array<{ name: string; args?: any }> = []
			let stepCount = 0

			// Subscribe to execution events to capture tool calls and steps
			const unsubscribe = harness.subscribe((event: any) => {
				if (event.type === "tool_call" || event.type === "tool_execute_start") {
					toolCalls.push({
						name: event.toolName || event.name,
						args: event.args || event.input,
					})
					stepCount++
				} else if (
					event.type === "step_finish" ||
					event.type === "turn_finish"
				) {
					stepCount++
				}
			})

			const result = await harness.sendMessage({
				threadId: thread.id,
				content: testCase.input,
			})

			unsubscribe()

			const answer =
				typeof result === "string"
					? result
					: result?.content || result?.answer || result?.text || ""

			return {
				answer,
				toolCalls,
				steps: Math.max(1, stepCount),
			}
		} catch (err: any) {
			return {
				answer: `Agent invocation failed: ${err.message || String(err)}`,
				toolCalls: [],
				steps: 0,
			}
		}
	}
}
