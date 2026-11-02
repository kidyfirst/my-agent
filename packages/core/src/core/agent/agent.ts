import { randomUUID } from "node:crypto"
import { stepCountIs, streamText } from "ai"
import type { RequestContext } from "../context/index.js"
import { toModelTool } from "../tools/ai-tool.js"

export interface AgentConfig {
	id?: string
	name?: string
	description?: string
	instructions?: any
	model?: any
	tools?: any
	memory?: any
	[key: string]: unknown
}

export interface AgentStreamOptions {
	maxSteps?: number
	abortSignal?: AbortSignal
	requestContext?: RequestContext
	onStepFinish?: (step: any) => void | Promise<void>
	[key: string]: unknown
}

export class Agent {
	id: string
	name: string
	description?: string
	instructions?: any
	model?: any
	tools?: any
	memory?: any

	constructor(config: AgentConfig) {
		this.id = config.id || randomUUID()
		this.name = config.name || "Agent"
		this.description = config.description
		this.instructions = config.instructions
		this.model = config.model
		this.tools = config.tools
		this.memory = config.memory
	}

	async getInstructions(args?: {
		requestContext?: RequestContext
	}): Promise<string> {
		if (typeof this.instructions === "function") {
			return (await this.instructions(args || {})) || ""
		}
		return (this.instructions as string) || ""
	}

	async getModel(args?: { requestContext?: RequestContext }): Promise<any> {
		if (typeof this.model === "function") {
			return await this.model(args || {})
		}
		return this.model
	}

	async listTools(args?: {
		requestContext?: RequestContext
	}): Promise<Record<string, any>> {
		if (typeof this.tools === "function") {
			return (await this.tools(args || {})) || {}
		}
		return (this.tools as Record<string, any>) || {}
	}

	async stream(
		taskOrPrompt: string | any,
		options?: AgentStreamOptions,
	): Promise<any> {
		const requestContext = options?.requestContext
		const instructions = await this.getInstructions({ requestContext })
		const model = await this.getModel({ requestContext })
		const rawTools = await this.listTools({ requestContext })

		const tools: Record<string, any> = {}
		for (const [name, tool] of Object.entries(rawTools || {})) {
			if (!tool) continue
			tools[name] =
				typeof (tool as any).execute === "function"
					? toModelTool(tool, (args: any, execContext?: any) =>
							(tool as any).execute(args, execContext),
						)
					: toModelTool(tool, (args: any) =>
							(tool as any).execute?.({ context: args, ...args }),
						)
		}

		const prompt =
			typeof taskOrPrompt === "string"
				? taskOrPrompt
				: (taskOrPrompt as any)?.content || JSON.stringify(taskOrPrompt)

		const result = (streamText as any)({
			model,
			system: instructions,
			prompt,
			tools: Object.keys(tools).length > 0 ? tools : undefined,
			// `maxSteps` no longer exists in the AI SDK; `stopWhen` is the replacement.
			stopWhen: stepCountIs(options?.maxSteps ?? 50),
			abortSignal: options?.abortSignal,
		})

		let fullText = ""
		let fullUsage: any = null
		let fullFinishReason: any = null

		const transformStream = new TransformStream({
			transform(chunk: any, controller) {
				if (chunk.type === "text-delta") {
					const delta =
						chunk.textDelta || chunk.payload?.text || chunk.text || ""
					fullText += delta
					controller.enqueue({
						type: "text-delta",
						payload: { text: delta },
						textDelta: delta,
					})
				} else if (chunk.type === "tool-call") {
					controller.enqueue({
						type: "tool-call",
						payload: {
							toolCallId: chunk.toolCallId,
							toolName: chunk.toolName,
							args: chunk.args,
						},
						toolCallId: chunk.toolCallId,
						toolName: chunk.toolName,
						args: chunk.args,
					})
				} else if (chunk.type === "tool-result") {
					controller.enqueue({
						type: "tool-result",
						payload: {
							toolCallId: chunk.toolCallId,
							toolName: chunk.toolName,
							result: chunk.result,
							isError: chunk.isError,
						},
						toolCallId: chunk.toolCallId,
						toolName: chunk.toolName,
						result: chunk.result,
						isError: chunk.isError,
					})
				} else if (chunk.type === "finish") {
					fullUsage = chunk.usage
					fullFinishReason = chunk.finishReason
					controller.enqueue(chunk)
				} else {
					controller.enqueue(chunk)
				}
			},
		})

		const fullStream = result.fullStream.pipeThrough(transformStream)

		return {
			fullStream,
			textStream: result.textStream,
			get text() {
				return result.text
			},
			async getFullOutput() {
				const text = await result.text
				return {
					text: text || fullText,
					usage: fullUsage || (await result.usage),
					finishReason: fullFinishReason || (await result.finishReason),
				}
			},
		}
	}
}
