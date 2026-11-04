/**
 * Worker-side execution engine for Subagent tasks.
 *
 * Runs inside a Worker thread or child process, executing the ReAct / Agent stream loop
 * on an isolated thread, completely freeing the Main process Event Loop from CPU-heavy
 * search/AST/token processing.
 */
import { Agent } from "../core/agent/index.js"
import { getSubagentDefinition } from "../agents/index.js"
import { createViewTool } from "../tools/file-view.js"
import { createGrepTool } from "../tools/grep.js"
import { createGlobTool } from "../tools/glob.js"
import { createWriteFileTool } from "../tools/write.js"
import { stringReplaceLspTool } from "../tools/string-replace-lsp.js"
import { astSmartEditTool } from "../tools/ast-smart-edit.js"
import { createTool } from "../core/tools/tool.js"
import { z } from "zod/v3"
import type {
	WorkerInitPayload,
	HostToWorkerMessage,
	WorkerToHostMessage,
	HostToolResultPayload,
} from "./protocol.js"

export interface WorkerChannel {
	postMessage: (msg: WorkerToHostMessage) => void
	onMessage: (handler: (msg: HostToWorkerMessage) => void) => void
}

/**
 * Builds metadata tag appended to subagent results.
 */
export function buildSubagentMeta(
	modelId: string,
	durationMs: number,
	toolCalls: Array<{ name: string; isError?: boolean }>,
): string {
	const tools = toolCalls
		.map((tc) => `${tc.name}:${tc.isError ? "err" : "ok"}`)
		.join(",")
	return `\n<subagent-meta modelId="${modelId}" durationMs="${durationMs}" tools="${tools}" />`
}

export class SubagentWorkerExecutor {
	private channel: WorkerChannel
	private abortController: AbortController = new AbortController()
	private pendingRpcCalls = new Map<
		string,
		{ resolve: (val: any) => void; reject: (err: any) => void }
	>()
	private resolveModel?: (modelId: string) => any

	constructor(channel: WorkerChannel, resolveModel?: (modelId: string) => any) {
		this.channel = channel
		this.resolveModel = resolveModel

		this.channel.onMessage((msg) => {
			this.handleHostMessage(msg)
		})
	}

	private handleHostMessage(msg: HostToWorkerMessage) {
		switch (msg.type) {
			case "INIT":
				this.runTask(msg.payload).catch((err) => {
					this.channel.postMessage({
						type: "ERROR",
						payload: {
							toolCallId: msg.payload.toolCallId,
							error: err instanceof Error ? err.message : String(err),
						},
					})
				})
				break

			case "ABORT":
				if (msg.payload.toolCallId) {
					this.abortController.abort(
						new Error(msg.payload.reason || "Aborted by user"),
					)
				}
				break

			case "TOOL_RESULT": {
				const pending = this.pendingRpcCalls.get(msg.payload.callId)
				if (pending) {
					if (msg.payload.isError) {
						pending.reject(new Error(msg.payload.error || "Tool RPC error"))
					} else {
						pending.resolve(msg.payload.result)
					}
					this.pendingRpcCalls.delete(msg.payload.callId)
				}
				break
			}
		}
	}

	private async invokeHostTool(
		toolName: string,
		args: Record<string, unknown>,
	): Promise<any> {
		const callId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
		return new Promise((resolve, reject) => {
			this.pendingRpcCalls.set(callId, { resolve, reject })
			this.channel.postMessage({
				type: "TOOL_INVOKE",
				payload: {
					callId,
					toolName,
					args,
				},
			})
		})
	}

	private buildLocalTools(
		projectRoot: string,
		allowedTools: string[],
	): Record<string, any> {
		const root = projectRoot || process.cwd()
		const available: Record<string, () => any> = {
			view: () => createViewTool(root),
			search_content: () => createGrepTool(root),
			find_files: () => createGlobTool(root),
			write_file: () => createWriteFileTool(root),
			string_replace_lsp: () => stringReplaceLspTool,
			ast_smart_edit: () => astSmartEditTool,
		}

		const result: Record<string, any> = {}
		for (const name of allowedTools) {
			if (available[name]) {
				// Native execution directly inside this worker thread!
				result[name] = available[name]()
			} else {
				// Proxy unknown / host-bound tools back to the main process via RPC
				result[name] = createTool({
					id: name,
					description: `Proxy tool for ${name}`,
					inputSchema: z.record(z.any()),
					execute: async (args: Record<string, unknown>) => {
						return await this.invokeHostTool(name, args)
					},
				})
			}
		}

		return result
	}

