import { StateGraph, START, END } from "@langchain/langgraph"
import { stepCountIs } from "ai"
import {
	AgentGraphStateAnnotation,
	ExecutionMode,
	type AgentGraphDefinition,
	type GraphTopologyMetadata,
} from "../types.js"
import { executeStreamLLM } from "../llm-stream.js"
import { planSolveTopology } from "../topologies.js"

export { planSolveTopology }

export const planSolveGraphDefinition: AgentGraphDefinition = {
	id: ExecutionMode.PLAN,
	name: "Plan & Solve",
	description:
		"Complex multi-step work, large refactors, new feature architecture and systematic migrations (writes a structured task list first, then executes and reviews step by step)",
	topology: planSolveTopology,
	buildGraph: (ctx) => {
		const workflow = new StateGraph(AgentGraphStateAnnotation)
			.addNode("planner", async (state) => {
				// Inject planning prompt emphasis
				const planInstructions = `${ctx.instructions}\n\nYou are operating in Plan mode. First investigate the repository with tools as needed, then outline a comprehensive, well-structured checklist of tasks and analysis to fulfill the user request.`
				const result = await executeStreamLLM({
					model: ctx.model,
					modelIdStr: ctx.modelIdStr,
					instructions: planInstructions,
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
					turn: 1,
					step: 1,
					threadId: ctx.threadId,
				})

				return {
					assistantText: result.assistantText,
					reasoningText: result.reasoningText,
					executedTools: result.executedTools,
					tokenUsage: result.tokenUsage,
				}
			})
			.addNode("task_iterator", async (_state) => {
				return {}
			})
			.addNode("executor", async (_state) => {
				return {}
			})
			.addNode("reviewer", async (_state) => {
				return {}
			})
			.addNode("summarizer", async (state) => {
				// If planner ended abruptly on tools without producing a conclusive answer or report,
				// synthesize the final answer using the collected tool results.
				const currentText = (state.assistantText || "").trim()
				const needsSummary =
					!currentText ||
					currentText.length < 150 ||
					currentText.endsWith("...") ||
					/Let me (?:check|examine|look|explore|verify)[^.!?]*$/i.test(
						currentText,
					)

				if (needsSummary && !ctx.abortSignal.aborted) {
					const summaryInstructions = `${ctx.instructions}\n\nYou are in Plan & Solve mode. You have completed the preliminary investigation and tool exploration. Now synthesize all your findings and provide a comprehensive, detailed feasibility report, plan, and answer to the user request.`
					const summaryResult = await executeStreamLLM({
						model: ctx.model,
						modelIdStr: ctx.modelIdStr,
						instructions: summaryInstructions,
						messages: state.messages,
						tools: undefined, // Pure text generation for final answer
						abortSignal: ctx.abortSignal,
						assistantMessageId: state.assistantMessageId,
						emit: ctx.emit,
						initialExecutedTools: state.executedTools,
						initialAssistantText: state.assistantText,
						initialReasoningText: state.reasoningText,
						recorder: ctx.recorder,
						turn: 1,
						step: 2,
						threadId: ctx.threadId,
					})

					return {
						assistantText: summaryResult.assistantText,
						reasoningText: summaryResult.reasoningText,
						tokenUsage: summaryResult.tokenUsage,
						isFinished: true,
					}
				}

				return {
					isFinished: true,
				}
			})

		workflow.addEdge(START, "planner")
		workflow.addEdge("planner", "task_iterator")
		workflow.addEdge("task_iterator", "executor")
		workflow.addEdge("executor", "reviewer")
		workflow.addEdge("reviewer", "summarizer")
		workflow.addEdge("summarizer", END)

		return workflow.compile()
	},
}
