import { StateGraph, START, END } from "@langchain/langgraph"
import { stepCountIs } from "ai"
import {
	AgentGraphStateAnnotation,
	ExecutionMode,
	type AgentGraphDefinition,
	type GraphTopologyMetadata,
} from "../types.js"
import { executeStreamLLM } from "../llm-stream.js"

export const reactTopology: GraphTopologyMetadata = {
	modeId: ExecutionMode.REACT,
	modeName: "ReAct",
	description:
		"Day-to-day coding, reading and editing files, bug fixing and terminal commands (autonomous ReAct loop with the full tool chain)",
	icon: "wrench",
	nodes: [
		{
			id: "agent",
			label: "Agent Reasoning",
			description:
				"Analyzes user prompt, reasons about repository state, and decides next tool or text answer",
			kind: "llm",
			configSummary: "Full tools enabled, max 50 steps",
		},
		{
			id: "tools",
			label: "Execute Tools",
			description:
				"Applies file edits, runs shell commands, interacts with LSP, and records tool results",
			kind: "tool",
			configSummary: "Filesystem, Terminal, LSP, Subagents",
		},
	],
	edges: [
		{
			from: "__start__",
			to: "agent",
			label: "User prompt",
		},
		{
			from: "agent",
			to: "tools",
			label: "Tool calls generated",
			conditionType: "has_tools",
		},
		{
			from: "tools",
			to: "agent",
			label: "Tool outputs fedback",
			conditionType: "loop",
		},
		{
			from: "agent",
			to: "__end__",
			label: "Goal achieved",
			conditionType: "no_tools",
		},
	],
}

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
