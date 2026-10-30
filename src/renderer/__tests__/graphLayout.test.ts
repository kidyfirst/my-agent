import { describe, expect, it } from "vitest"
import {
	buildFlowElements,
	corridorOffsetFor,
	estimateLabelWidth,
	estimateNodeHeight,
} from "../components/graph/graphLayout"
import { reactTopology } from "../../core/graph/graphs/react-graph"

const NODE_WIDTH = 270
const LABEL_CLEARANCE = 26
const MIN_OFFSET = 42

describe("graphLayout", () => {
	it("measures cards by how their text wraps", () => {
		const oneLine = estimateNodeHeight({
			description: "Short text",
			configSummary: "No tools",
		})
		const twoLine = estimateNodeHeight({
			description:
				"Applies file edits, runs shell commands, interacts with LSP, and records tool results",
			configSummary: "Filesystem, Terminal, LSP, Subagents",
		})
		expect(twoLine).toBeGreaterThan(oneLine)
	})

	it("stacks cards without vertical overlap", () => {
		const { nodes } = buildFlowElements(reactTopology)
		const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y)
		for (let i = 0; i < sorted.length - 1; i++) {
			const current = sorted[i]
			const next = sorted[i + 1]
			const height = estimateNodeHeight(current.data as any)
			expect(current.position.y + height).toBeLessThanOrEqual(next.position.y)
		}
	})

	it("pushes corridor badges clear of the node column", () => {
		const { nodes, edges } = buildFlowElements(reactTopology)
		const nodeLeft = Math.min(...nodes.map((n) => n.position.x))
		const nodeRight = nodeLeft + NODE_WIDTH

		const corridorEdges = edges.filter(
			(e) =>
				e.sourceHandle === "left-source" || e.sourceHandle === "right-source",
		)
		expect(corridorEdges.length).toBeGreaterThan(0)

		for (const edge of corridorEdges) {
			const offset =
				(edge.pathOptions as { offset?: number } | undefined)?.offset ?? 0
			const halfLabel = estimateLabelWidth(edge.label as string) / 2

			if (edge.sourceHandle === "left-source") {
				// Badge centre sits at nodeLeft - offset; its right edge must clear the card.
				expect(nodeLeft - offset + halfLabel).toBeLessThanOrEqual(nodeLeft)
			} else {
				expect(nodeRight + offset - halfLabel).toBeGreaterThanOrEqual(nodeRight)
			}
		}
	})

	it("sizes corridor offsets from label width", () => {
		expect(corridorOffsetFor("Goal achieved")).toBe(
			Math.max(
				MIN_OFFSET,
				Math.ceil(estimateLabelWidth("Goal achieved") / 2 + LABEL_CLEARANCE),
			),
		)
		expect(corridorOffsetFor("Tool outputs fedback")).toBeGreaterThan(
			corridorOffsetFor("Goal achieved"),
		)
	})
})
