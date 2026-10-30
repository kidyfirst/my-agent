import { randomUUID } from "node:crypto"
import {
	AgentGraphStateAnnotation,
	type AgentGraphStateType,
	type GraphExecutionContext,
	type GraphLifecycleEvent,
} from "./types.js"
import { defaultGraphRegistry, GraphRegistry } from "./registry.js"

export interface GraphRunResult {
	assistantMessageId: string
	assistantText: string
	reasoningText: string
	executedTools: any[]
	tasks?: any[]
	tokenUsage: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
	durationMs: number
	error?: Error | null
}

/**
 * Runner that executes a LangGraph StateGraph within the Agent runtime context.
 * Dispatches node lifecycle events, aggregates streams, and ensures cleanup on abort.
 */
export class GraphRunner {
	constructor(private registry: GraphRegistry = defaultGraphRegistry) {}

	/**
	 * Execute the graph for the given mode and context.
	 */
	async run(
		ctx: GraphExecutionContext,
		initialMessages: any[] = [],
		customAssistantMessageId?: string,
	): Promise<GraphRunResult> {
		const startTime = Date.now()
		const graphDef = this.registry.resolve(ctx.modeId)
		const assistantMessageId = customAssistantMessageId || randomUUID()

		// Initial state
		const initialState: Partial<AgentGraphStateType> = {
			messages: initialMessages,
			assistantMessageId,
			assistantText: "",
			reasoningText: "",
			executedTools: [],
			activeNodeId: "",
			tasks: [],
			tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
			isFinished: false,
			error: null,
		}

		// Compile the graph with execution context
		const app = graphDef.buildGraph(ctx)

		let currentState: AgentGraphStateType = {
			...AgentGraphStateAnnotation.spec,
			...initialState,
		} as AgentGraphStateType

		let previousNodeId = ""
		let nodeStartTime = startTime

		try {
			// Stream through the LangGraph steps
			// Using streamMode: ["updates", "values"] gives us both the active node names and the fully reduced state values
			const stream = await app.stream(initialState, {
				signal: ctx.abortSignal,
				streamMode: ["updates", "values"],
			})

			for await (const [mode, chunk] of stream) {
				if (ctx.abortSignal.aborted) {
					break
				}

				if (mode === "values") {
					if (chunk && typeof chunk === "object") {
						currentState = {
							...currentState,
							...chunk,
						}
					}
				} else if (mode === "updates") {
					// chunk is { [nodeName]: nodeOutput }
					const nodeNames = Object.keys(chunk)
					for (const nodeName of nodeNames) {
						if (nodeName.startsWith("__")) continue // Skip internal nodes if any

						// Check if transitioning from a previous node
						if (previousNodeId && previousNodeId !== nodeName) {
							const dur = Date.now() - nodeStartTime
							ctx.emit({
								type: "graph_node_completed",
								nodeId: previousNodeId,
								nodeLabel: this.getNodeLabel(graphDef, previousNodeId),
								modeId: graphDef.id,
								durationMs: dur,
							} as GraphLifecycleEvent)
						}

						previousNodeId = nodeName
						nodeStartTime = Date.now()

						ctx.emit({
							type: "graph_node_started",
							nodeId: nodeName,
							nodeLabel: this.getNodeLabel(graphDef, nodeName),
							modeId: graphDef.id,
							timestamp: nodeStartTime,
						} as GraphLifecycleEvent)
					}
				}
			}

			// Complete the final active node if present
			if (previousNodeId) {
				const dur = Date.now() - nodeStartTime
				ctx.emit({
					type: "graph_node_completed",
					nodeId: previousNodeId,
					nodeLabel: this.getNodeLabel(graphDef, previousNodeId),
					modeId: graphDef.id,
					durationMs: dur,
				} as GraphLifecycleEvent)
			}
		} catch (err: any) {
			if (ctx.abortSignal.aborted) {
				// Aborted by user
			} else {
				currentState.error = err instanceof Error ? err : new Error(String(err))
				throw err
			}
		}

		const durationMs = Date.now() - startTime

		return {
			assistantMessageId: currentState.assistantMessageId || assistantMessageId,
			assistantText: currentState.assistantText || "",
			reasoningText: currentState.reasoningText || "",
			executedTools: currentState.executedTools || [],
			tasks: currentState.tasks,
			tokenUsage: currentState.tokenUsage || {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
			},
			durationMs,
			error: currentState.error,
		}
	}

	private getNodeLabel(graphDef: any, nodeId: string): string {
		const node = graphDef.topology?.nodes?.find((n: any) => n.id === nodeId)
		return node?.label || nodeId
	}
}

export const defaultGraphRunner = new GraphRunner()
