import { useEffect, useRef, useState } from "react"
import { AssistantMessage } from "./AssistantMessage"
import { UserMessage } from "./UserMessage"
import { ToolExecution } from "./ToolExecution"
import { SubagentExecution } from "./SubagentExecution"
import { TodoProgress } from "./TodoProgress"
import { AsciiLogo } from "./AsciiLogo"
import type { Message, MessageContent } from "../types/ipc"
import { normalizeMessageContent } from "../utils/messageParser"

function ElapsedTime({ startedAt }: { startedAt: number }) {
	const [elapsed, setElapsed] = useState(0)

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed((Date.now() - startedAt) / 1000)
		}, 100)
		return () => clearInterval(interval)
	}, [startedAt])

	return (
		<div
			style={{
				padding: "4px 0",
				display: "flex",
				alignItems: "center",
				gap: 6,
				color: "var(--dim)",
				fontSize: 12,
			}}
		>
			<span style={{ letterSpacing: 2, fontSize: 14 }}>{"\u22EE"}</span>
			<span>{elapsed.toFixed(1)}s</span>
		</div>
	)
}

interface ChatViewProps {
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
}

export function ChatView({
	messages,
	tools,
	subagents,
	isAgentActive,
	agentStartedAt,
	streamingMessageId,
	todos,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAutoScroll = useRef(true)

	// Auto-scroll on new messages or tool updates
	useEffect(() => {
		if (isAutoScroll.current && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [messages, tools, subagents, isAgentActive])

	const handleScroll = () => {
		if (!scrollRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
		isAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100
	}

	// Build a flat list of renderable items from messages, preserving the
	// natural interleaved order of text blocks and tool calls within each
	// assistant message. The harness accumulates the entire agentic turn into
	// a single message (text → tool_call → tool_result → text → …), so we
	// walk the content array in order and emit items as we encounter them.
	const items: Array<{
		type: "user" | "assistant" | "tool" | "subagent" | "system"
		key: string
		data: unknown
	}> = []

	for (const msg of messages) {
		const rawContent = msg.content as unknown
		const isUser =
			msg.role === "user" ||
			((msg.role as string) === "signal" &&
				((msg as any).type === "user" ||
					(typeof rawContent === "object" &&
						(rawContent as any)?.metadata?.signal?.type === "user") ||
					(typeof rawContent === "string" &&
						(rawContent.includes('"type":"user"') ||
							rawContent.includes('"data-user-message"')))))
		const isSystem =
			msg.role === "system" ||
			((msg.role as string) === "signal" && (msg as any).type === "system")

		if (isUser) {
			items.push({ type: "user", key: `msg-${msg.id}`, data: msg })
		} else if (isSystem) {
			items.push({ type: "system", key: `msg-${msg.id}`, data: msg })
		} else if (msg.role === "assistant") {
			// Walk content blocks in order and group consecutive text/thinking
			// blocks into a single assistant item, emitting tool items inline.
			let pendingTextBlocks: MessageContent[] = []
			let textGroupIndex = 0
			let hasEmittedItemForMessage = false
			const isStreaming = msg.id === streamingMessageId

			const flushText = (isTrailing: boolean) => {
				const hasContent = pendingTextBlocks.some((c) => {
					const block = c as unknown as Record<string, unknown>
					const text = (block.text ?? block.thinking ?? block.reasoning ?? "") as string
					return typeof text === "string" && text.length > 0
				})
				const isError = msg.stopReason === "error" || Boolean(msg.errorMessage)
				const shouldEmit =
					hasContent ||
					(isStreaming && isTrailing) ||
					(isTrailing && isError) ||
					(isTrailing && !hasEmittedItemForMessage && !isAgentActive)

				if (shouldEmit) {
					hasEmittedItemForMessage = true
					items.push({
						type: "assistant",
						key: `msg-${msg.id}-text-${textGroupIndex}`,
						data: {
							...msg,
							content:
								pendingTextBlocks.length > 0
									? pendingTextBlocks
									: [
											{
												type: "text",
												text:
													msg.errorMessage ??
													(msg.stopReason === "complete"
														? ""
														: ""),
											},
										],
							// Only show streaming cursor on the trailing (last) text group
							isStreaming: isStreaming && isTrailing,
						},
					})
				}
				textGroupIndex++
				pendingTextBlocks = []
			}

			// Normalize content into MessageContent[]
			const contentBlocks = normalizeMessageContent(msg.content, (msg as any).text)

			// Pre-index any tool_result blocks in this message so tool_call can pick up its result
			const toolResultsById = new Map<string, { result: unknown; isError?: boolean }>()
			for (const c of contentBlocks) {
				if (!c || typeof c !== "object") continue
				const b = c as Record<string, unknown>
				const t = String(b.type || "").toLowerCase().replace(/[-_]/g, "")
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

			for (const c of contentBlocks) {
				const block = (c as unknown as Record<string, unknown>) || {}
				const rawType = String(block.type || "").toLowerCase().replace(/[-_]/g, "")

				if (
					rawType === "text" ||
					rawType === "output" ||
					rawType === "message" ||
					(!rawType && (block.text != null || block.content != null || block.value != null))
				) {
					pendingTextBlocks.push({
						type: "text",
						text: String(block.text ?? block.content ?? block.value ?? ""),
					})
				} else if (
					rawType === "thinking" ||
					rawType === "reasoning" ||
					rawType === "thought" ||
					rawType === "redactedthinking"
				) {
					pendingTextBlocks.push({
						type: "thinking",
						thinking: String(
							block.thinking ||
								block.reasoning ||
								block.thought ||
								block.text ||
								block.content ||
								"",
						),
						...(rawType === "redactedthinking" ? { isRedacted: true } : {}),
					})
				} else if (
					rawType === "toolcall" ||
					rawType === "tooluse" ||
					rawType === "toolinvocation"
				) {
					// Flush any accumulated text before this tool call
					flushText(false)

					const inv =
						(block.toolInvocation as Record<string, unknown>) || block
					const toolId = (inv.toolCallId || block.id || inv.id || (inv as any).tool_use_id || "") as string
					const toolName = (inv.toolName ||
						block.name ||
						inv.name ||
						"") as string
					const toolArgs =
						inv.args ?? block.args ?? (inv as any).input ?? (block as any).input
					const savedResult = toolResultsById.get(toolId)
					const toolResult = inv.result ?? block.result ?? savedResult?.result
					const isError = Boolean(inv.isError ?? block.isError ?? savedResult?.isError)
					const isDone =
						inv.state === "result" ||
						toolResult !== undefined ||
						savedResult !== undefined

					const toolState = tools.get(toolId)
					const subagentState = subagents.get(toolId)

					hasEmittedItemForMessage = true

					if (subagentState) {
						items.push({
							type: "subagent",
							key: `subagent-${toolId}`,
							data: subagentState,
						})
					} else if (toolName === "subagent") {
						const saArgs = (toolArgs as Record<string, unknown>) || {}
						items.push({
							type: "subagent",
							key: `subagent-${toolId}`,
							data: {
								toolCallId: toolId,
								agentType: (saArgs.agentType as string) || "explore",
								task: (saArgs.task as string) || (saArgs.description as string) || "",
								tools: [],
								result:
									typeof toolResult === "string"
										? toolResult
										: (toolResult as any)?.content,
								isError,
								status: isDone ? "complete" : "running",
							},
						})
					} else {
						items.push({
							type: "tool",
							key: `tool-${toolId}`,
							data: toolState ?? {
								id: toolId,
								name: toolName,
								args: toolArgs,
								result: toolResult,
								isError,
								status: isDone
									? isError
										? "error"
										: "complete"
									: "pending",
							},
						})
					}
				}
				// tool_result / data-om-status blocks are skipped as they are associated with tool calls
			}
			// Flush any trailing text (e.g. the final summary after tool calls, or streaming/error placeholders)
			flushText(true)
		}
	}

	// Render any tools or subagents from state that haven't been emitted yet
	const renderedToolIds = new Set<string>()
	for (const item of items) {
		if (item.type === "tool") {
			renderedToolIds.add((item.data as any).id)
		} else if (item.type === "subagent") {
			renderedToolIds.add((item.data as any).toolCallId)
		}
	}

	for (const [toolId, tool] of tools) {
		if (!renderedToolIds.has(toolId)) {
			items.push({
				type: "tool",
				key: `standalone-tool-${toolId}`,
				data: tool,
			})
			renderedToolIds.add(toolId)
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

	// If the agent is active and the last item is from the user, show an active assistant placeholder
	if (
		isAgentActive &&
		(items.length === 0 || items[items.length - 1].type === "user")
	) {
		items.push({
			type: "assistant",
			key: "streaming-thinking-placeholder",
			data: {
				id: "streaming-thinking-placeholder",
				role: "assistant",
				content: [{ type: "text", text: "" }],
				isStreaming: true,
			},
		})
	}

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "16px 24px",
			}}
		>
			{items.length === 0 && !isAgentActive && <AsciiLogo />}

			{items.map((item) => {
				switch (item.type) {
					case "user":
						return (
							<UserMessage key={item.key} message={item.data as Message} />
						)
					case "assistant":
						return (
							<AssistantMessage
								key={item.key}
								message={item.data as Message & { isStreaming: boolean }}
							/>
						)
					case "tool":
						return (
							<ToolExecution
								key={item.key}
								tool={
									item.data as {
										id: string
										name: string
										args: unknown
										result?: unknown
										isError?: boolean
										status: string
										shellOutput?: string
									}
								}
							/>
						)
					case "subagent":
						return (
							<SubagentExecution
								key={item.key}
								subagent={
									item.data as {
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
							/>
						)
					case "system": {
						const sysMsg = item.data as Message
						const sysContent = normalizeMessageContent(
							sysMsg.content,
							(sysMsg as any).text,
						)
						const sysText =
							sysContent
								.map(
									(c) =>
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

			{/* Elapsed time indicator */}
			{isAgentActive && agentStartedAt && (
				<ElapsedTime startedAt={agentStartedAt} />
			)}

			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 0.3; }
					50% { opacity: 1; }
				}
			`}</style>

			{/* Bottom padding */}
			<div style={{ height: 16 }} />
		</div>
	)
}
