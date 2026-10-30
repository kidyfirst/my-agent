import { describe, it, expect, beforeEach } from "vitest"
import { GraphRegistry } from "../registry.js"
import type { AgentGraphDefinition, GraphTopologyMetadata } from "../types.js"

describe("GraphRegistry", () => {
	let registry: GraphRegistry

	const mockTopology: GraphTopologyMetadata = {
		modeId: "test-mode",
		modeName: "Test Mode",
		description: "A test execution mode",
		nodes: [
			{
				id: "node1",
				label: "Node 1",
				description: "First node",
				kind: "start",
			},
			{
				id: "node2",
				label: "Node 2",
				description: "Second node",
				kind: "end",
			},
		],
		edges: [
			{
				from: "node1",
				to: "node2",
				label: "to end",
			},
		],
	}

	const mockDefinition: AgentGraphDefinition = {
		id: "test-mode",
		name: "Test Mode",
		description: "A test execution mode",
		topology: mockTopology,
		buildGraph: () => ({
			stream: async function* () {
				yield { node1: { assistantText: "hi" } }
			},
		}),
	}

	beforeEach(() => {
		registry = new GraphRegistry()
	})

	it("registers and retrieves a graph definition", () => {
		registry.register(mockDefinition)
		expect(registry.has("test-mode")).toBe(true)
		expect(registry.get("test-mode")).toBe(mockDefinition)
	})

	it("lists all registered definitions and topologies", () => {
		registry.register(mockDefinition)
		expect(registry.list()).toHaveLength(1)
		expect(registry.listTopologies()).toEqual([mockTopology])
		expect(registry.getTopology("test-mode")).toEqual(mockTopology)
	})

	it("resolves exact mode or falls back to defaultModeId", () => {
		registry.setDefaultMode("test-mode")
		registry.register(mockDefinition)

		// Exact match
		expect(registry.resolve("test-mode").id).toBe("test-mode")
		// Unknown mode falls back to default
		expect(registry.resolve("unknown-mode").id).toBe("test-mode")
		// Undefined falls back to default
		expect(registry.resolve(undefined).id).toBe("test-mode")
	})

	it("throws if no definitions are registered", () => {
		expect(() => registry.resolve("none")).toThrowError(
			/No execution graph definitions/,
		)
	})
})
