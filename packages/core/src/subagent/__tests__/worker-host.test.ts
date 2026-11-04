import { describe, expect, it, vi } from "vitest"
import { SubagentWorkerHost } from "../worker-host.js"
import {
	SubagentWorkerExecutor,
	type WorkerChannel,
} from "../worker-executor.js"
import { Agent } from "../../core/agent/index.js"
import type { HarnessEvent } from "../../harness/index.js"

describe("SubagentWorkerHost & Worker Model", () => {
	it("initializes worker context and streams events through the host", async () => {
		const emittedEvents: HarnessEvent[] = []
		const mockHarness = {
			emitEvent: (e: any) => emittedEvents.push(e),
		}

		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function () {
				const chunks = [
					{
						type: "tool-call",
						payload: { toolName: "view", args: { path: "src/worker.ts" } },
					},
					{
						type: "tool-result",
						payload: {
							toolName: "view",
							result: "worker code content",
							isError: false,
						},
					},
					{
						type: "text-delta",
						payload: { text: "Analyzed code in worker thread." },
					},
				]
				let idx = 0
				return {
					fullStream: {
						getReader: () => ({
							read: async () => {
								if (idx < chunks.length) {
									return { done: false, value: chunks[idx++] }
								}
								return { done: true, value: undefined }
							},
						}),
					},
					getFullOutput: async () => ({
						text: "Analyzed code in worker thread.",
					}),
				} as any
			})

		try {
			const host = new SubagentWorkerHost({
				mode: "direct",
				resolveModel: (id) => ({ id }),
			})

			const result = await host.execute(
				{
					toolCallId: "call-worker-1",
					agentType: "explore",
					task: "inspect worker architecture",
					modelId: "test-model-fast",
					allowedTools: ["view", "search_content", "find_files"],
				},
				mockHarness as any,
			)

			expect(result.isError).toBe(false)
			expect(result.content).toContain("Analyzed code in worker thread.")
			expect(result.content).toContain(
				'<subagent-meta modelId="test-model-fast"',
			)
			expect(result.content).toContain('tools="view:ok"')

			// Check all emitted events were captured in real-time
			const types = emittedEvents.map((e) => e.type)
			expect(types).toEqual([
				"subagent_start",
				"subagent_tool_start",
				"subagent_tool_end",
				"subagent_text_delta",
				"subagent_end",
			])
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("bridges host-bound tools via RPC channel", async () => {
		let hostToolInvoked = false
		const mockHostTools = {
			custom_approval_tool: {
				execute: async (args: any) => {
					hostToolInvoked = true
					return { status: "approved", action: args.action }
				},
			},
		}

		let capturedTools: Record<string, any> = {}
		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function (this: any) {
				capturedTools = this.tools
				// Execute the bridged tool from inside the worker
				const toolResult = await this.tools.custom_approval_tool.execute({
					action: "deploy",
				})
				expect(toolResult).toEqual({ status: "approved", action: "deploy" })

				return {
					fullStream: {
						getReader: () => {
							let done = false
							return {
								read: async () => {
									if (done) return { done: true, value: undefined }
									done = true
									return {
										done: false,
										value: {
											type: "text-delta",
											payload: { text: "Deployment tool succeeded" },
										},
									}
								},
							}
						},
					},
					getFullOutput: async () => ({ text: "Deployment tool succeeded" }),
				} as any
			})

		try {
			const host = new SubagentWorkerHost({
				mode: "direct",
				tools: mockHostTools,
				resolveModel: (id) => ({ id }),
			})

			const result = await host.execute({
				toolCallId: "call-rpc-1",
				agentType: "execute",
				task: "call custom approval tool",
				modelId: "test-model",
				allowedTools: ["custom_approval_tool"],
			})

			expect(hostToolInvoked).toBe(true)
			expect(result.isError).toBe(false)
			expect(result.content).toContain("Deployment tool succeeded")
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("aborts worker execution immediately on abortSignal", async () => {
		const abortController = new AbortController()
		const emittedEvents: HarnessEvent[] = []
		const mockHarness = {
			emitEvent: (e: any) => emittedEvents.push(e),
			abortSignal: abortController.signal,
		}

		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function (_task: string, options?: any) {
				const signal = options?.abortSignal
				return {
					fullStream: {
						getReader: () => ({
							read: async () => {
								if (signal?.aborted) {
									const err = new Error("This operation was aborted")
									err.name = "AbortError"
									throw err
								}
								// First yield a chunk, then trigger abort
								abortController.abort()
								return {
									done: false,
									value: {
										type: "text-delta",
										payload: { text: "Partial thoughts before cancel..." },
									},
								}
							},
						}),
					},
					getFullOutput: async () => ({ text: "" }),
				} as any
			})

		try {
			const host = new SubagentWorkerHost({
				mode: "direct",
				resolveModel: (id) => ({ id }),
			})

			const result = await host.execute(
				{
					toolCallId: "call-abort-1",
					agentType: "plan",
					task: "cancel this plan mid-way",
					modelId: "test-model",
					allowedTools: ["view"],
				},
				mockHarness as any,
			)

			expect(result.isError).toBe(false)
			expect(result.content).toContain("[Aborted by user]")
			expect(result.content).toContain("Partial thoughts before cancel...")
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("runs multiple subagent tasks concurrently without state collision", async () => {
		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function (task: string) {
				return {
					fullStream: {
						getReader: () => {
							let done = false
							return {
								read: async () => {
									if (done) return { done: true, value: undefined }
									done = true
									return {
										done: false,
										value: {
											type: "text-delta",
											payload: { text: `Result for ${task}` },
										},
									}
								},
							}
						},
					},
					getFullOutput: async () => ({ text: `Result for ${task}` }),
				} as any
			})

		try {
			const host = new SubagentWorkerHost({
				mode: "direct",
				resolveModel: (id) => ({ id }),
			})

			const [res1, res2] = await Promise.all([
				host.execute({
					toolCallId: "task-A",
					agentType: "explore",
					task: "Task Alpha",
					modelId: "model-a",
					allowedTools: ["view"],
				}),
				host.execute({
					toolCallId: "task-B",
					agentType: "plan",
					task: "Task Beta",
					modelId: "model-b",
					allowedTools: ["view"],
				}),
			])

			expect(res1.content).toContain("Result for Task Alpha")
			expect(res2.content).toContain("Result for Task Beta")
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("safely executes execute_command inside subagent without requestContext.get error", async () => {
		const { createExecuteCommandTool } = await import("../../tools/shell.js")
		const executeCommandTool = createExecuteCommandTool(process.cwd())

		const mockHarness = {
			emitEvent: vi.fn(),
			abortSignal: new AbortController().signal,
		}

		let capturedResult: any
		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function (this: any) {
				// The subagent calls the bridged execute_command tool
				capturedResult = await this.tools.execute_command.execute({
					command: "echo 'subagent-shell-success'",
				})

				return {
					fullStream: {
						getReader: () => {
							let done = false
							return {
								read: async () => {
									if (done) return { done: true, value: undefined }
									done = true
									return {
										done: false,
										value: {
											type: "text-delta",
											payload: { text: "Executed command successfully" },
										},
									}
								},
							}
						},
					},
					getFullOutput: async () => ({
						text: "Executed command successfully",
					}),
				} as any
			})

		try {
			const host = new SubagentWorkerHost({
				mode: "direct",
				tools: { execute_command: executeCommandTool },
				resolveModel: (id) => ({ id }),
			})

			const result = await host.execute(
				{
					toolCallId: "task-shell",
					agentType: "execute",
					task: "run shell command",
					modelId: "test-model",
					allowedTools: ["execute_command"],
				},
				mockHarness as any,
			)

			expect(result.isError).toBe(false)
			expect(capturedResult).toBeDefined()
			expect(capturedResult.isError).toBe(false)
			expect(capturedResult.content[0].text).toContain("subagent-shell-success")
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("discovers valid worker entry points across dist and source layouts", () => {
		const host = new SubagentWorkerHost({
			mode: "worker",
		})
		const candidates: URL[] = (host as any).entryCandidates()
		expect(candidates.length).toBeGreaterThan(0)
		for (const candidate of candidates) {
			expect(candidate.protocol).toBe("file:")
		}
	})
})
