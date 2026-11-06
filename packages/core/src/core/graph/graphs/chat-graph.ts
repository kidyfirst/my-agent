import { StateGraph, START, END } from "@langchain/langgraph"
import { stepCountIs } from "ai"
import {
	AgentGraphStateAnnotation,
	ExecutionMode,
	type AgentGraphDefinition,
	type GraphTopologyMetadata,
} from "../types.js"
import { executeStreamLLM } from "../llm-stream.js"
import { selectReadOnlyTools } from "../readonly-tools.js"
import {
	chatTopology,
	FAST_DESCRIPTION,
	FAST_MAX_STEPS,
} from "../topologies.js"

export { chatTopology }

export const chatGraphDefinition: AgentGraphDefinition = {
	id: ExecutionMode.FAST,
	name: "Fast",
	description: FAST_DESCRIPTION,
	topology: chatTopology,
	buildGraph: (ctx) => {
		// Fast mode may look things up but must never touch the workspace: only
		// the `read` category survives, so write/edit/execute tools and MCP tools
		// with unknown effects are never advertised to the model in the first
		// place. A connected search server survives (its tools are categorised
		// `read`), otherwise Fast mode has no way to answer anything current.
		const readOnlyTools = selectReadOnlyTools(ctx.executableTools)

		const workflow = new StateGraph(AgentGraphStateAnnotation).addNode(
			"chat_llm",
			async (state) => {
				const result = await executeStreamLLM({
					model: ctx.model,
					modelIdStr: ctx.modelIdStr,
					instructions: `${ctx.instructions}\n\nIMPORTANT: You are in Fast mode with read-only tool access. Never call a tool that creates, modifies or deletes files, runs shell commands, or otherwise changes the workspace; if the user asks for a change, explain briefly and suggest switching to ReAct mode. You MUST NOT output any tool call markup, DSML tags, or function invocations as text — only use the registered tools.`,
					messages: state.messages,
					tools: readOnlyTools,
					stopWhen: stepCountIs(FAST_MAX_STEPS),
					abortSignal: ctx.abortSignal,
					assistantMessageId: state.assistantMessageId,
					emit: ctx.emit,
					initialAssistantText: state.assistantText,
					initialReasoningText: state.reasoningText,
					initialExecutedTools: state.executedTools,
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
			},
		)

		workflow.addEdge(START, "chat_llm")
		workflow.addEdge("chat_llm", END)

		return workflow.compile()
	},
}
