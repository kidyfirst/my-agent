import { useEffect, useRef, useMemo } from "react"
import { AssistantMessage } from "./AssistantMessage"
import { UserMessage } from "./UserMessage"
import { ExecutionBlock, ExecutionStep, ExecutionTool } from "./ExecutionBlock"
import { SubagentExecution } from "./SubagentExecution"
import { TodoProgress } from "./TodoProgress"
import { AsciiLogo } from "./AsciiLogo"
import type { Message, MessageContent } from "../types/ipc"
import { normalizeMessageContent } from "../utils/messageParser"
import { isUserMessage, getMessageText } from "../types/chat"

export interface ChatViewProps {
	messages: Message[]
	tools: Map<
		string,
		{
			id: string
			name: string
			args: unknown
			result?: unknown
			isError?: boolean
			status: "pending" | "running" | "complete" | "error"
			shellOutput?: string
		}
	>
	subagents: Map<
		string,
		{
			toolCallId: string
			agentType: string
			task: string
			modelId?: string
			tools: Array<{
				name: string
				args: unknown
				result?: unknown
				isError?: boolean
				status: "running" | "complete"
			}>
			result?: string
			isError?: boolean
			durationMs?: number
			status: "running" | "complete"
		}
	>
	isAgentActive: boolean
	agentStartedAt: number | null
	streamingMessageId: string | null
	todos: Array<{
		content: string
		status: "pending" | "in_progress" | "completed"
		activeForm: string
	}>
	onOpenDiff?: (path: string) => void
}

type RenderItem =
	| { type: "user"; key: string; data: Message }
	| {
			type: "execution"
			key: string
			data: {
				isActive?: boolean
				steps: ExecutionStep[]
				durationMs?: number
				startedAt?: number | null
				changedFiles?: Message["changedFiles"]
				messageId?: string
				isStreaming?: boolean
			}
	  }
	| {
			type: "assistant"
			key: string
			data: Message & { isStreaming: boolean }
	  }
	| {
			type: "subagent"
			key: string
			data: {
				toolCallId: string
				agentType: string
				task: string
				tools: Array<{
					name: string
					args: unknown
					result?: unknown
					isError?: boolean
					status: string
				}>
				result?: string
				isError?: boolean
				durationMs?: number
				status: string
			}
	  }
	| {
			type: "system"
			key: string
			data: Message
	  }

