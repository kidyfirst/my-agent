import { streamText, wrapLanguageModel, type LanguageModel } from "ai"
import type { ExecutedToolItem } from "./types.js"

export interface StreamLLMOptions {
	model: LanguageModel
	modelIdStr: string
	instructions: string
	messages: any[]
	tools?: Record<string, any>
	stopWhen?: any
	abortSignal: AbortSignal
	assistantMessageId: string
	emit: (event: any) => void
	initialExecutedTools?: ExecutedToolItem[]
	initialAssistantText?: string
	initialReasoningText?: string
	recorder?: any
	turn?: number
	step?: number
}

export interface StreamLLMResult {
	assistantText: string
	reasoningText: string
	executedTools: ExecutedToolItem[]
	tokenUsage: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
	finishReason?: string | null
}

/**
 * Wraps a model to guarantee v3/v4 file and legacy image compatibility across providers,
 * and attaches stream recording middleware if recorder is provided.
 */
export function createEffectiveModel(
	model: LanguageModel,
	modelIdStr: string,
	recorder?: any,
): LanguageModel {
	const legacyImageParts = modelIdStr.includes("deepseek")
	return wrapLanguageModel({
		model: model as any,
		middleware: {
			specificationVersion: "v3",
			transformParams: async ({ params }) => {
				if (Array.isArray(params.prompt)) {
					for (const msg of params.prompt) {
						if (!Array.isArray(msg.content)) continue
						for (const part of msg.content) {
							if (part.type === "file" && typeof part.data === "string") {
								;(part as any).data = { type: "data", data: part.data }
							}
							if (legacyImageParts && (part as any).type === "image") {
								const url = (part as any).image_url
								if (typeof url === "string" && url.startsWith("data:")) {
									const comma = url.indexOf(",")
									const header = url.slice(5, comma)
									;(part as any).image = url.slice(comma + 1)
									;(part as any).mediaType = header.split(";")[0] || "image/png"
									delete (part as any).image_url
								}
							}
						}
					}
				}
				return params
			},
			wrapStream: async ({ doStream }) => {
				const { stream, ...rest } = await doStream()
				if (
					!recorder ||
					typeof recorder.recordChunk !== "function" ||
					!recorder.isRecording?.()
				) {
					return { stream, ...rest }
				}
				return {
					...rest,
					stream: stream.pipeThrough(
						new TransformStream({
							transform(chunk, ctl) {
								try {
									recorder.recordChunk(chunk)
								} catch {}
								ctl.enqueue(chunk)
							},
						}),
					),
				}
			},
		},
	}) as unknown as LanguageModel
}

/**
 * Builds structured message parts from text, reasoning, and executed tools,
 * extracting embedded <think> tags if reasoning was not natively provided.
 */
export function buildMessageParts(
	assistantText: string,
	reasoningText: string,
	executedTools: ExecutedToolItem[],
): {
	parts: any[]
	cleanText: string
	activeThinking: string
	hasThinking: boolean
} {
	const parts: any[] = []
	let finalCleanText = assistantText
	let activeThinking = reasoningText

	if (!activeThinking && assistantText.includes("<think")) {
		const tagRegex = /<(think|thought|reasoning|thinking)>([\s\S]*?)<\/\1>/gi
		const extracted: string[] = []
		const withoutClosed = assistantText.replace(tagRegex, (_m, _t, c) => {
			const trimmed = String(c || "").trim()
			if (trimmed) extracted.push(trimmed)
			return ""
		})
		const unclosedMatch = withoutClosed.match(
			/<(think|thought|reasoning|thinking)>([\s\S]*)$/i,
		)
		if (unclosedMatch) {
			const unclosed = String(unclosedMatch[2] || "").trim()
			if (unclosed) extracted.push(unclosed)
			finalCleanText = withoutClosed.slice(0, unclosedMatch.index).trim()
		} else {
			finalCleanText = withoutClosed.trim()
		}
		if (extracted.length > 0) {
			activeThinking = extracted.join("\n\n")
		}
	}

	// Clean out any raw DSML / tool calling markup leaked into text stream
	if (finalCleanText.includes("<｜") || finalCleanText.includes("<function=")) {
		finalCleanText = finalCleanText
			.replace(/<｜DSML｜tool calls>[\s\S]*?(?:<\/｜DSML｜tool calls>|$)/gi, "")
			.replace(/<｜tool calls｜>[\s\S]*?(?:<\/｜tool calls｜>|$)/gi, "")
			.replace(/<｜DSML｜[\s\S]*?｜>/g, "")
			.replace(/<｜[\s\S]*?｜>/g, "")
			.replace(/<function=\w+>[\s\S]*?(?:<\/function>|$)/gi, "")
			.trim()
	}

	if (activeThinking) {
		parts.push({
			type: "thinking",
			thinking: activeThinking,
			text: activeThinking,
		})
	}
	for (const t of executedTools) {
		parts.push({
			type: "tool-call",
			toolCallId: t.id,
			toolName: t.name,
			args: t.args,
		})
		if (t.result !== undefined) {
			parts.push({
				type: "tool-result",
				toolCallId: t.id,
				toolName: t.name,
				result: t.result,
				isError: t.isError,
			})
		}
	}
	if (finalCleanText) {
		parts.push({
			type: "text",
			text: finalCleanText,
		})
	}
	return {
		parts,
		cleanText: finalCleanText,
		activeThinking,
		hasThinking: Boolean(activeThinking),
	}
}

