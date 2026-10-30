import { MarkerType, type BuiltInEdge, type Node } from "@xyflow/react"
import type {
	GraphTopologyMetadata,
	GraphTopologyNode,
	GraphTopologyEdge,
} from "../../types/ipc"

/** Must match the fixed card width in CustomGraphNode. */
const NODE_WIDTH = 270
const NODE_PADDING_X = 14
const NODE_PADDING_Y = 10
const NODE_FONT_SIZE = 11
const NODE_LINE_HEIGHT = 1.35

/** Must match labelStyle.fontSize in buildFlowElements. */
const LABEL_FONT_SIZE = 10.5
/** labelBgPadding is [8, 4], so 16px of horizontal chrome around the text. */
const LABEL_BG_PADDING_X = 16
/** Minimum clearance kept between an edge label and a node card. */
const LABEL_CLEARANCE = 26
const MIN_CORRIDOR_OFFSET = 42

const HEADER_HEIGHT = 19
const HEADER_MARGIN_BOTTOM = 4
const DESCRIPTION_MARGIN_TOP = 4
const CONFIG_MARGIN_TOP = 6
const CONFIG_PADDING_Y = 2
const CONFIG_FONT_SIZE = 10
const CONFIG_ICON_WIDTH = 18
const CARD_BORDER = 2
/** Slack for font metric differences between estimate and real rendering. */
const HEIGHT_SAFETY = 8

/**
 * Rough average glyph advance for the UI sans-serif stack. Deliberately a bit
 * wide so heights are over- rather than under-estimated.
 */
function averageCharWidth(fontSize: number): number {
	return fontSize * 0.56
}

/** Greedy word wrap line count for a given usable width. */
export function countWrappedLines(
	text: string,
	maxWidth: number,
	fontSize: number,
): number {
	if (!text) return 0
	const charsPerLine = Math.max(
		1,
		Math.floor(maxWidth / averageCharWidth(fontSize)),
	)
	let lines = 1
	let lineLength = 0
	for (const word of text.split(/\s+/)) {
		if (!word) continue
		if (lineLength === 0) {
			lineLength = word.length
		} else if (lineLength + 1 + word.length <= charsPerLine) {
			lineLength += 1 + word.length
		} else {
			lines += 1
			lineLength = word.length
		}
	}
	return lines
}

/**
 * Height of a rendered card, derived from how its description and config
 * summary actually wrap. A fixed estimate used to under-measure cards with a
 * two-line summary, which let the next card creep up and hide text.
 */
export function estimateNodeHeight(node: {
	description?: string
	configSummary?: string
}): number {
	const contentWidth = NODE_WIDTH - NODE_PADDING_X * 2
	const descriptionLines = countWrappedLines(
		node.description ?? "",
		contentWidth,
		NODE_FONT_SIZE,
	)

	let height = NODE_PADDING_Y * 2 + CARD_BORDER
	height += HEADER_HEIGHT + HEADER_MARGIN_BOTTOM
	height +=
		DESCRIPTION_MARGIN_TOP +
		descriptionLines * NODE_FONT_SIZE * NODE_LINE_HEIGHT

	if (node.configSummary) {
		const summaryLines = countWrappedLines(
			node.configSummary,
			contentWidth - CONFIG_ICON_WIDTH,
			CONFIG_FONT_SIZE,
		)
		height +=
			CONFIG_MARGIN_TOP +
			CONFIG_PADDING_Y * 2 +
			2 +
			summaryLines * CONFIG_FONT_SIZE * 1.35
	}

	return Math.ceil(height) + HEIGHT_SAFETY
}

/** Rendered width of an edge label badge. */
export function estimateLabelWidth(label?: string): number {
	if (!label) return 0
	return (
		Math.ceil(label.length * averageCharWidth(LABEL_FONT_SIZE)) +
		LABEL_BG_PADDING_X
	)
}

/**
 * Corridor distance needed so a badge centred on the corridor never reaches
 * back over the card it belongs to.
 */
export function corridorOffsetFor(label?: string): number {
	const halfLabel = estimateLabelWidth(label) / 2
	return Math.max(MIN_CORRIDOR_OFFSET, Math.ceil(halfLabel + LABEL_CLEARANCE))
}

/**
 * Builds @xyflow/react Node and Edge arrays from GraphTopologyMetadata.
 *
 * Cards are stacked with heights measured from their text, and loop/bypass
 * edges are routed through side corridors wide enough that their labels stay
 * clear of the cards.
 */