export function ChatView({
	messages,
	tools,
	subagents,
	isAgentActive,
	agentStartedAt,
	streamingMessageId,
	todos,
	onOpenDiff,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAutoScroll = useRef(true)

	// Auto-scroll on new messages or tool updates
	useEffect(() => {
		if (isAutoScroll.current && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
			requestAnimationFrame(() => {
				if (isAutoScroll.current && scrollRef.current) {
					scrollRef.current.scrollTop = scrollRef.current.scrollHeight
				}
			})
		}
	}, [messages.length, messages, tools, subagents, isAgentActive])

	const handleScroll = () => {
		if (!scrollRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
		isAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100
	}

	// Build a structured list of renderable items in Antigravity style:
	// - An Assistant turn groups thinking and tool executions into an ExecutionBlock
	//   showing: "Thinking ˅", each thinking step with its duration ("Thought for 57s ›"),
	//   and tool items with checkmarks ("Analyzed ⚛️ ChatView.tsx#L140-250").
	// - The assistant's markdown answer appears below the execution block.
	const cleanedItems = useMemo(() => {
		const items: RenderItem[] = []

	for (const msg of messages) {
		const isUser = isUserMessage(msg)
		const isSystem =
			msg.role === "system" ||
			((msg.role as string) === "signal" && (msg as any).type === "system")

		if (isUser) {
			const lastItem = items[items.length - 1]
			if (lastItem && lastItem.type === "user") {
				const lastText = getMessageText(lastItem.data)
				const currentText = getMessageText(msg)
				if (lastText && currentText && lastText === currentText) {
					// Guard against duplicate consecutive user bubble
					continue
				}
			}
			items.push({ type: "user", key: `msg-${msg.id}`, data: msg })
		} else if (isSystem) {
			items.push({ type: "system", key: `msg-${msg.id}`, data: msg })
		} else if (msg.role === "assistant") {
			const isStreaming = msg.id === streamingMessageId
			const contentBlocks = normalizeMessageContent(
				msg.content,
				(msg as any).text,
			)

			// Pre-index any tool_result blocks in this message
			const toolResultsById = new Map<
				string,
				{ result: unknown; isError?: boolean }
			>()
			for (const c of contentBlocks) {
				if (!c || typeof c !== "object") continue
				const b = c as Record<string, unknown>
				const t = String(b.type || "")
					.toLowerCase()
					.replace(/[-_]/g, "")
				if (t === "toolresult") {
					const id = (b.toolCallId || b.id || b.tool_call_id || "") as string
					if (id) {
						toolResultsById.set(id, {
							result: b.result ?? b.output ?? b.content,
							isError: Boolean(b.isError),
						})
					}
				}
			}

			let currentSteps: ExecutionStep[] = []
			let currentTextBlocks: MessageContent[] = []
			let execGroupIndex = 0
			let textGroupIndex = 0
			let thinkCounter = 0

			const flushExecution = (showChangedFiles = false) => {
				if (currentSteps.length > 0) {
					const lastItem = items[items.length - 1]
					if (lastItem && lastItem.type === "execution") {
						const existingIds = new Set(lastItem.data.steps.map((s) => s.id))
						for (const s of currentSteps) {
							if (!existingIds.has(s.id)) {
								lastItem.data.steps.push(s)
							}
						}
						if (msg.durationMs != null) {
							lastItem.data.durationMs = msg.durationMs
						}
						lastItem.data.isActive = isStreaming && isAgentActive
						if (showChangedFiles) {
							lastItem.data.changedFiles = msg.changedFiles
						}
						currentSteps = []
						return
					}

					items.push({
						type: "execution",
						key: `msg-${msg.id}-exec-${execGroupIndex++}`,
						data: {
							isActive: isStreaming && isAgentActive,
							steps: [...currentSteps],
							durationMs: msg.durationMs,
							startedAt: isStreaming ? agentStartedAt : null,
							changedFiles: showChangedFiles ? msg.changedFiles : undefined,
						},
					})
					currentSteps = []
				}
			}

			const flushText = (isTrailing: boolean) => {
				const hasContent = currentTextBlocks.some((c) => {
					const block = c as unknown as Record<string, unknown>
					const text = (block.text ?? "") as string
					return typeof text === "string" && text.length > 0
				})
				const isError = msg.stopReason === "error" || Boolean(msg.errorMessage)
				const shouldEmit = hasContent || (isTrailing && isError)

				if (shouldEmit) {
					items.push({
						type: "assistant",
						key: `msg-${msg.id}-text-${textGroupIndex++}`,
						data: {
							...msg,
							content:
								currentTextBlocks.length > 0
									? currentTextBlocks
									: [{ type: "text", text: msg.errorMessage ?? "" }],
							isStreaming: isStreaming && isTrailing,
						},
					})
				}
				currentTextBlocks = []
			}

			for (const c of contentBlocks) {
				const block = (c as unknown as Record<string, unknown>) || {}
				const rawType = String(block.type || "")
					.toLowerCase()
					.replace(/[-_]/g, "")

				if (
					rawType === "text" ||
					rawType === "output" ||
					rawType === "message" ||
					(!rawType &&
						(block.text != null ||
							block.content != null ||
							block.value != null))
				) {
					const textVal = String(
						block.text ?? block.content ?? block.value ?? "",
					)
					// Only non-empty text triggers execution flush; empty stream tokens are ignored
					if (textVal.trim().length > 0) {
						flushExecution()
						currentTextBlocks.push({
							type: "text",
							text: textVal,
						})
					}
				} else if (
					rawType === "thinking" ||
					rawType === "reasoning" ||
					rawType === "thought" ||
					rawType === "redactedthinking"
				) {
					if (currentTextBlocks.length > 0) {
						flushText(false)
					}
					const thoughtStr = String(
						block.thinking ||
							block.reasoning ||
							block.thought ||
							block.text ||
							block.content ||
							"",
					)
					if (thoughtStr) {
						const durationSec =
							(block.durationSec as number) ??
							(msg.durationMs
								? Math.max(1, Math.round(msg.durationMs / 1000))
								: Math.max(2, Math.round(thoughtStr.length / 50)))

						currentSteps.push({
							type: "thinking",
							id: `think-${msg.id}-${thinkCounter++}`,
							text: thoughtStr,
							durationSec,
							isStreaming: isStreaming && isAgentActive,
							startedAt: isStreaming ? agentStartedAt : null,
						})
					}
				} else if (
					rawType === "toolcall" ||
					rawType === "tooluse" ||
					rawType === "toolinvocation"
				) {
					if (currentTextBlocks.length > 0) {
						flushText(false)
					}

					const inv = (block.toolInvocation as Record<string, unknown>) || block
					const toolId = (inv.toolCallId ||
						block.id ||
						inv.id ||
						(inv as any).tool_use_id ||
						"") as string
					const toolName = (inv.toolName ||
						block.name ||
						inv.name ||
						"") as string
					const toolArgs =
						inv.args ?? block.args ?? (inv as any).input ?? (block as any).input
					const savedResult = toolResultsById.get(toolId)
					const toolResult = inv.result ?? block.result ?? savedResult?.result
					const isError = Boolean(
						inv.isError ?? block.isError ?? savedResult?.isError,
					)
					const isDone =
						inv.state === "result" ||
						toolResult !== undefined ||
						savedResult !== undefined

					const toolState = tools.get(toolId)
					const subagentState = subagents.get(toolId)

					if (subagentState || toolName === "subagent") {
						flushExecution()
						if (subagentState) {
							items.push({
								type: "subagent",
								key: `subagent-${toolId}`,
								data: subagentState,
							})
						} else {
							const saArgs = (toolArgs as Record<string, unknown>) || {}
							items.push({
								type: "subagent",
								key: `subagent-${toolId}`,
								data: {
									toolCallId: toolId,
									agentType: (saArgs.agentType as string) || "explore",
									task:
										(saArgs.task as string) ||
										(saArgs.description as string) ||
										"",
									tools: [],
									result:
										typeof toolResult === "string"
											? toolResult
											: (toolResult as any)?.content,
									isError,
									status: isDone ? "complete" : "running",
								},
							})
						}
					} else {
						const resolvedTool: ExecutionTool = toolState ?? {
							id: toolId,
							name: toolName,
							args: toolArgs,
							result: toolResult,
							isError,
							status: isDone ? (isError ? "error" : "complete") : "pending",
						}
						currentSteps.push({
							type: "tool",
							id: `tool-${toolId}`,
							tool: resolvedTool,
						})
					}
				}
			}

			// End of message: flush any remaining execution and text
			flushExecution(true)
			flushText(true)

			// Ensure the last assistant block of this message receives changedFiles
			if (msg.changedFiles && msg.changedFiles.length > 0) {
				let foundAssistant = false
				for (let i = items.length - 1; i >= 0; i--) {
					if (items[i].type === "assistant" && (items[i].data as any).id === msg.id) {
						;(items[i].data as any).changedFiles = msg.changedFiles
						foundAssistant = true
						break
					}
				}
				if (!foundAssistant) {
					items.push({
						type: "assistant",
						key: `msg-${msg.id}-files`,
						data: {
							...msg,
							content: [],
							changedFiles: msg.changedFiles,
							isStreaming: false,
						},
					})
				}
			}
		}
	}

	// Append any tools from state that haven't been emitted yet
	const renderedToolIds = new Set<string>()
	for (const item of items) {
		if (item.type === "execution") {
			for (const s of item.data.steps) {
				if (s.type === "tool") {
					renderedToolIds.add(s.tool.id)
				}
			}
		} else if (item.type === "subagent") {
			renderedToolIds.add((item.data as any).toolCallId)
		}
	}

	const unrenderedTools: ExecutionTool[] = []
	for (const [toolId, tool] of tools) {
		if (!renderedToolIds.has(toolId)) {
			unrenderedTools.push(tool)
			renderedToolIds.add(toolId)
		}
	}

	if (unrenderedTools.length > 0) {
		const unrenderedSteps: ExecutionStep[] = unrenderedTools.map((t) => ({
			type: "tool",
			id: `unrendered-${t.id}`,
			tool: t,
		}))
		const lastItem = items[items.length - 1]
		if (lastItem && lastItem.type === "execution") {
			const existingIds = new Set(lastItem.data.steps.map((s) => s.id))
			for (const s of unrenderedSteps) {
				if (!existingIds.has(s.id)) {
					lastItem.data.steps.push(s)
				}
			}
			lastItem.data.isActive = isAgentActive
		} else {
			items.push({
				type: "execution",
				key: "live-execution-block",
				data: {
					isActive: isAgentActive,
					steps: unrenderedSteps,
					startedAt: agentStartedAt,
				},
			})
		}
	}

	for (const [saId, sa] of subagents) {
		if (!renderedToolIds.has(saId)) {
			items.push({
				type: "subagent",
				key: `standalone-sa-${saId}`,
				data: sa,
			})
			renderedToolIds.add(saId)
		}
	}

	// If the agent is active and the last item is from the user, show an active execution block placeholder
	if (
		isAgentActive &&
		(items.length === 0 || items[items.length - 1].type === "user")
	) {
		items.push({
			type: "execution",
			key: "active-execution-placeholder",
			data: {
				isActive: true,
				steps: [],
				startedAt: agentStartedAt,
			},
		})
	}

	// Final cleanup pass: merge any adjacent execution blocks and discard empty ones
	const cleanedItems: RenderItem[] = []
	for (const item of items) {
		const prev = cleanedItems[cleanedItems.length - 1]
		if (item.type === "execution" && prev && prev.type === "execution") {
			const existingIds = new Set(prev.data.steps.map((s) => s.id))
			for (const s of item.data.steps) {
				if (!existingIds.has(s.id)) {
					prev.data.steps.push(s)
				}
			}
			if (item.data.durationMs != null) {
				prev.data.durationMs = item.data.durationMs
			}
			prev.data.isActive = prev.data.isActive || item.data.isActive
			prev.data.startedAt = prev.data.startedAt || item.data.startedAt
		} else if (
			item.type === "execution" &&
			item.data.steps.length === 0 &&
			!item.data.isActive
		) {
			continue
		} else {
			cleanedItems.push(item)
		}
	}
	return cleanedItems
}, [
	messages,
	tools,
	subagents,
	isAgentActive,
	agentStartedAt,
	streamingMessageId,
])

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			style={{
				flex: 1,
				overflowY: "auto",
				overflowX: "hidden",
				padding: "16px 24px",
				minWidth: 0,
			}}
		>
			{cleanedItems.length === 0 && !isAgentActive && <AsciiLogo />}

			{cleanedItems.map((item) => {
				switch (item.type) {
					case "user":
						return <UserMessage key={item.key} message={item.data as Message} />
					case "execution":
						return (
							<div key={item.key}>
								<ExecutionBlock
									isActive={item.data.isActive}
									steps={item.data.steps}
									durationMs={item.data.durationMs}
									startedAt={item.data.startedAt}
								/>
							</div>
						)
					case "assistant": {
						const assistantMsg = item.data as Message & {
							isStreaming: boolean
						}
						return (
							<AssistantMessage
								key={item.key}
								message={assistantMsg}
								onOpenDiff={onOpenDiff}
								isAgentActive={isAgentActive}
							/>
						)
					}
					case "subagent":
						return <SubagentExecution key={item.key} subagent={item.data} />
					case "system": {
						const sysMsg = item.data as Message
						const sysContent = normalizeMessageContent(
							sysMsg.content,
							(sysMsg as any).text,
						)
						const sysText =
							sysContent
								.map((c) =>
									String(
										(c as any).text ??
											(c as any).content ??
											(c as any).value ??
											"",
									),
								)
								.join("") ||
							(typeof sysMsg.content === "string" ? sysMsg.content : "")

						return (
							<div
								key={item.key}
								style={{
									padding: "8px 12px",
									margin: "8px 0",
									background: "var(--system-reminder-bg)",
									border: "1px solid var(--border-muted)",
									borderRadius: 6,
									fontSize: 12,
									color: "var(--muted)",
									lineHeight: 1.5,
								}}
							>
								<div
									style={{
										fontWeight: 600,
										fontSize: 11,
										marginBottom: 2,
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										color: "var(--dim)",
									}}
								>
									System Notice
								</div>
								<div style={{ whiteSpace: "pre-wrap" }}>{sysText}</div>
							</div>
						)
					}
				}
			})}

			{/* Todo progress */}
			{todos.length > 0 && <TodoProgress todos={todos} />}

			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 0.3; }
					50% { opacity: 1; }
				}
				@keyframes blink {
					0%, 100% { opacity: 1; }
					50% { opacity: 0; }
				}
			`}</style>

			{/* Bottom padding */}
			<div style={{ height: 16 }} />
		</div>
	)
}