/**
 * Core helper that executes an AI streamText call, emits UI deltas, and aggregates results.
 */
export async function executeStreamLLM(
	options: StreamLLMOptions,
): Promise<StreamLLMResult> {
	const {
		model,
		modelIdStr,
		instructions,
		messages,
		tools,
		stopWhen,
		abortSignal,
		assistantMessageId,
		emit,
		initialExecutedTools = [],
		initialAssistantText = "",
		initialReasoningText = "",
		recorder,
		turn = 1,
		step = 1,
	} = options

	const effectiveModel = createEffectiveModel(model, modelIdStr, recorder)
	const executedTools = [...initialExecutedTools]
	let assistantText = initialAssistantText
	let reasoningText = initialReasoningText
	let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
	let finishReason: string | null = null

	const streamRes = (streamText as any)({
		model: effectiveModel,
		system: instructions,
		messages,
		tools: tools && Object.keys(tools).length > 0 ? tools : undefined,
		...(stopWhen ? { stopWhen } : {}),
		abortSignal,
	})

	const buildCurrentContent = () =>
		buildMessageParts(assistantText, reasoningText, executedTools)

	for await (const chunk of streamRes.fullStream) {
		if (abortSignal.aborted) break

		if (chunk.type === "error") {
			throw chunk.error instanceof Error
				? chunk.error
				: new Error(String(chunk.error))
		}

		if (chunk.type === "finish") {
			finishReason = (chunk as any).finishReason ?? "stop"
			const usage = (chunk as any).totalUsage ?? (chunk as any).usage
			if (usage) {
				tokenUsage = {
					promptTokens: usage.inputTokens ?? 0,
					completionTokens: usage.outputTokens ?? 0,
					totalTokens: usage.totalTokens ?? 0,
				}
			}
			if (finishReason === "tool-calls") {
				emit({
					type: "agent_step_limit",
					id: assistantMessageId,
					finishReason: "tool-calls",
				})
			}
		}

		if (
			chunk.type === "reasoning-delta" ||
			chunk.type === "reasoning" ||
			(chunk.type as string) === "reasoning-content"
		) {
			const delta =
				(chunk as any).delta ||
				(chunk as any).textDelta ||
				(chunk as any).text ||
				""
			if (delta) {
				reasoningText += delta
				emit({
					type: "message_delta",
					id: assistantMessageId,
					delta: "",
					reasoningDelta: delta,
				})
				const { parts } = buildCurrentContent()
				emit({
					type: "message_update",
					id: assistantMessageId,
					message: {
						id: assistantMessageId,
						role: "assistant",
						content: parts,
					},
				})
			}
		} else if (chunk.type === "tool-call") {
			const toolCallId = (chunk as any).toolCallId
			const existing = executedTools.find((t) => t.id === toolCallId)
			if (!existing) {
				executedTools.push({
					id: toolCallId,
					name: (chunk as any).toolName,
					args: (chunk as any).args,
				})
			}
			const { parts } = buildCurrentContent()
			emit({
				type: "message_update",
				id: assistantMessageId,
				message: {
					id: assistantMessageId,
					role: "assistant",
					content: parts,
				},
			})
		} else if (chunk.type === "tool-result") {
			const toolCallId = (chunk as any).toolCallId
			const existing = executedTools.find((t) => t.id === toolCallId)
			if (existing) {
				existing.result = (chunk as any).result
				existing.isError = (chunk as any).isError
			} else {
				executedTools.push({
					id: toolCallId,
					name: (chunk as any).toolName,
					args: (chunk as any).args,
					result: (chunk as any).result,
					isError: (chunk as any).isError,
				})
			}
			if (
				recorder &&
				typeof recorder.recordToolResult === "function" &&
				recorder.isRecording?.()
			) {
				try {
					recorder.recordToolResult({
						turn,
						step,
						toolCallId: toolCallId || "",
						toolName: (chunk as any).toolName || "",
						input: (chunk as any).args,
						output: (chunk as any).result,
						isError: Boolean((chunk as any).isError),
					})
				} catch {}
			}
			const { parts } = buildCurrentContent()
			emit({
				type: "message_update",
				id: assistantMessageId,
				message: {
					id: assistantMessageId,
					role: "assistant",
					content: parts,
				},
			})
		} else if (chunk.type === "text-delta") {
			const delta = (chunk as any).textDelta || (chunk as any).text || ""
			assistantText += delta
			emit({
				type: "message_delta",
				id: assistantMessageId,
				delta,
			})
			const { parts } = buildCurrentContent()
			emit({
				type: "message_update",
				id: assistantMessageId,
				message: {
					id: assistantMessageId,
					role: "assistant",
					content: parts,
				},
			})
		}
	}

	if (
		recorder &&
		typeof recorder.recordAssistantStream === "function" &&
		recorder.isRecording?.()
	) {
		try {
			recorder.recordAssistantStream({
				turn,
				step,
				finishReason,
			})
		} catch {}
	}

	return {
		assistantText,
		reasoningText,
		executedTools,
		tokenUsage,
		finishReason,
	}
}