export function buildFlowElements(
	topology: GraphTopologyMetadata,
	activeNodeId?: string | null,
): { nodes: Node[]; edges: BuiltInEdge[] } {
	const nodes: Node[] = []
	const edges: BuiltInEdge[] = []

	// Left edge of the node column: wide enough that the left bypass corridor
	// and its badge both fit on canvas.
	let centerX = 40
	for (const edge of topology.edges) {
		if (edge.conditionType === "no_tools") {
			const corridor = corridorOffsetFor(edge.label)
			const badgeHalf = estimateLabelWidth(edge.label) / 2
			centerX = Math.max(centerX, corridor + badgeHalf + 16)
		}
	}
	// Vertical breathing room between cards; wide enough for centre labels.
	const interNodeGap = 96

	// 1. Build Node Order Map for topological classification
	const nodeOrderMap = new Map<string, number>()
	nodeOrderMap.set("__start__", 0)
	topology.nodes.forEach((node, idx) => {
		nodeOrderMap.set(node.id, idx + 1)
	})
	nodeOrderMap.set("__end__", topology.nodes.length + 1)

	// 2. Add Start Node
	let currentY = 40
	const startNode = {
		label: "Start",
		description: "User input dispatched to agent",
	}
	nodes.push({
		id: "__start__",
		type: "custom",
		position: { x: centerX, y: currentY },
		data: {
			...startNode,
			kind: "start",
			isRunning: false,
		},
	})
	currentY += estimateNodeHeight(startNode) + interNodeGap

	// 3. Add Domain Graph Nodes
	topology.nodes.forEach((node: GraphTopologyNode) => {
		nodes.push({
			id: node.id,
			type: "custom",
			position: { x: centerX, y: currentY },
			data: {
				label: node.label,
				description: node.description,
				kind: node.kind,
				configSummary: node.configSummary,
				isRunning: activeNodeId === node.id,
			},
		})
		currentY += estimateNodeHeight(node) + interNodeGap
	})

	// 4. Add End Node
	const endNode = {
		label: "End",
		description: "Turn finished, reply persisted & returned",
	}
	nodes.push({
		id: "__end__",
		type: "custom",
		position: { x: centerX, y: currentY },
		data: {
			...endNode,
			kind: "end",
			isRunning: false,
		},
	})

	// 5. Build Edges with 3 distinct channels (Center, Right loop, Left bypass)
	topology.edges.forEach((edge: GraphTopologyEdge, idx: number) => {
		const fromIdx = nodeOrderMap.get(edge.from) ?? 0
		const toIdx = nodeOrderMap.get(edge.to) ?? 0

		const isLoop = edge.conditionType === "loop" || fromIdx > toIdx
		const isBypass =
			!isLoop && (edge.conditionType === "no_tools" || toIdx - fromIdx > 1)
		const isActive = activeNodeId === edge.from || activeNodeId === edge.to

		let sourceHandle = "bottom"
		let targetHandle = "top"
		let strokeColor = isActive
			? "var(--graph-edge-active)"
			: "var(--graph-edge-default)"
		let strokeWidth = isActive ? 2 : 1.5
		let strokeDasharray: string | undefined = undefined
		let arrowColor = isActive
			? "var(--graph-edge-active)"
			: "var(--graph-edge-default)"
		let labelTextColor = isActive ? "var(--graph-edge-active)" : "var(--text)"
		let labelBgFill = "var(--bg-surface)"
		let labelBgStroke = "var(--border)"
		let offset = 20

		if (isLoop) {
			// Loops exit right side, step upwards along the right corridor, and enter target right side
			sourceHandle = "right-source"
			targetHandle = "right-target"
			strokeColor = "var(--graph-edge-loop)"
			strokeWidth = 2
			strokeDasharray = "5 4"
			arrowColor = "var(--graph-edge-loop)"
			labelTextColor = "var(--graph-edge-loop)"
			labelBgFill = "var(--bg-surface)"
			labelBgStroke = "var(--graph-edge-loop)"
			offset = corridorOffsetFor(edge.label)
		} else if (isBypass) {
			// Bypasses exit left side, step downwards along the left corridor, and enter target left side
			sourceHandle = "left-source"
			targetHandle = "left-target"
			strokeColor = "var(--graph-edge-bypass)"
			strokeWidth = 1.75
			arrowColor = "var(--graph-edge-bypass)"
			labelTextColor = "var(--graph-edge-bypass)"
			labelBgFill = "var(--bg-surface)"
			labelBgStroke = "var(--graph-edge-bypass)"
			offset = corridorOffsetFor(edge.label)
		}

		edges.push({
			id: `e-${edge.from}-${edge.to}-${idx}`,
			source: edge.from,
			target: edge.to,
			sourceHandle,
			targetHandle,
			type: "smoothstep" as const,
			animated: isLoop || isActive,
			label: edge.label,
			zIndex: isLoop || isBypass ? 1 : 0,
			style: {
				stroke: strokeColor,
				strokeWidth,
				strokeDasharray,
			},
			pathOptions: {
				borderRadius: 16,
				offset,
			},
			labelStyle: {
				fill: labelTextColor,
				fontSize: LABEL_FONT_SIZE,
				fontWeight: 600,
			},
			labelBgStyle: {
				fill: labelBgFill,
				stroke: labelBgStroke,
				strokeWidth: 1,
				fillOpacity: 0.95,
			},
			labelBgPadding: [8, 4],
			labelBgBorderRadius: 6,
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: arrowColor,
				width: 15,
				height: 15,
			},
		})
	})

	return { nodes, edges }
}
