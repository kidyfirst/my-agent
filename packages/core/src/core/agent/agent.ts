import { randomUUID } from "node:crypto"
import {
	stepCountIs,
	streamText,
	type FinishReason,
	type LanguageModel,
	type LanguageModelUsage,
	type StepResult,
	type TextStreamPart,
	type ToolSet,
} from "ai"
import type { RequestContext } from "../context/index.js"
import { toModelTool } from "../tools/ai-tool.js"
import { sortToolsByName } from "../llm/prompt-cache.js"
import { createEffectiveModel } from "../graph/llm-stream.js"
import type { ToolAction, ToolExecutionContext } from "../tools/index.js"
import type { MyAgentMemory } from "../memory/base.js"

export type AgentInstructions =
	| string
	| ((args: { requestContext: RequestContext }) => string | Promise<string>)
	| ((args?: { requestContext?: RequestContext }) => string | Promise<string>)

export interface AgentModelObject {
	modelId?: string
	id?: string
	[key: string]: unknown
}

export type AgentModel =
	| LanguageModel
	| AgentModelObject
	| ((args: {
			requestContext: RequestContext
	  }) =>
			| LanguageModel
			| AgentModelObject
			| Promise<LanguageModel | AgentModelObject>)
	| ((args?: {
			requestContext?: RequestContext
	  }) =>
			| LanguageModel
			| AgentModelObject
			| Promise<LanguageModel | AgentModelObject>)

export type AgentTool = ToolAction

export type AgentTools =
	| Record<string, AgentTool>
	| ((args: {
			requestContext: RequestContext
	  }) => Record<string, AgentTool> | Promise<Record<string, AgentTool>>)
	| ((args?: {
			requestContext?: RequestContext
	  }) => Record<string, AgentTool> | Promise<Record<string, AgentTool>>)

export type AgentMemory = MyAgentMemory

export interface AgentConfig {
	id?: string
	name?: string
	description?: string
	instructions?: AgentInstructions
	model?: AgentModel
	tools?: AgentTools
	memory?: AgentMemory
	[key: string]: unknown
}

export interface AgentStreamOptions {
	maxSteps?: number
	abortSignal?: AbortSignal
	requestContext?: RequestContext
	onStepFinish?: (step: StepResult<ToolSet>) => void | Promise<void>
	[key: string]: unknown
}

export interface AgentTextDeltaChunk {
	type: "text-delta"
	payload: { text: string }
	textDelta: string
	[key: string]: unknown
}

export interface AgentToolCallChunk {
	type: "tool-call"
	payload: {
		toolCallId?: string
		toolName: string
		args: unknown
	}
	toolCallId?: string
	toolName: string
	args: unknown
	[key: string]: unknown
}

export interface AgentToolResultChunk {
	type: "tool-result"
	payload: {
		toolCallId?: string
		toolName: string
		result: unknown
		isError: boolean
	}
	toolCallId?: string
	toolName: string
	result: unknown
	isError: boolean
	[key: string]: unknown
}

export interface AgentFinishChunk {
	type: "finish"
	usage?: LanguageModelUsage
	finishReason?: FinishReason
	[key: string]: unknown
}

export interface AgentOtherChunk {
	type:
		| "text-start"
		| "text-end"
		| "tool-call-start"
		| "tool-call-delta"
		| "tool-result-start"
		| "start"
		| "step-start"
		| "step-finish"
		| "error"
		| "abort"
		| "reasoning-start"
		| "reasoning-delta"
		| "reasoning-end"
		| "raw"
		| "response-metadata"
	payload?: unknown
	[key: string]: unknown
}

export type AgentStreamChunk =
	| AgentTextDeltaChunk
	| AgentToolCallChunk
	| AgentToolResultChunk
	| AgentFinishChunk
	| AgentOtherChunk

export interface AgentFullOutput {
	text: string
	usage: LanguageModelUsage | null
	finishReason: FinishReason | null
}

export interface AgentStreamResult {
	fullStream: ReadableStream<AgentStreamChunk>
	textStream: ReadableStream<string>
	readonly text: PromiseLike<string>
	getFullOutput(): Promise<AgentFullOutput>
}

export type AgentTaskOrPrompt =
	| string
	| { content?: unknown; [key: string]: unknown }

