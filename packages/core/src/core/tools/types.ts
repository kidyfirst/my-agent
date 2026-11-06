import type { z } from "zod"
import type { RequestContext } from "../context/index.js"

export interface ToolExecutionContext {
	requestContext?: RequestContext
	myagent?: unknown
	agent?: unknown
	toolCallId?: string
	runId?: string
	suspend?: (args?: unknown, options?: unknown) => Promise<unknown>
	[key: string]: unknown
}

/**
 * Unified tool interface across the system:
 * whether created via `createTool`, class instances of `Tool`,
 * plain config objects, MCP server tools, or dynamic tool resolvers.
 */
export interface ToolAction<TInput = unknown, TOutput = unknown> {
	id?: string
	description?: string
	inputSchema?: unknown
	outputSchema?: unknown
	parameters?: unknown
	execute?: (
		input: TInput,
		context?: ToolExecutionContext,
	) => Promise<TOutput> | TOutput
	[key: string]: unknown
}

export interface ToolConfig<
	TInputSchema extends z.ZodType = z.ZodType,
	TOutput = unknown,
> extends ToolAction<z.infer<TInputSchema>, TOutput> {
	id: string
	description: string
	inputSchema?: TInputSchema
	outputSchema?: z.ZodType
	execute: (
		input: z.infer<TInputSchema>,
		context?: ToolExecutionContext,
	) => Promise<TOutput> | TOutput
	[key: string]: unknown
}
