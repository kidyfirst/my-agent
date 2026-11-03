import { describe, expect, it, vi } from "vitest"
import { createSubagentTool } from "../subagent.js"
import { RequestContext, Agent } from "../../core/index.js"

describe("createSubagentTool", () => {
	const mockTools: Record<string, any> = {
		view: { id: "view" },
		search_content: { id: "search_content" },
		find_files: { id: "find_files" },
		write_file: { id: "write_file" },
		execute_command: { id: "execute_command" },
		task_write: { id: "task_write" },
		task_check: { id: "task_check" },
	}

	it("creates a tool with subagent id and description", () => {
		const tool = createSubagentTool({
			tools: mockTools,
			resolveModel: (id) => ({ id }),
		})

		expect(tool.id).toBe("subagent")
		expect(tool.description).toContain("explore")
		expect(tool.description).toContain("plan")
		expect(tool.description).toContain("execute")
	})

	it("rejects unknown agent types via schema validation", async () => {
		const tool = createSubagentTool({
			tools: mockTools,
			resolveModel: (id) => ({ id }),
		})

		await expect(
			(tool as any).execute({
				agentType: "unknown-type",
				task: "do something",
			}),
		).rejects.toThrow()

		const res = await (tool as any)._execute({
			agentType: "unknown-type",
			task: "do something",
		})
		expect(res.isError).toBe(true)
		expect(res.content).toContain("Unknown agent type")
	})

	it("handles model resolution failures gracefully", async () => {
		const tool = createSubagentTool({
			tools: mockTools,
			resolveModel: () => {
				throw new Error("Model provider unavailable")
			},
		})

		const res = await (tool as any).execute({
			agentType: "explore",
			task: "find files",
		})

		expect(res.isError).toBe(true)
		expect(res.content).toContain("Failed to resolve model")
		expect(res.content).toContain("Model provider unavailable")
	})

	it("constrains tools passed to the subagent by agent type", async () => {
		let capturedTools: Record<string, any> | undefined

		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function (this: any) {
				capturedTools = this.tools
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
											payload: { text: "Exploration summary" },
										},
									}
								},
							}
						},
					},
					getFullOutput: async () => ({ text: "Exploration summary" }),
				} as any
			})

		try {
			const tool = createSubagentTool({
				tools: mockTools,
				resolveModel: (id) => ({ id }),
			})

			const res = await (tool as any).execute({
				agentType: "explore",
				task: "search for auth usages",
			})

			expect(res.isError).toBe(false)
			expect(res.content).toContain("Exploration summary")
			expect(res.content).toContain("<subagent-meta")
			// Explore agent only receives read-only tools
			expect(capturedTools).toBeDefined()
			expect(Object.keys(capturedTools!)).toEqual([
				"view",
				"search_content",
				"find_files",
			])
			expect(capturedTools).not.toHaveProperty("write_file")
			expect(capturedTools).not.toHaveProperty("execute_command")
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("forwards subagent events to harness context", async () => {
		const events: any[] = []
		const mockHarness = {
			emitEvent: (event: any) => events.push(event),
			getSubagentModelId: () => "google/gemini-2.5-pro",
		}

		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function () {
				const chunks = [
					{
						type: "tool-call",
						payload: { toolName: "view", args: { path: "src/index.ts" } },
					},
					{
						type: "tool-result",
						payload: {
							toolName: "view",
							result: "export const ok = true",
							isError: false,
						},
					},
					{
						type: "text-delta",
						payload: { text: "Inspected src/index.ts." },
					},
				]
				let index = 0

				return {
					fullStream: {
						getReader: () => ({
							read: async () => {
								if (index < chunks.length) {
									return { done: false, value: chunks[index++] }
								}
								return { done: true, value: undefined }
							},
						}),
					},
					getFullOutput: async () => ({ text: "Inspected src/index.ts." }),
				} as any
			})

		try {
			const tool = createSubagentTool({
				tools: mockTools,
				resolveModel: (id) => ({ id }),
			})

			const rc = new RequestContext()
			rc.set("harness", mockHarness)
			const context = {
				requestContext: rc,
				toolCallId: "call-123",
			}

			const res = await (tool as any).execute(
				{
					agentType: "explore",
					task: "inspect src/index.ts",
				},
				context,
			)

			expect(res.isError).toBe(false)
			expect(res.content).toContain("Inspected src/index.ts.")
			expect(res.content).toContain(
				'<subagent-meta modelId="google/gemini-2.5-pro"',
			)

			// Check event sequence
			const types = events.map((e) => e.type)
			expect(types).toEqual([
				"subagent_start",
				"subagent_tool_start",
				"subagent_tool_end",
				"subagent_text_delta",
				"subagent_end",
			])
			expect(events[0]).toMatchObject({
				type: "subagent_start",
				toolCallId: "call-123",
				agentType: "explore",
				modelId: "google/gemini-2.5-pro",
			})
			expect(events[events.length - 1]).toMatchObject({
				type: "subagent_end",
				toolCallId: "call-123",
				agentType: "explore",
				isError: false,
			})
		} finally {
			streamSpy.mockRestore()
		}
	})

	it("handles aborts gracefully and returns partial text", async () => {
		const events: any[] = []
		const abortController = new AbortController()

		const mockHarness = {
			emitEvent: (event: any) => events.push(event),
			abortSignal: abortController.signal,
		}

		const streamSpy = vi
			.spyOn(Agent.prototype, "stream")
			.mockImplementation(async function () {
				const err = new Error("This operation was aborted")
				err.name = "AbortError"
				throw err
			})

		try {
			const tool = createSubagentTool({
				tools: mockTools,
				resolveModel: (id) => ({ id }),
			})

			const rc = new RequestContext()
			rc.set("harness", mockHarness)

			const res = await (tool as any).execute(
				{
					agentType: "plan",
					task: "create a plan",
				},
				{ requestContext: rc },
			)

			expect(res.isError).toBe(false)
			expect(res.content).toContain("[Aborted by user]")

			const endEvent = events.find((e) => e.type === "subagent_end")
			expect(endEvent).toBeDefined()
			expect(endEvent.isError).toBe(false)
		} finally {
			streamSpy.mockRestore()
		}
	})
})