export class Agent {
	id: string
	name: string
	description?: string
	instructions?: AgentInstructions
	model?: AgentModel
	tools?: AgentTools
	memory?: AgentMemory

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
			const fn = this.instructions as (
				args:
					| { requestContext?: RequestContext }
					| { requestContext: RequestContext },
			) => string | Promise<string>
			const callArgs = args?.requestContext
				? { requestContext: args.requestContext }
				: (args as { requestContext: RequestContext })
			return (await fn(callArgs)) || ""
		}
		return typeof this.instructions === "string" ? this.instructions : ""
	}

	async getModel(args?: {
		requestContext?: RequestContext
	}): Promise<LanguageModel | AgentModelObject | undefined> {
		if (typeof this.model === "function") {
			const fn = this.model as (
				args:
					| { requestContext?: RequestContext }
					| { requestContext: RequestContext },
			) =>
				| LanguageModel
				| AgentModelObject
				| Promise<LanguageModel | AgentModelObject>
			const callArgs = args?.requestContext
				? { requestContext: args.requestContext }
				: (args as { requestContext: RequestContext })
			return await fn(callArgs)
		}
		return this.model
	}

	async listTools(args?: {
		requestContext?: RequestContext
	}): Promise<Record<string, AgentTool>> {
		if (typeof this.tools === "function") {
			const fn = this.tools as (
				args:
					| { requestContext?: RequestContext }
					| { requestContext: RequestContext },
			) => Record<string, AgentTool> | Promise<Record<string, AgentTool>>
			const callArgs = args?.requestContext
				? { requestContext: args.requestContext }
				: (args as { requestContext: RequestContext })
			return (await fn(callArgs)) || {}
		}
		return (this.tools as Record<string, AgentTool>) || {}
	}

	async stream(
		taskOrPrompt: AgentTaskOrPrompt,
		options?: AgentStreamOptions,
	): Promise<AgentStreamResult> {
		const requestContext = options?.requestContext
		const instructions = await this.getInstructions({ requestContext })
		const model = await this.getModel({ requestContext })
		const rawTools = await this.listTools({ requestContext })

		const tools: ToolSet = {}
		const sortedRawTools = sortToolsByName(rawTools || {})
		for (const [name, tool] of Object.entries(sortedRawTools)) {
			if (!tool || typeof tool !== "object") continue
			const candidate = tool as AgentTool
			tools[name] =
				typeof candidate.execute === "function"
					? toModelTool(tool, (args: unknown, execContext?: unknown) =>
							candidate.execute!(args, execContext as ToolExecutionContext),
						)
					: toModelTool(tool, (args: unknown) =>
							typeof candidate.execute === "function"
								? candidate.execute(
										typeof args === "object" && args !== null
											? { context: args, ...args }
											: { context: args },
									)
								: undefined,
						)
		}

		const prompt =
			typeof taskOrPrompt === "string"
				? taskOrPrompt
				: taskOrPrompt &&
					  typeof taskOrPrompt === "object" &&
					  "content" in taskOrPrompt &&
					  (taskOrPrompt as { content: unknown }).content != null
					? String((taskOrPrompt as { content: unknown }).content)
					: JSON.stringify(taskOrPrompt)

		const modelObj = model as AgentModelObject | undefined
		const modelIdStr =
			typeof modelObj?.modelId === "string"
				? modelObj.modelId
				: typeof modelObj?.id === "string"
					? modelObj.id
					: ""

		const effectiveModel = createEffectiveModel(
			model as LanguageModel,
			modelIdStr,
		)
		const sortedTools = sortToolsByName(tools)
		const result = streamText({
			model: effectiveModel,
			system: instructions,
			prompt,
			tools:
				sortedTools && Object.keys(sortedTools).length > 0
					? sortedTools
					: undefined,
			// `maxSteps` no longer exists in the AI SDK; `stopWhen` is the replacement.
			stopWhen: stepCountIs(options?.maxSteps ?? 50),
			abortSignal: options?.abortSignal,
			onStepFinish: options?.onStepFinish,
		})

		let fullText = ""
		let fullUsage: LanguageModelUsage | null = null
		let fullFinishReason: FinishReason | null = null

		const transformStream = new TransformStream<
			TextStreamPart<ToolSet>,
			AgentStreamChunk
		>({
			transform(chunk, controller) {
				if (chunk.type === "text-delta") {
					const delta =
						"textDelta" in chunk &&
						typeof (chunk as { textDelta?: string }).textDelta === "string"
							? (chunk as { textDelta: string }).textDelta
							: "payload" in chunk &&
								  typeof (chunk as { payload?: { text?: string } }).payload
										?.text === "string"
								? (chunk as { payload: { text: string } }).payload.text
								: "text" in chunk &&
									  typeof (chunk as { text?: string }).text === "string"
									? (chunk as { text: string }).text
									: ""
					fullText += delta
					controller.enqueue({
						type: "text-delta",
						payload: { text: delta },
						textDelta: delta,
					})
				} else if (chunk.type === "tool-call") {
					const toolChunk = chunk as {
						toolCallId?: string
						toolName: string
						args?: unknown
						input?: unknown
					}
					const toolArgs = toolChunk.args ?? toolChunk.input
					controller.enqueue({
						type: "tool-call",
						payload: {
							toolCallId: toolChunk.toolCallId,
							toolName: toolChunk.toolName,
							args: toolArgs,
						},
						toolCallId: toolChunk.toolCallId,
						toolName: toolChunk.toolName,
						args: toolArgs,
					})
				} else if (chunk.type === "tool-result") {
					const resultChunk = chunk as {
						toolCallId?: string
						toolName: string
						result?: unknown
						output?: unknown
						isError?: boolean
					}
					const toolResult = resultChunk.result ?? resultChunk.output
					const isError = Boolean(resultChunk.isError)
					controller.enqueue({
						type: "tool-result",
						payload: {
							toolCallId: resultChunk.toolCallId,
							toolName: resultChunk.toolName,
							result: toolResult,
							isError,
						},
						toolCallId: resultChunk.toolCallId,
						toolName: resultChunk.toolName,
						result: toolResult,
						isError,
					})
				} else if (chunk.type === "finish") {
					fullUsage =
						("totalUsage" in chunk &&
							(chunk as { totalUsage?: LanguageModelUsage }).totalUsage) ||
						("usage" in chunk &&
							(chunk as { usage?: LanguageModelUsage }).usage) ||
						null
					fullFinishReason = chunk.finishReason
					controller.enqueue(chunk as unknown as AgentStreamChunk)
				} else {
					controller.enqueue(chunk as unknown as AgentStreamChunk)
				}
			},
		})

		const fullStream = result.fullStream.pipeThrough(transformStream)

		return {
			fullStream,
			textStream: result.textStream,
			get text(): PromiseLike<string> {
				return result.text
			},
			async getFullOutput(): Promise<AgentFullOutput> {
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
