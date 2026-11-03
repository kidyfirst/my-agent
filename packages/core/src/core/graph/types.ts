import { Annotation } from "@langchain/langgraph"
import type { LanguageModel } from "ai"

/**
 * Canonical execution modes for the agent.
 */
export enum ExecutionMode {
	REACT = "react",
	FAST = "fast",
	PLAN = "plan",
}

/**
 * Default execution mode for new sessions.
 */
export const DEFAULT_EXECUTION_MODE = ExecutionMode.REACT

/**
 * Valid execution mode identifiers (including legacy aliases).
 */
export type ExecutionModeId =
	| ExecutionMode
	| "react"
	| "fast"
	| "plan"
	| "build"
	| "chat"

/**
 * Node kinds represented in the graph topology for UI visualization.
 */
export type GraphNodeKind =
	| "start"
	| "llm"
	| "tool"
	| "condition"
	| "plan"
	| "review"
	| "human"
	| "end"

/**
 * Read-only representation of a single node in the graph topology.
 */
export interface GraphTopologyNode {
	id: string
	label: string
	description: string
	kind: GraphNodeKind
	configSummary?: string
}

/**
 * Read-only representation of an edge connecting two nodes.
 */
export interface GraphTopologyEdge {
	from: string
	to: string
	label?: string
	conditionType?: "has_tools" | "no_tools" | "loop" | "default" | "error"
}

/**
 * Complete read-only topology metadata describing an execution mode.
 */
export interface GraphTopologyMetadata {
	modeId: string
	modeName: string
	description: string
	icon?: string
	nodes: GraphTopologyNode[]
	edges: GraphTopologyEdge[]
}

/**
 * Record of a tool execution item during a turn.
 */
export interface ExecutedToolItem {
	id: string
	name: string
	args: unknown
	result?: unknown
	isError?: boolean
}

/**
 * Structured sub-task item for multi-phase planning modes.
 */
export interface PlanTaskItem {
	id: string
	title: string
	status: "pending" | "in_progress" | "completed" | "failed"
	detail?: string
}

/**
 * LangGraph State Annotation for Agent execution.
 * Tracks conversation messages, active node, token streams, executed tools, and tasks.
 */
export const AgentGraphStateAnnotation = Annotation.Root({
	/** Cumulative conversation messages in core format */
	messages: Annotation<any[]>({
		reducer: (curr, update) => (update ? curr.concat(update) : curr),
		default: () => [],
	}),
	/** Unique ID for the assistant message created this turn */
	assistantMessageId: Annotation<string>({
		reducer: (_curr, update) => update ?? _curr,
		default: () => "",
	}),
	/** Accumulated plain text response from the assistant */
	assistantText: Annotation<string>({
		reducer: (curr, update) => {
			if (update === undefined) return curr
			if (!curr) return update
			if (curr === update) return curr
			if (update.startsWith(curr)) return update
			return curr + update
		},
		default: () => "",
	}),
	/** Accumulated reasoning/thinking text */
	reasoningText: Annotation<string>({
		reducer: (curr, update) => {
			if (update === undefined) return curr
			if (!curr) return update
			if (curr === update) return curr
			if (update.startsWith(curr)) return update
			return curr + update
		},
		default: () => "",
	}),
	/** Tools called and executed during this turn */
	executedTools: Annotation<ExecutedToolItem[]>({
		reducer: (curr, update) => {
			if (!update || update.length === 0) return curr
			const existingIds = new Set(curr.map((t) => t.id))
			const newItems = update.filter((t) => !existingIds.has(t.id))
			return newItems.length > 0 ? curr.concat(newItems) : curr
		},
		default: () => [],
	}),
	/** Currently active node ID in the graph */
	activeNodeId: Annotation<string>({
		reducer: (_curr, update) => update ?? _curr,
		default: () => "",
	}),
	/** Optional structured plan / checklist for multi-step modes */
	tasks: Annotation<PlanTaskItem[]>({
		reducer: (_curr, update) => update ?? _curr,
		default: () => [],
	}),
	/** Token usage breakdown accumulated across nodes */
	tokenUsage: Annotation<{
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}>({
		reducer: (curr, update) => {
			if (!update) return curr
			return {
				promptTokens: curr.promptTokens + (update.promptTokens || 0),
				completionTokens:
					curr.completionTokens + (update.completionTokens || 0),
				totalTokens: curr.totalTokens + (update.totalTokens || 0),
			}
		},
		default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
	}),
	/** Whether the graph has completed or was aborted */
	isFinished: Annotation<boolean>({
		reducer: (_curr, update) => (update !== undefined ? update : _curr),
		default: () => false,
	}),
	/** Error if any node encountered an unrecoverable failure */
	error: Annotation<Error | null>({
		reducer: (_curr, update) => update ?? null,
		default: () => null,
	}),
})

export type AgentGraphStateType = typeof AgentGraphStateAnnotation.State

/**
 * Event emitted during graph execution.
 */
export type GraphLifecycleEvent =
	| {
			type: "graph_node_started"
			nodeId: string
			nodeLabel: string
			modeId: string
			timestamp: number
	  }
	| {
			type: "graph_node_completed"
			nodeId: string
			nodeLabel: string
			modeId: string
			durationMs: number
	  }
	| {
			type: "message_delta"
			id: string
			delta: string
			reasoningDelta?: string
	  }
	| {
			type: "message_update"
			id: string
			message: any
	  }
	| {
			type: "tasks_update"
			tasks: PlanTaskItem[]
	  }

/**
 * Execution context injected into graph nodes and runner.
 */
export interface GraphExecutionContext {
	modeId: string
	model: LanguageModel
	modelIdStr: string
	instructions: string
	executableTools: Record<string, any>
	abortSignal: AbortSignal
	emit: (event: any) => void
	store?: {
		saveMessages?: (opts: { messages: any[] }) => Promise<any>
	}
	resourceId: string
	threadId: string
	recorder?: any
}

/**
 * Definition interface for an execution mode graph.
 */
export interface AgentGraphDefinition {
	/** Unique identifier for the mode (e.g., 'build'/'react', 'fast'/'direct_chat', 'plan') */
	id: string
	/** Display name */
	name: string
	/** Detailed description of this mode's execution behavior */
	description: string
	/** Static read-only topology metadata for visualization */
	topology: GraphTopologyMetadata
	/** Factory function building the LangGraph StateGraph instance */
	buildGraph: (ctx: GraphExecutionContext) => any
}
