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

export interface AgentModelInfo {
	provider: string
	modelId: string
	modelName: string
}

/**
 * Detects the active or configured LLM provider and model for the core agent.
 */
export async function detectAgentModelInfo(
	options: {
		modelId?: string
		cwd?: string
	} = {},
): Promise<AgentModelInfo> {
	let targetModelId = options.modelId

	try {
		const { AuthStorage } = await import("@my-agent/core")
		const authStorage = new AuthStorage()
		authStorage.reload()
		authStorage.syncCredentials()

		if (!targetModelId) {
			if (
				authStorage.getApiKeySync("deepseek") ||
				process.env.DEEPSEEK_API_KEY
			) {
				targetModelId = "deepseek/deepseek-flash"
			} else if (
				authStorage.getApiKeySync("openai") ||
				process.env.OPENAI_API_KEY
			) {
				targetModelId = "openai/gpt-4o"
			} else if (
				authStorage.getApiKeySync("anthropic") ||
				process.env.ANTHROPIC_API_KEY
			) {
				targetModelId = "anthropic/claude-3-5-sonnet-20241022"
			} else if (
				authStorage.getApiKeySync("google") ||
				process.env.GEMINI_API_KEY
			) {
				targetModelId = "google/gemini-2.0-flash"
			}
		}
	} catch {}

	if (!targetModelId) {
		targetModelId = "deepseek/deepseek-flash"
	}

	let provider = "DeepSeek"
	let modelName = targetModelId
	if (targetModelId.includes("/")) {
		const parts = targetModelId.split("/")
		provider = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
		modelName = parts.slice(1).join("/")
	}

	return {
		provider,
		modelId: targetModelId,
		modelName,
	}
}

/**
 * Real agent harness invoker that initializes `@my-agent/core`.
 */
export function createCoreAgentInvoker(
	options: {
		modelId?: string
		cwd?: string
		timeoutMs?: number
	} = {},
): AgentInvoker {
	let harnessPromise: Promise<any> | null = null

	async function getHarness() {
		if (!harnessPromise) {
			harnessPromise = (async () => {
				const { createMyAgent, setRuntimeYolo } = await import("@my-agent/core")
				// Enable process-wide YOLO permissions so tools don't stall for user confirmation
				setRuntimeYolo(true)

				const { harness } = await createMyAgent({
					cwd: options.cwd || process.cwd(),
					disableMcp: true,
					disableHooks: true,
					storage: { url: "file::memory:", isRemote: false },
					initialState: { yolo: true },
				})
				await harness.init()

				const modelInfo = await detectAgentModelInfo(options)
				await harness.switchModel({ modelId: modelInfo.modelId })

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
			const toolCalls: Array<{ name: string; args?: any; toolCallId: string }> =
				[]
			const seenCallIds = new Set<string>()
			let streamedAnswer = ""

			const recordToolStart = (
				name: string,
				args: any,
				toolCallId?: string,
			) => {
				if (!name) return
				const id = toolCallId || `${name}_call_${toolCalls.length}`
				if (!seenCallIds.has(id)) {
					seenCallIds.add(id)
					toolCalls.push({ name, args, toolCallId: id })
				}
			}

			// Auto-approve any tool or plan approvals to prevent CLI stalls
			const unsubscribe = harness.subscribe((event: any) => {
				// Record unique tool executions only when tool actually starts
				if (
					event.type === "tool_start" ||
					event.type === "subagent_tool_start"
				) {
					recordToolStart(
						event.toolName || event.name,
						event.args || event.input,
						event.toolCallId,
					)
				}

				if (event.type === "tool_approval_required") {
					// Auto approve tool calls in headless eval runner (do not duplicate count)
					harness
						.approveToolCall({
							threadId: event.threadId || thread.id,
							toolCallId: event.toolCallId,
							decision: "approve",
							approved: true,
						})
						.catch(() => {})
				}

				if (event.type === "plan_approval_required") {
					harness
						.approvePlan?.({
							threadId: event.threadId || thread.id,
							approved: true,
						})
						.catch(() => {})
				}

				if (event.type === "text-delta" || event.type === "text_delta") {
					streamedAnswer += event.delta || event.text || ""
				}
			})

			const timeoutMs = options.timeoutMs || 45000
			let timeoutHandle: any

			try {
				await Promise.race([
					harness.sendMessage({
						threadId: thread.id,
						content: testCase.input,
					}),
					new Promise((_, reject) => {
						timeoutHandle = setTimeout(() => {
							reject(new Error(`Timeout after ${timeoutMs / 1000}s`))
						}, timeoutMs)
					}),
				])
			} finally {
				clearTimeout(timeoutHandle)
				unsubscribe()
			}

			// In case streaming missed tool calls, fallback to message history
			if (toolCalls.length === 0) {
				try {
					const messages = await harness.listMessages({ threadId: thread.id })
					for (const msg of messages) {
						const parts = Array.isArray(msg.content)
							? msg.content
							: Array.isArray((msg as any).parts)
								? (msg as any).parts
								: []
						for (const p of parts) {
							if (p.type === "tool-call" || p.type === "tool_call") {
								recordToolStart(
									p.toolName || p.name,
									p.args || p.input,
									p.toolCallId || p.id,
								)
							}
						}
						if (msg.role === "tool" && msg.toolName) {
							recordToolStart(
								msg.toolName,
								msg.args || msg.input,
								msg.toolCallId || msg.id,
							)
						}
					}
				} catch {}
			}

			// Extract assistant answer
			let answer = streamedAnswer.trim()
			if (!answer) {
				try {
					const messages = await harness.listMessages({ threadId: thread.id })
					const assistantMsg = [...messages]
						.reverse()
						.find((m: any) => m.role === "assistant")
					if (assistantMsg) {
						const content = assistantMsg.content
						if (typeof content === "string") {
							answer = content
						} else if (content && typeof content === "object") {
							answer =
								content.content ||
								content.text ||
								(Array.isArray(content.parts)
									? content.parts.map((p: any) => p.text || "").join("")
									: "")
						}
					}
				} catch {}
			}

			return {
				answer: answer || "（无文本输出）",
				toolCalls,
				steps: Math.max(1, toolCalls.length),
			}
		} catch (err: any) {
			return {
				answer: `Agent execution failed: ${err.message || String(err)}`,
				toolCalls: [],
				steps: 0,
			}
		}
	}
}
