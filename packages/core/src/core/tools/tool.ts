import type { z } from "zod"
import type { ToolAction, ToolConfig, ToolExecutionContext } from "./types.js"

export class Tool<
	TInputSchema extends z.ZodType = z.ZodType,
	TOutput = unknown,
> implements ToolAction<z.infer<TInputSchema>, TOutput> {
	readonly id: string
	readonly description: string
	readonly inputSchema?: TInputSchema
	readonly outputSchema?: z.ZodType
	private _execute: (
		input: z.infer<TInputSchema>,
		context?: ToolExecutionContext,
	) => Promise<TOutput> | TOutput;
	[key: string]: unknown

	constructor(config: ToolConfig<TInputSchema, TOutput>) {
		const { execute, ...rest } = config
		this.id = config.id
		this.description = config.description
		this.inputSchema = config.inputSchema
		this.outputSchema = config.outputSchema
		this._execute = execute
		Object.assign(this, rest)
	}

	async execute(
		inputData: unknown,
		context?: ToolExecutionContext,
	): Promise<TOutput> {
		let validatedInput = inputData
		if (this.inputSchema && typeof this.inputSchema.parse === "function") {
			validatedInput = this.inputSchema.parse(inputData)
		}
		return this._execute(validatedInput as z.infer<TInputSchema>, context)
	}
}

export function createTool<
	TInputSchema extends z.ZodType = z.ZodType,
	TOutput = unknown,
>(config: ToolConfig<TInputSchema, TOutput>): Tool<TInputSchema, TOutput> {
	return new Tool(config)
}
