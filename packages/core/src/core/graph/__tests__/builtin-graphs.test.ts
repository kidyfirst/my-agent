import { describe, it, expect, vi } from "vitest"
import { reactGraphDefinition } from "../graphs/react-graph.js"
import { chatGraphDefinition } from "../graphs/chat-graph.js"
import { planSolveGraphDefinition } from "../graphs/plan-solve-graph.js"
import { ExecutionMode, type GraphTopologyMetadata } from "../types.js"

function validateTopology(topology: GraphTopologyMetadata) {
	expect(topology.modeId).toBeTruthy()
	expect(topology.modeName).toBeTruthy()
	expect(topology.description).toBeTruthy()
	expect(topology.nodes.length).toBeGreaterThan(0)

	const nodeIds = new Set(topology.nodes.map((n) => n.id))

	for (const edge of topology.edges) {
		expect(
			nodeIds.has(edge.from) || edge.from === "__start__",
			`Edge source '${edge.from}' does not exist in nodes`,
		).toBe(true)
		expect(
			nodeIds.has(edge.to) || edge.to === "__end__",
			`Edge target '${edge.to}' does not exist in nodes`,
		).toBe(true)
	}

	for (const node of topology.nodes) {
		expect(node.id).toBeTruthy()
		expect(node.label).toBeTruthy()
		expect(node.kind).toBeTruthy()
	}
}

describe("Built-in Graph Topologies", () => {
	it("validates ReactGraph topology", () => {
		validateTopology(reactGraphDefinition.topology)
		expect(reactGraphDefinition.id).toBe(ExecutionMode.REACT)
		const nodeIds = reactGraphDefinition.topology.nodes.map((n) => n.id)
		expect(nodeIds).toContain("agent")
		expect(nodeIds).toContain("tools")
	})

	it("validates ChatGraph topology", () => {
		validateTopology(chatGraphDefinition.topology)
		expect(chatGraphDefinition.id).toBe(ExecutionMode.FAST)
		const nodeIds = chatGraphDefinition.topology.nodes.map((n) => n.id)
		expect(nodeIds).toContain("chat_llm")
	})

	it("validates PlanSolveGraph topology", () => {
		validateTopology(planSolveGraphDefinition.topology)
		expect(planSolveGraphDefinition.id).toBe(ExecutionMode.PLAN)
		const nodeIds = planSolveGraphDefinition.topology.nodes.map((n) => n.id)
		expect(nodeIds).toContain("planner")
		expect(nodeIds).toContain("task_iterator")
		expect(nodeIds).toContain("executor")
		expect(nodeIds).toContain("reviewer")
		expect(nodeIds).toContain("summarizer")
	})
})
