import { StateGraph, START, END } from "@langchain/langgraph"
import { stepCountIs } from "ai"
import {
	AgentGraphStateAnnotation,
	ExecutionMode,
	type AgentGraphDefinition,
	type GraphTopologyMetadata,
} from "../types.js"
import { executeStreamLLM } from "../llm-stream.js"
import { reactTopology } from "../topologies.js"

export { reactTopology }

export const reactGraphDefinition: AgentGraphDefinition = {
	id: ExecutionMode.REACT,
	name: "ReAct",
	description:
		"Day-to-day coding, reading and editing files, bug fixing and terminal commands (autonomous ReAct loop with the full tool chain)",
	topology: reactTopology,
	buildGraph: (ctx) => {
		const workflow = new StateGraph(AgentGraphStateAnnotation)
			.addNode("agent", async (state) => {
				const result = await executeStreamLLM({
					model: ctx.model,
					modelIdStr: ctx.modelIdStr,
					instructions: ctx.instructions,
					messages: state.messages,
					tools: ctx.executableTools,
					stopWhen: stepCountIs(50),
					abortSignal: ctx.abortSignal,
					assistantMessageId: state.assistantMessageId,
					emit: ctx.emit,
					initialExecutedTools: state.executedTools,
					initialAssistantText: state.assistantText,
					initialReasoningText: state.reasoningText,
					recorder: ctx.recorder,
					threadId: ctx.threadId,
				})

				return {
					assistantText: result.assistantText,
					reasoningText: result.reasoningText,
					executedTools: result.executedTools,
					tokenUsage: result.tokenUsage,
					isFinished: true,
				}
			})
			.addNode("tools", async (state) => {
				// Tool execution verification and checkpointing node
				return {
					executedTools: state.executedTools,
				}
			})

		workflow.addEdge(START, "agent")
		workflow.addConditionalEdges("agent", (state) => {
			if (state.executedTools && state.executedTools.length > 0) {
				return "tools"
			}
			return END
		})
		workflow.addEdge("tools", END)

		return workflow.compile()
	},
}
