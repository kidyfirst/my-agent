import type { z } from "zod"
import type { ToolConfig, ToolExecutionContext } from "./types.js"

export class Tool<
	TInputSchema extends z.ZodType<any> = z.ZodType<any>,
	TOutput = any,
> {
	readonly id: string
	readonly description: string
	readonly inputSchema?: TInputSchema
	readonly outputSchema?: z.ZodType<any>
	private _execute: (
		input: z.infer<TInputSchema>,
		context?: ToolExecutionContext,
	) => Promise<TOutput> | TOutput;
	[key: string]: any

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
		inputData: any,
		context?: ToolExecutionContext,
	): Promise<TOutput> {
		let validatedInput = inputData
		if (this.inputSchema && typeof this.inputSchema.parse === "function") {
			validatedInput = this.inputSchema.parse(inputData)
		}
		return this._execute(validatedInput, context)
	}
}

export function createTool<
	TInputSchema extends z.ZodType<any> = z.ZodType<any>,
	TOutput = any,
>(config: ToolConfig<TInputSchema, TOutput>): Tool<TInputSchema, TOutput> {
	return new Tool(config)
}
