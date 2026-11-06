import { describe, it, expect } from "vitest"
import { MockLanguageModelV3 } from "ai/test"
import { Agent } from "../agent.js"
import { RequestContext } from "../../context/index.js"

function streamOf(chunks: unknown[]): ReadableStream {
	let index = 0
	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) controller.enqueue(chunks[index++])
			else controller.close()
		},
	})
}

const mockUsage = {
	inputTokens: { total: 10, prompt: 10 },
	outputTokens: { total: 5, completion: 5 },
}

describe("Agent implementation without any", () => {
	it("initializes with default id and name when omitted", () => {
		const agent = new Agent({})
		expect(agent.id).toBeDefined()
		expect(typeof agent.id).toBe("string")
		expect(agent.name).toBe("Agent")
	})

	it("resolves static instructions and function-based instructions", async () => {
		const staticAgent = new Agent({
			instructions: "You are a helpful assistant.",
		})
		expect(await staticAgent.getInstructions()).toBe(
			"You are a helpful assistant.",
		)

		const dynamicAgent = new Agent({
			instructions: ({ requestContext }) => {
				const user = requestContext?.get("user") || "anonymous"
				return `Hello ${user}`
			},
		})

		const ctx = new RequestContext()
		ctx.set("user", "Developer")
		expect(await dynamicAgent.getInstructions({ requestContext: ctx })).toBe(
			"Hello Developer",
		)
	})

	it("resolves static model and function-based model", async () => {
		const modelObj = { id: "test-model-1" }
		const staticAgent = new Agent({ model: modelObj })
		expect(await staticAgent.getModel()).toEqual(modelObj)

		const dynamicAgent = new Agent({
			model: ({ requestContext }) => {
				const modelId = requestContext?.get("modelId") || "default-model"
				return { id: modelId }
			},
		})

		const ctx = new RequestContext()
		ctx.set("modelId", "custom-gpt")
		expect(await dynamicAgent.getModel({ requestContext: ctx })).toEqual({
			id: "custom-gpt",
		})
	})

	it("resolves static tools and function-based tools", async () => {
		const dummyTool = {
			description: "A dummy tool",
			execute: async () => "dummy",
		}
		const staticAgent = new Agent({ tools: { dummy: dummyTool } })
		const tools = await staticAgent.listTools()
		expect(tools.dummy).toBe(dummyTool)

		const dynamicAgent = new Agent({
			tools: ({ requestContext }) => {
				const enabled = requestContext?.get("enableSearch")
				return enabled ? { search: dummyTool } : {}
			},
		})

		const ctx = new RequestContext()
		expect(await dynamicAgent.listTools({ requestContext: ctx })).toEqual({})
		ctx.set("enableSearch", true)
		expect(
			await dynamicAgent.listTools({ requestContext: ctx }),
		).toHaveProperty("search")
	})

	it("streams response and normalizes chunks via transformStream", async () => {
		let callCount = 0
		const model = new MockLanguageModelV3({
			modelId: "mock-stream-model",
			doStream: async () => {
				callCount++
				if (callCount === 1) {
					return {
						stream: streamOf([
							{ type: "stream-start", warnings: [] },
							{ type: "text-start", id: "0" },
							{ type: "text-delta", id: "0", delta: "Hello " },
							{ type: "text-delta", id: "0", delta: "World!" },
							{ type: "text-end", id: "0" },
							{
								type: "tool-call",
								toolCallId: "call-1",
								toolName: "calculator",
								input: JSON.stringify({ expr: "1+1" }),
							},
							{
								type: "finish",
								finishReason: "tool-calls",
								usage: mockUsage,
							},
						]),
						warnings: [],
					}
				}
				return {
					stream: streamOf([
						{ type: "stream-start", warnings: [] },
						{
							type: "finish",
							finishReason: "stop",
							usage: mockUsage,
						},
					]),
					warnings: [],
				}
			},
		})

		const agent = new Agent({
			id: "stream-agent",
			name: "StreamAgent",
			instructions: "Stream instructions",
			tools: {
				calculator: {
					description: "calc",
					parameters: {
						type: "object",
						properties: {
							expr: { type: "string" },
						},
					},
					execute: async () => ({ result: 2 }),
				},
			},
			model,
		})

		const streamResult = await agent.stream("Say hello")
		const chunks: any[] = []
		const reader = streamResult.fullStream.getReader()
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
		}

		// Verify text delta chunk normalization with payload
		const textDeltas = chunks.filter((c) => c.type === "text-delta")
		expect(textDeltas.length).toBeGreaterThanOrEqual(2)
		expect(textDeltas[0].payload.text).toBe("Hello ")
		expect(textDeltas[1].payload.text).toBe("World!")

		// Verify tool call chunk normalization with payload
		const toolCalls = chunks.filter((c) => c.type === "tool-call")
		expect(toolCalls.length).toBe(1)
		expect(toolCalls[0].payload.toolName).toBe("calculator")
		expect(toolCalls[0].payload.toolCallId).toBe("call-1")
		expect(toolCalls[0].payload.args).toEqual({ expr: "1+1" })

		// Verify tool result chunk normalization with payload
		const toolResults = chunks.filter((c) => c.type === "tool-result")
		expect(toolResults.length).toBe(1)
		expect(toolResults[0].payload.toolName).toBe("calculator")
		expect(toolResults[0].payload.result).toEqual({ result: 2 })
		expect(toolResults[0].payload.isError).toBe(false)

		// Verify getFullOutput()
		const fullOutput = await streamResult.getFullOutput()
		expect(fullOutput.text).toBe("Hello World!")
		expect(["stop", "other"]).toContain(fullOutput.finishReason)
		expect(fullOutput.usage).toBeDefined()
	})
})
