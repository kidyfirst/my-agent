import { describe, it, expect, vi } from "vitest"
import { StateGraph, START, END } from "@langchain/langgraph"
import { GraphRunner } from "../runner.js"
import { GraphRegistry } from "../registry.js"
import {
	AgentGraphStateAnnotation,
	type AgentGraphDefinition,
	type GraphExecutionContext,
} from "../types.js"

describe("GraphRunner", () => {
	it("executes a graph, tracks node transitions, and emits lifecycle events", async () => {
		const registry = new GraphRegistry()
		const runner = new GraphRunner(registry)

		const mockDef: AgentGraphDefinition = {
			id: "custom_mode",
			name: "Custom Mode",
			description: "Two-step test flow",
			topology: {
				modeId: "custom_mode",
				modeName: "Custom Mode",
				description: "Two-step test flow",
				nodes: [
					{ id: "step1", label: "Step 1", description: "First", kind: "llm" },
					{ id: "step2", label: "Step 2", description: "Second", kind: "tool" },
				],
				edges: [{ from: "step1", to: "step2" }],
			},
			buildGraph: (_ctx) => {
				return new StateGraph(AgentGraphStateAnnotation)
					.addNode("step1", () => ({ assistantText: "Step 1 done. " }))
					.addNode("step2", () => ({ assistantText: "Step 2 done." }))
					.addEdge(START, "step1")
					.addEdge("step1", "step2")
					.addEdge("step2", END)
					.compile()
			},
		}

		registry.register(mockDef)

		const events: any[] = []
		const ctx: GraphExecutionContext = {
			modeId: "custom_mode",
			model: {} as any,
			modelIdStr: "mock/model",
			instructions: "test instructions",
			executableTools: {},
			abortSignal: new AbortController().signal,
			emit: (ev) => events.push(ev),
			resourceId: "res-1",
			threadId: "th-1",
		}

		const result = await runner.run(ctx)

		expect(result.assistantText).toBe("Step 1 done. Step 2 done.")
		expect(result.durationMs).toBeGreaterThanOrEqual(0)

		// Verify lifecycle events
		const nodeStartedEvents = events.filter(
			(e) => e.type === "graph_node_started",
		)
		const nodeCompletedEvents = events.filter(
			(e) => e.type === "graph_node_completed",
		)

		expect(nodeStartedEvents).toHaveLength(2)
		expect(nodeStartedEvents[0].nodeId).toBe("step1")
		expect(nodeStartedEvents[0].nodeLabel).toBe("Step 1")
		expect(nodeStartedEvents[1].nodeId).toBe("step2")
		expect(nodeStartedEvents[1].nodeLabel).toBe("Step 2")

		expect(nodeCompletedEvents).toHaveLength(2)
		expect(nodeCompletedEvents[0].nodeId).toBe("step1")
		expect(nodeCompletedEvents[1].nodeId).toBe("step2")
	})

	it("respects abortSignal during execution", async () => {
		const registry = new GraphRegistry()
		const runner = new GraphRunner(registry)

		const abortController = new AbortController()

		const mockDef: AgentGraphDefinition = {
			id: "abort_mode",
			name: "Abort Mode",
			description: "Mode that aborts",
			topology: {
				modeId: "abort_mode",
				modeName: "Abort Mode",
				description: "Aborts",
				nodes: [
					{ id: "slow", label: "Slow Node", description: "", kind: "llm" },
				],
				edges: [],
			},
			buildGraph: () => {
				return new StateGraph(AgentGraphStateAnnotation)
					.addNode("slow", async () => {
						abortController.abort()
						return { assistantText: "partial" }
					})
					.addEdge(START, "slow")
					.addEdge("slow", END)
					.compile()
			},
		}

		registry.register(mockDef)

		const ctx: GraphExecutionContext = {
			modeId: "abort_mode",
			model: {} as any,
			modelIdStr: "mock/model",
			instructions: "",
			executableTools: {},
			abortSignal: abortController.signal,
			emit: vi.fn(),
			resourceId: "res-1",
			threadId: "th-1",
		}

		const result = await runner.run(ctx)
		// Should return gracefully without throwing unhandled rejection
		expect(result.assistantMessageId).toBeDefined()
	})

	it("captures and re-throws node errors", async () => {
		const registry = new GraphRegistry()
		const runner = new GraphRunner(registry)

		const mockDef: AgentGraphDefinition = {
			id: "failing_mode",
			name: "Failing Mode",
			description: "Throws an error",
			topology: {
				modeId: "failing_mode",
				modeName: "Failing Mode",
				description: "",
				nodes: [{ id: "fail", label: "Fail", description: "", kind: "llm" }],
				edges: [],
			},
			buildGraph: () => {
				return new StateGraph(AgentGraphStateAnnotation)
					.addNode("fail", () => {
						throw new Error("Node execution failed")
					})
					.addEdge(START, "fail")
					.addEdge("fail", END)
					.compile()
			},
		}

		registry.register(mockDef)

		const ctx: GraphExecutionContext = {
			modeId: "failing_mode",
			model: {} as any,
			modelIdStr: "mock/model",
			instructions: "",
			executableTools: {},
			abortSignal: new AbortController().signal,
			emit: vi.fn(),
			resourceId: "res-1",
			threadId: "th-1",
		}

		await expect(runner.run(ctx)).rejects.toThrowError("Node execution failed")
	})
})