	async runTask(payload: WorkerInitPayload): Promise<void> {
		const {
			toolCallId,
			agentType,
			task,
			modelId,
			projectRoot = process.cwd(),
			allowedTools,
		} = payload

		const definition = getSubagentDefinition(agentType)
		if (!definition) {
			throw new Error(`Unknown subagent type: ${agentType}`)
		}

		const startTime = Date.now()
		const tools = this.buildLocalTools(projectRoot, allowedTools)
		// Model resolution: prefer the config the host already resolved and sent
		// over the wire. Falling back to a bare `{ id: modelId }` produces an
		// object the agent accepts but cannot stream with, which only shows up
		// as a runtime failure deep inside the model call.
		let model: any
		if (payload.model) {
			model = payload.model
		} else if (this.resolveModel) {
			model = this.resolveModel(modelId)
		} else {
			model = { id: modelId }
		}

		const subagent = new Agent({
			id: `subagent-${definition.id}`,
			name: `${definition.name} Subagent`,
			instructions: definition.instructions,
			model,
			tools,
		})

		// Notify host that subagent has started
		this.channel.postMessage({
			type: "EVENT",
			payload: {
				toolCallId,
				event: {
					type: "subagent_start",
					toolCallId,
					agentType,
					task,
					modelId,
				},
			},
		})

		let partialText = ""
		const toolCallLog: Array<{ name: string; isError?: boolean }> = []

		try {
			const response = await subagent.stream(task, {
				maxSteps: 50,
				abortSignal: this.abortController.signal,
			})

			const reader = response.fullStream.getReader()

			while (true) {
				const { done, value: chunk } = await reader.read()
				if (done) break

				switch (chunk.type) {
					case "text-delta": {
						const text = chunk.payload.text
						partialText += text
						this.channel.postMessage({
							type: "EVENT",
							payload: {
								toolCallId,
								event: {
									type: "subagent_text_delta",
									toolCallId,
									agentType,
									textDelta: text,
								},
							},
						})
						break
					}

					case "tool-call": {
						const toolName = chunk.payload.toolName
						toolCallLog.push({ name: toolName })
						this.channel.postMessage({
							type: "EVENT",
							payload: {
								toolCallId,
								event: {
									type: "subagent_tool_start",
									toolCallId,
									agentType,
									subToolName: toolName,
									subToolArgs: chunk.payload.args,
								},
							},
						})
						break
					}

					case "tool-result": {
						const isErr = chunk.payload.isError ?? false
						for (let i = toolCallLog.length - 1; i >= 0; i--) {
							if (
								toolCallLog[i].name === chunk.payload.toolName &&
								toolCallLog[i].isError === undefined
							) {
								toolCallLog[i].isError = isErr
								break
							}
						}

						this.channel.postMessage({
							type: "EVENT",
							payload: {
								toolCallId,
								event: {
									type: "subagent_tool_end",
									toolCallId,
									agentType,
									subToolName: chunk.payload.toolName,
									subToolResult: chunk.payload.result,
									isError: isErr,
								},
							},
						})
						break
					}
				}
			}

			// Handle abort
			if (this.abortController.signal.aborted) {
				const durationMs = Date.now() - startTime
				const abortResult = partialText
					? `[Aborted by user]\n\nPartial output:\n${partialText}`
					: "[Aborted by user]"

				this.channel.postMessage({
					type: "EVENT",
					payload: {
						toolCallId,
						event: {
							type: "subagent_end",
							toolCallId,
							agentType,
							result: abortResult,
							isError: false,
							durationMs,
						},
					},
				})

				const meta = buildSubagentMeta(modelId, durationMs, toolCallLog)
				this.channel.postMessage({
					type: "DONE",
					payload: {
						toolCallId,
						agentType,
						resultText: abortResult,
						toolCallLog,
						durationMs,
						meta,
						isError: false,
					},
				})
				return
			}

			const fullOutput = await response.getFullOutput()
			const resultText = fullOutput.text || partialText
			const durationMs = Date.now() - startTime

			this.channel.postMessage({
				type: "EVENT",
				payload: {
					toolCallId,
					event: {
						type: "subagent_end",
						toolCallId,
						agentType,
						result: resultText,
						isError: false,
						durationMs,
					},
				},
			})

			const meta = buildSubagentMeta(modelId, durationMs, toolCallLog)
			this.channel.postMessage({
				type: "DONE",
				payload: {
					toolCallId,
					agentType,
					resultText,
					toolCallLog,
					durationMs,
					meta,
					isError: false,
				},
			})
		} catch (err) {
			const isAbort =
				this.abortController.signal.aborted ||
				(err instanceof Error &&
					(err.name === "AbortError" ||
						err.message?.includes("abort") ||
						err.message?.includes("cancel")))

			const durationMs = Date.now() - startTime

			if (isAbort) {
				const abortResult = partialText
					? `[Aborted by user]\n\nPartial output:\n${partialText}`
					: "[Aborted by user]"

				this.channel.postMessage({
					type: "EVENT",
					payload: {
						toolCallId,
						event: {
							type: "subagent_end",
							toolCallId,
							agentType,
							result: abortResult,
							isError: false,
							durationMs,
						},
					},
				})

				const meta = buildSubagentMeta(modelId, durationMs, toolCallLog)
				this.channel.postMessage({
					type: "DONE",
					payload: {
						toolCallId,
						agentType,
						resultText: abortResult,
						toolCallLog,
						durationMs,
						meta,
						isError: false,
					},
				})
				return
			}

			const message = err instanceof Error ? err.message : String(err)
			this.channel.postMessage({
				type: "EVENT",
				payload: {
					toolCallId,
					event: {
						type: "subagent_end",
						toolCallId,
						agentType,
						result: message,
						isError: true,
						durationMs,
					},
				},
			})

			const meta = buildSubagentMeta(modelId, durationMs, toolCallLog)
			this.channel.postMessage({
				type: "DONE",
				payload: {
					toolCallId,
					agentType,
					resultText: `Subagent "${definition.name}" failed: ${message}`,
					toolCallLog,
					durationMs,
					meta,
					isError: true,
				},
			})
		}
	}
}
