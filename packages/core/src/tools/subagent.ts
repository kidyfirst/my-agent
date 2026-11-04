/**
 * Subagent tool — spawns a subagent to perform a focused task.
 *
 * The parent agent calls this tool with a task description and agent type.
 * Under Worker mode, a fresh SubagentWorker runs on an isolated thread / process
 * with its constrained tool set, streaming events via IPC to the parent harness,
 * completely offloading heavy CPU operations (grep, glob, AST parsing, diff)
 * from the Main process Event Loop.
 */
import { createTool } from "../core/index.js"
import { logger } from "../core/logger/index.js"
import { z } from "zod/v3"
import { getSubagentDefinition, getSubagentIds } from "../agents/index.js"
import type { HarnessRequestContext } from "../harness/index.js"
import { SubagentWorkerHost } from "../subagent/worker-host.js"
import { buildSubagentMeta } from "../subagent/worker-executor.js"

export interface SubagentToolDeps {
	/**
	 * The full tool registry from the parent agent.
	 * The subagent will receive a subset based on its allowedTools.
	 */
	tools: Record<string, any>

	/**
	 * Function to resolve a model ID to a language model instance.
	 * Shared with the parent agent so subagents use the same providers.
	 */
	resolveModel: (modelId: string) => any

	/**
	 * Model ID to use for subagent tasks.
	 * Defaults to a fast model to keep costs down.
	 */
	defaultModelId?: string

	/**
	 * Restrict which agent types can be spawned.
	 * If not provided, all registered agent types are available.
	 */
	allowedAgentTypes?: string[]

	/**
	 * Execution mode: "worker" (isolated thread) or "direct" (in-process fallback).
	 * Defaults to "worker" unless running inside Vitest or explicitly set.
	 */
	mode?: "worker" | "direct"
}

// Default model for subagent tasks — fast and cheap
const DEFAULT_SUBAGENT_MODEL = "google/gemini-2.0-flash"
// Explore subagents can use Cerebras for speed when available
const EXPLORE_SUBAGENT_MODEL = DEFAULT_SUBAGENT_MODEL

export function createSubagentTool(deps: SubagentToolDeps) {
	const allAgentTypes = getSubagentIds()
	const validAgentTypes = deps.allowedAgentTypes
		? allAgentTypes.filter((t) => deps.allowedAgentTypes!.includes(t))
		: allAgentTypes

	const typeDescriptions: Record<string, string> = {
		explore: `- **explore**: Read-only codebase exploration. Has access to view, search_content, and find_files. Use for questions like "find all usages of X", "how does module Y work", "what files are related to Z".`,
		plan: `- **plan**: Read-only analysis and planning. Same tools as explore. Use for "create an implementation plan for X", "analyze the architecture of Y".`,
		execute: `- **execute**: Task execution with write capabilities. Has access to all tools including string_replace_lsp, write_file, and execute_command. Use for "implement feature X", "fix bug Y", "refactor module Z".`,
	}

	const availableTypesDocs = validAgentTypes
		.map((t) => typeDescriptions[t] ?? `- **${t}**`)
		.join("\n")

	const hasExecute = validAgentTypes.includes("execute")

	return createTool({
		id: "subagent",
		description: `Delegate a focused task to a specialized subagent. The subagent runs independently with a constrained toolset, then returns its findings as text.

Available agent types:
${availableTypesDocs}

The subagent runs in its own context — it does NOT see the parent conversation history. Write a clear, self-contained task description.

Use this tool when:
- You want to run multiple investigations in parallel
- The task is self-contained and can be delegated${hasExecute ? "\n- You want to perform a focused implementation task (execute type)" : ""}`,
		inputSchema: z.object({
			agentType: z
				.enum(validAgentTypes as [string, ...string[]])
				.describe("Type of subagent to spawn"),
			task: z
				.string()
				.describe(
					"Clear, self-contained description of what the subagent should do. Include all relevant context — the subagent cannot see the parent conversation.",
				),
			modelId: z
				.string()
				.optional()
				.describe(
					`Model ID to use for this task. Defaults to ${DEFAULT_SUBAGENT_MODEL}.`,
				),
		}),
		execute: async ({ agentType, task, modelId }, context) => {
			const definition = getSubagentDefinition(agentType)
			if (!definition) {
				return {
					content: `Unknown agent type: ${agentType}. Valid types: ${validAgentTypes.join(", ")}`,
					isError: true,
				}
			}

			// Get emit function and abort signal from harness context (if available)
			const harnessCtx = (context?.requestContext?.get("controller") ||
				context?.requestContext?.get("harness")) as
				| HarnessRequestContext
				| undefined
			const toolCallId = context?.toolCallId ?? "unknown"

			// Resolve the model with the following precedence:
			// 1. Explicit modelId from tool call
			// 2. Configured subagent model for this agent type (thread or global)
			// 3. Deps default model
			// 4. Type-specific defaults (Cerebras for explore if available)
			const defaultForType =
				agentType === "explore"
					? EXPLORE_SUBAGENT_MODEL
					: DEFAULT_SUBAGENT_MODEL

			// Check for configured subagent model from harness (per-type)
			const configuredSubagentModel = harnessCtx?.getSubagentModelId?.({
				agentType,
			})

			const resolvedModelId =
				modelId ??
				configuredSubagentModel ??
				deps.defaultModelId ??
				defaultForType

			// Pre-validate model resolution
			try {
				deps.resolveModel(resolvedModelId)
			} catch (err) {
				return {
					content: `Failed to resolve model "${resolvedModelId}": ${err instanceof Error ? err.message : String(err)}`,
					isError: true,
				}
			}

			const session = (harnessCtx as any)?.requestContext?.get?.(
				"session",
			) as any
			const state =
				session?.state?.get?.() ??
				(harnessCtx as any)?.state ??
				(harnessCtx as any)?.getState?.()
			const projectRoot =
				(state?.projectPath as string | undefined) || process.cwd()

			logger.info("subagent", `spawning subagent worker: [${agentType}]`, {
				toolCallId,
				agentType,
				task,
				model: resolvedModelId,
				allowedTools: definition.allowedTools,
			})

			const effectiveMode =
				deps.mode ??
				(process.env.MY_AGENT_SUBAGENT_MODE as
					| "worker"
					| "direct"
					| undefined) ??
				(process.env.VITEST ? "direct" : "worker")

			const host = new SubagentWorkerHost({
				tools: deps.tools,
				resolveModel: deps.resolveModel,
				mode: effectiveMode,
			})

			return await host.execute(
				{
					toolCallId,
					agentType,
					task,
					modelId: resolvedModelId,
					projectRoot,
					allowedTools: definition.allowedTools,
				},
				harnessCtx,
				context?.requestContext,
			)
		},
	})
}

export { buildSubagentMeta }
