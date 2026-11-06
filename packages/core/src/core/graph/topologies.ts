import { ExecutionMode, type GraphTopologyMetadata } from "./types.js"

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

export const planSolveTopology: GraphTopologyMetadata = {
	modeId: ExecutionMode.PLAN,
	modeName: "Plan & Solve",
	description:
		"Complex multi-step work, large refactors, new feature architecture and systematic migrations (writes a structured task list first, then executes and reviews step by step)",
	icon: "list-ordered",
	nodes: [
		{
			id: "planner",
			label: "Task Planner",
			description:
				"Analyzes objectives and breaks down complex requirements into structured sub-tasks",
			kind: "plan",
			configSummary: "Read-only inspection, task checklist generation",
		},
		{
			id: "task_iterator",
			label: "Task Iterator",
			description:
				"Tracks execution progress, selects the next pending sub-task, and sets focus",
			kind: "condition",
			configSummary: "Loop controller",
		},
		{
			id: "executor",
			label: "Worker Executor",
			description:
				"Performs focused tool execution and file modifications for the current sub-task",
			kind: "llm",
			configSummary: "Contextual tools execution",
		},
		{
			id: "reviewer",
			label: "Quality Reviewer",
			description:
				"Verifies implemented changes, checks for errors, and confirms task completion",
			kind: "review",
			configSummary: "Verification gate",
		},
		{
			id: "summarizer",
			label: "Final Summarizer",
			description:
				"Summarizes completed work and provides next-step suggestions to the user",
			kind: "llm",
			configSummary: "Synthesis and report",
		},
	],
	edges: [
		{
			from: "__start__",
			to: "planner",
			label: "User goal",
		},
		{
			from: "planner",
			to: "task_iterator",
			label: "Task checklist ready",
		},
		{
			from: "task_iterator",
			to: "executor",
			label: "Next task",
		},
		{
			from: "executor",
			to: "reviewer",
			label: "Work completed",
		},
		{
			from: "reviewer",
			to: "task_iterator",
			label: "More tasks pending",
			conditionType: "loop",
		},
		{
			from: "reviewer",
			to: "summarizer",
			label: "All tasks completed",
			conditionType: "default",
		},
		{
			from: "summarizer",
			to: "__end__",
			label: "Done",
		},
	],
}

export const FAST_MAX_STEPS = 8

export const FAST_DESCRIPTION =
	"Quick Q&A, concept questions and lookups (answers streamed straight back, read-only tools for files and the web, never writes)"

export const chatTopology: GraphTopologyMetadata = {
	modeId: ExecutionMode.FAST,
	modeName: "Fast",
	description: FAST_DESCRIPTION,
	icon: "bolt",
	nodes: [
		{
			id: "chat_llm",
			label: "Direct LLM Stream",
			description:
				"Streams the answer, reading files, searching the code and querying the web when it needs context",
			kind: "llm",
			configSummary: `Read-only tools, max ${FAST_MAX_STEPS} steps`,
		},
	],
	edges: [
		{
			from: "__start__",
			to: "chat_llm",
			label: "User message",
		},
		{
			from: "chat_llm",
			to: "__end__",
			label: "Response complete",
		},
	],
}
