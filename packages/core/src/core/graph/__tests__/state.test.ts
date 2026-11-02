import { describe, it, expect } from "vitest"
import { StateGraph, START, END } from "@langchain/langgraph"
import { AgentGraphStateAnnotation } from "../types.js"

describe("AgentGraphStateAnnotation", () => {
	it("correctly reduces state updates across LangGraph nodes", async () => {
		const workflow = new StateGraph(AgentGraphStateAnnotation)
			.addNode("node_a", () => {
				return {
					assistantText: "Hello ",
					executedTools: [{ id: "t1", name: "view", args: {} }],
					tokenUsage: {
						promptTokens: 10,
						completionTokens: 5,
						totalTokens: 15,
					},
				}
			})
			.addNode("node_b", () => {
				return {
					assistantText: "World!",
					executedTools: [{ id: "t2", name: "write", args: {} }],
					tokenUsage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
				}
			})
			.addEdge(START, "node_a")
			.addEdge("node_a", "node_b")
			.addEdge("node_b", END)

		const app = workflow.compile()
		const result = await app.invoke({
			assistantMessageId: "msg-123",
			assistantText: "",
			executedTools: [],
			tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		})

		expect(result.assistantMessageId).toBe("msg-123")
		// assistantText reducer concatenates strings: "Hello " + "World!"
		expect(result.assistantText).toBe("Hello World!")
		// executedTools reducer concatenates arrays
		expect(result.executedTools).toHaveLength(2)
		expect(result.executedTools[0].name).toBe("view")
		expect(result.executedTools[1].name).toBe("write")
		// tokenUsage reducer sums up token counts
		expect(result.tokenUsage).toEqual({
			promptTokens: 15,
			completionTokens: 10,
			totalTokens: 25,
		})
	})
})
