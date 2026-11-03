import type { z } from "zod"
import type { RequestContext } from "../context/index.js"

export interface ToolExecutionContext {
	requestContext?: RequestContext
	myagent?: any
	agent?: any
	toolCallId?: string
	runId?: string
	suspend?: (args?: any, options?: any) => Promise<any>
	[key: string]: any
}

export interface ToolConfig<
	TInputSchema extends z.ZodType<any> = z.ZodType<any>,
	TOutput = any,
> {
	id: string
	description: string
	inputSchema?: TInputSchema
	outputSchema?: z.ZodType<any>
	execute: (
		input: z.infer<TInputSchema>,
		context?: ToolExecutionContext,
	) => Promise<TOutput> | TOutput
	[key: string]: any
}
