import { useEffect, useRef, useMemo } from "react"
import { AssistantMessage } from "./AssistantMessage"
import { UserMessage } from "./UserMessage"
import { ExecutionBlock, ExecutionStep, ExecutionTool } from "./ExecutionBlock"
import { SubagentExecution } from "./SubagentExecution"
import { TodoProgress } from "./TodoProgress"
import { AsciiLogo } from "./AsciiLogo"
import { InterruptedNotice } from "./InterruptedNotice"
import type { Message, MessageContent } from "../types/ipc"
import {
	normalizeMessageContent,
	extractThinkingFromText,
} from "../utils/messageParser"
import { isUserMessage, getMessageText } from "../types/chat"
import { isReplayMessage, getReplayPlaybackKey } from "../utils/replayMessage"
import { shouldPinToBottom } from "../utils/chatScroll"

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
	isReplaySession?: boolean
	isActivelyReplaying?: boolean
	replaySource?: string
	/**
	 * The user stopped this thread's run. Ephemeral by design: nothing about a
	 * stop is stored, so this note lives only as long as the renderer says so.
	 */
	interrupted?: boolean
}

export type RenderItem =
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

export type TurnGroup = {
	key: string
	userItem?: Extract<RenderItem, { type: "user" }>
	items: RenderItem[]
}

/**
 * Group items into turns so each turn acts as the containing block for its UserMessage.
 * In CSS, a position:sticky element is constrained to the boundary of its containing block.
 * When a new turn scrolls into view, the previous turn container pushes its UserMessage
 * out of the viewport, ensuring strictly ONE user message is sticky at any time with no overlaps.
 */
export function groupItemsIntoTurns(cleanedItems: RenderItem[]): TurnGroup[] {
	const turns: TurnGroup[] = []
	let currentTurn: TurnGroup | null = null

	for (const item of cleanedItems) {
		if (item.type === "user") {
			currentTurn = {
				key: `turn-${item.key}`,
				userItem: item,
				items: [],
			}
			turns.push(currentTurn)
		} else if (item.type === "system") {
			currentTurn = null
			turns.push({
				key: `sys-${item.key}`,
				items: [item],
			})
		} else if (currentTurn) {
			currentTurn.items.push(item)
		} else {
			// Items before the first user message (e.g. system items)
			turns.push({
				key: `pre-${item.key}`,
				items: [item],
			})
		}
	}
	return turns
}

/**
 * A turn belongs to a replay when any message in it came from the recorded reconstruction.
 * Those turns get their own outlined container so a replay of a few runs is visually
 * distinguishable from the live conversation around it.
 */
export function isReplayTurn(turn: TurnGroup): boolean {
	if (turn.userItem && isReplayMessage(turn.userItem.data)) return true
	return turn.items.some((item) => {
		if (item.type === "user") return isReplayMessage(item.data)
		if (item.type === "assistant") return isReplayMessage(item.data)
		return false
	})
}

/**
 * Which playback a replayed turn belongs to. Several passes over the same
 * recording each get their own block, and this key is what tells them apart.
 */
export function replayTurnPlaybackKey(turn: TurnGroup): string | null {
	const ids: Array<string | null | undefined> = []
	if (turn.userItem) ids.push((turn.userItem.data as Message)?.id)
	for (const item of turn.items) {
		if (item.type === "user" || item.type === "assistant") {
			ids.push((item.data as Message)?.id)
		}
	}
	for (const id of ids) {
		const key = getReplayPlaybackKey(id)
		if (key) return key
	}
	return null
}

/**
 * A replayed answer plus a byte-identical live answer right after it means the
 * live run was still pointed at the replay model — the session was answered
 * twice from the same recording. Only the replayed copy belongs on screen.
 */
export function isDuplicateReplayAnswer(
	a: Message | undefined,
	b: Message | undefined,
): boolean {
	if (!a || !b) return false
	if (a.role !== "assistant" || b.role !== "assistant") return false
	if (a.id === b.id) return false
	if (!isReplayMessage(a) && !isReplayMessage(b)) return false
	// Two playbacks of the same recording produce identical answers; they are not
	// duplicates of each other, and collapsing them would hide the second pass.
	const keyA = getReplayPlaybackKey(a.id)
	const keyB = getReplayPlaybackKey(b.id)
	if (keyA && keyB && keyA !== keyB) return false
	const textA = getMessageText(a)
	const textB = getMessageText(b)
	if (!textA || textA !== textB) return false
	// Answers carrying tool calls are distinct executions even with equal text.
	const hasToolPart = (m: Message) => {
		const blocks = normalizeMessageContent(m.content, (m as any).text)
		return blocks.some((c) => {
			if (!c || typeof c !== "object") return false
			const t = String((c as any).type || "")
				.toLowerCase()
				.replace(/[-_]/g, "")
			return t === "toolcall" || t === "tooluse" || t === "toolinvocation"
		})
	}
	return !hasToolPart(a) && !hasToolPart(b)
}

/**
 * How to treat a user message that repeats the previous one. A replay landing on
 * a thread that already holds the same prompt must not create a second turn, so
 * the replayed bubble wins and the live duplicate is dropped.
 */
export type DuplicateUserDecision = "keep" | "skip" | "replace-previous"

export function decideDuplicateUser(
	previous: Message | undefined,
	next: Message,
): DuplicateUserDecision {
	if (!previous) return "keep"
	if (!isUserMessage(previous) || !isUserMessage(next)) return "keep"
	const prevText = getMessageText(previous)
	const nextText = getMessageText(next)
	if (!prevText || !nextText || prevText !== nextText) return "keep"

	const prevIsReplay = isReplayMessage(previous)
	const nextIsReplay = isReplayMessage(next)
	if (nextIsReplay && !prevIsReplay) {
		// Reconstruction appends the recorded block after the live conversation, so
		// the replayed prompt lands right behind the identical live prompt. Keep one
		// bubble — the replayed one — and the turn stays a single outline.
		return "replace-previous"
	}
	if (prevIsReplay && !nextIsReplay) {
		// A live prompt after a replayed one is a real new send (the user typed the
		// same thing again); never swallow it.
		return "keep"
	}
	// Two replayed prompts are two recorded runs and both stay; two live ones
	// are a double-send and collapse.
	return nextIsReplay ? "keep" : "skip"
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
	isReplaySession,
	isActivelyReplaying,
	replaySource,
	interrupted,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAutoScroll = useRef(true)

	// Auto-scroll on new messages or tool updates. A message the user just sent
	// always belongs in view: reading history first must not push the fresh
	// bubble below the fold, or the send looks ignored until the answer streams.
	useEffect(() => {
		const pin = isAutoScroll.current || shouldPinToBottom(messages)
		if (pin && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
			requestAnimationFrame(() => {
				if (
					(isAutoScroll.current || shouldPinToBottom(messages)) &&
					scrollRef.current
				) {
					scrollRef.current.scrollTop = scrollRef.current.scrollHeight
				}
			})
		}
	}, [messages.length, messages, tools, subagents, isAgentActive, interrupted])

	const handleScroll = () => {
		if (!scrollRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
		isAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100
	}

	// Build a structured list of renderable items:
	// - A turn's thinking and tool calls fold into one ExecutionBlock per turn,
	//   labelled "Thinking for 12.3s" while running and "Worked for 1m 6s" once done.
	// - The assistant's markdown answer appears below the execution block.
	const cleanedItems = useMemo(() => {
		const items: RenderItem[] = []

		// Each turn stores its total duration on the last assistant message (see
		// AGENT_END). Spread it across the whole turn so the first execution block
		// of the turn can render "Worked for 45s" even when tools ran in an
		// earlier message than the final text.
		const turnDurationById = new Map<string, number>()
		{
			let pendingIds: string[] = []
			let turnDuration: number | undefined
			const commit = () => {
				if (turnDuration != null) {
					for (const id of pendingIds) turnDurationById.set(id, turnDuration)
				}
				pendingIds = []
				turnDuration = undefined
			}
			for (const msg of messages) {
				if (isUserMessage(msg) || msg.role === "system") {
					commit()
					continue
				}
				if (msg.role !== "assistant") continue
				pendingIds.push(msg.id)
				if (msg.durationMs != null) turnDuration = msg.durationMs
			}
			commit()
		}

		// Only the first execution block of a turn shows the duration label
		let turnDurationShown = false

		for (const msg of messages) {
			const isUser = isUserMessage(msg)
			const isSystem =
				msg.role === "system" ||
				((msg.role as string) === "signal" && (msg as any).type === "system")

			if (isUser || isSystem) {
				turnDurationShown = false
			}

			if (isUser) {
				const lastItem = items[items.length - 1]
				const decision = decideDuplicateUser(
					lastItem && lastItem.type === "user"
						? (lastItem.data as Message)
						: undefined,
					msg,
				)
				if (decision === "skip") continue
				if (decision === "replace-previous") {
					items.pop()
				}
				items.push({ type: "user", key: `msg-${msg.id}`, data: msg })
			} else if (isSystem) {
				items.push({ type: "system", key: `msg-${msg.id}`, data: msg })
			} else if (msg.role === "assistant") {
				const isStreaming = msg.id === streamingMessageId
				const msgDurationMs = msg.durationMs ?? turnDurationById.get(msg.id)
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
							for (const s of currentSteps) {
								const existingStep = lastItem.data.steps.find(
									(st) => st.id === s.id,
								)
								if (existingStep) {
									if (
										s.type === "thinking" &&
										existingStep.type === "thinking"
									) {
										existingStep.text = s.text
										existingStep.durationSec = s.durationSec
										existingStep.isStreaming = s.isStreaming
									}
								} else {
									lastItem.data.steps.push(s)
								}
							}
							if (msgDurationMs != null && !turnDurationShown) {
								lastItem.data.durationMs = msgDurationMs
								turnDurationShown = true
							}
							lastItem.data.isActive = isStreaming && isAgentActive
							if (showChangedFiles) {
								lastItem.data.changedFiles = msg.changedFiles
							}
							currentSteps = []
							return
						}

						const execIndex = execGroupIndex++
						const withDuration = execIndex === 0 && !turnDurationShown
						if (withDuration && msgDurationMs != null) turnDurationShown = true
						items.push({
							type: "execution",
							key: `msg-${msg.id}-exec-${execIndex}`,
							data: {
								isActive: isStreaming && isAgentActive,
								steps: [...currentSteps],
								// Only the first block of a turn carries the task duration,
								// so a multi-round turn doesn't repeat "Worked for …".
								durationMs: withDuration ? msgDurationMs : undefined,
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
					const isError =
						msg.stopReason === "error" || Boolean(msg.errorMessage)
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
								durationMs: msgDurationMs,
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
						const { extractedThinking, cleanText, isStreamingThinking } =
							extractThinkingFromText(textVal)

						if (extractedThinking) {
							if (currentTextBlocks.length > 0) {
								flushText(false)
							}
							const durationSec =
								(block.durationSec as number) ??
								(msg.durationMs
									? Math.max(1, Math.round(msg.durationMs / 1000))
									: Math.max(2, Math.round(extractedThinking.length / 50)))

							currentSteps.push({
								type: "thinking",
								id: `think-${msg.id}-${thinkCounter++}`,
								text: extractedThinking,
								durationSec,
								isStreaming:
									isStreaming && isAgentActive && isStreamingThinking,
								startedAt: isStreaming ? agentStartedAt : null,
							})
						}

						// Only non-empty text triggers execution flush; empty stream tokens are ignored
						if (cleanText.trim().length > 0) {
							flushExecution()
							currentTextBlocks.push({
								type: "text",
								text: cleanText,
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

						const inv =
							(block.toolInvocation as Record<string, unknown>) || block
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
							inv.args ??
							block.args ??
							(inv as any).input ??
							(block as any).input
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
						if (
							items[i].type === "assistant" &&
							(items[i].data as any).id === msg.id
						) {
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
		const baseItems: RenderItem[] = []
		for (const item of items) {
			const prev = baseItems[baseItems.length - 1]
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
			} else if (
				item.type === "assistant" &&
				prev &&
				prev.type === "assistant" &&
				isDuplicateReplayAnswer(prev.data as Message, item.data as Message)
			) {
				// The same answer written twice — once by the replay, once by a run
				// that was still pointed at the replay model. Keep the replayed copy
				// so the turn shows one answer inside one outline.
				if (isReplayMessage(item.data as Message)) {
					baseItems[baseItems.length - 1] = item
				}
			} else {
				baseItems.push(item)
			}
		}
		return organizeTurnItems(baseItems)
	}, [
		messages,
		tools,
		subagents,
		isAgentActive,
		agentStartedAt,
		streamingMessageId,
	])

	const renderedTurns = useMemo(() => {
		return groupItemsIntoTurns(cleanedItems)
	}, [cleanedItems])

	// Playbacks stack, so number them. Without a number a second pass over the
	// same recording looks exactly like the first one, which reads as "replay
	// did nothing".
	const replayPassByKey = useMemo(() => {
		const passes = new Map<string, number>()
		let next = 0
		for (const turn of renderedTurns) {
			if (!isReplayTurn(turn)) continue
			const key = replayTurnPlaybackKey(turn)
			if (!key || passes.has(key)) continue
			passes.set(key, ++next)
		}
		return passes
	}, [renderedTurns])

	// A replay ends as soon as its recorded block is reconstructed, so the
	// thread's "isReplay" flag is already false by the time this renders. Keep
	// the explanatory banner for any thread that *contains* replayed turns.
	const hasReplayTurns = useMemo(
		() => renderedTurns.some((turn) => isReplayTurn(turn)),
		[renderedTurns],
	)
	const showReplayBanner = Boolean(isReplaySession || hasReplayTurns)

	// `insideReplayTurn` also covers live messages that ended up inside a replayed
	// turn (a replay of the same prompt replaces the live bubble in place).
	// `afterHeader` marks an answer sitting right under its turn header, which
	// hands the gap between them to that header instead of adding its own.
	const renderItem = (
		item: RenderItem,
		insideReplayTurn = false,
		afterHeader = false,
	) => {
		switch (item.type) {
			case "user":
				return (
					<UserMessage
						key={item.key}
						message={item.data as Message}
						// Pinning uses negative side margins and an opaque background,
						// which is exactly what painted over the outline. Keep replayed
						// prompts in the normal flow so the border stays intact.
						pinned={!insideReplayTurn && !isReplayMessage(item.data as Message)}
					/>
				)
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
						flushTop={afterHeader}
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
								(c as any).text ?? (c as any).content ?? (c as any).value ?? "",
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
	}

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			style={{
				flex: 1,
				overflowY: "auto",
				overflowX: "hidden",
				// No padding on the scroll container itself: padding here opens a
				// strip beside sticky children where scrolled content still shows,
				// and top padding keeps them from reaching the viewport top.
				// Horizontal padding lives on the inner column instead.
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				// Reserve the scrollbar gutter so sticky cards are never painted
				// under an overlay scrollbar.
				scrollbarGutter: "stable",
			}}
		>
			<div
				style={{
					maxWidth: 800,
					width: "100%",
					margin: "0 auto",
					padding: "16px 24px 0",
					display: "flex",
					flexDirection: "column",
					flex: "1 0 auto",
					minHeight: "100%",
				}}
			>
				{showReplayBanner && (
					<div
						style={{
							marginBottom: 16,
							padding: "10px 16px",
							borderRadius: 10,
							background: isActivelyReplaying
								? "color-mix(in srgb, var(--replay) 12%, transparent)"
								: "color-mix(in srgb, var(--replay) 8%, transparent)",
							border:
								"1px solid color-mix(in srgb, var(--replay) 30%, transparent)",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 12,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<div
								style={{
									width: 24,
									height: 24,
									borderRadius: "50%",
									background:
										"color-mix(in srgb, var(--replay) 20%, transparent)",
									color: "var(--replay)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									fontSize: 10,
									fontWeight: 700,
									flexShrink: 0,
								}}
							>
								▶
							</div>
							<div>
								<div
									style={{
										fontSize: 13,
										fontWeight: 600,
										color: "var(--text)",
									}}
								>
									{isActivelyReplaying ? "Replay Running" : "Session Replay"}
									<span
										style={{
											fontSize: 9,
											fontWeight: 700,
											color: "var(--replay)",
											background:
												"color-mix(in srgb, var(--replay) 15%, transparent)",
											padding: "1px 5px",
											borderRadius: 3,
											marginLeft: 8,
											letterSpacing: "0.5px",
										}}
									>
										OFFLINE
									</span>
								</div>
								<div
									style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
								>
									{isActivelyReplaying
										? "Currently streaming execution from recorded data. No tokens are consumed."
										: "This conversation was reproduced from recorded session events."}
								</div>
							</div>
						</div>
						{replaySource && (
							<span
								title={replaySource}
								style={{
									fontSize: 10,
									fontFamily: "monospace",
									background: "var(--bg)",
									border:
										"1px solid color-mix(in srgb, var(--replay) 25%, transparent)",
									color: "var(--replay)",
									padding: "3px 8px",
									borderRadius: 4,
									maxWidth: 200,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{replaySource}
							</span>
						)}
					</div>
				)}

				{cleanedItems.length === 0 && !isAgentActive && <AsciiLogo />}

				{renderedTurns.map((turn) => {
					const replayTurn = isReplayTurn(turn)
					const playbackKey = replayTurn ? replayTurnPlaybackKey(turn) : null
					const playbackPass = playbackKey
						? replayPassByKey.get(playbackKey)
						: undefined
					return (
						<div
							key={turn.key}
							style={{
								display: "flex",
								flexDirection: "column",
								...(replayTurn
									? {
											position: "relative",
											// The outline is a sibling overlay rather than a
											// border on the box: a child's opaque background
											// would otherwise paint over the border line.
											margin: "14px 0",
											padding: "12px 14px 6px",
											borderRadius: 12,
											// Every playback writes fresh message ids, so replaying
											// the same file remounts this block and replays the
											// fade — otherwise a second replay looks like nothing
											// happened because the transcript is identical.
											animation: "replay-turn-in 260ms ease-out both",
										}
									: null),
							}}
						>
							{replayTurn && (
								<span
									aria-hidden="true"
									style={{
										position: "absolute",
										inset: 0,
										borderRadius: 12,
										border:
											"1px solid color-mix(in srgb, var(--replay) 45%, transparent)",
										pointerEvents: "none",
										zIndex: 30,
									}}
								/>
							)}
							{replayTurn && (
								<span
									title="Reproduced from a recorded session — no API calls"
									style={{
										position: "absolute",
										top: -8,
										right: 12,
										fontSize: 9,
										fontWeight: 700,
										letterSpacing: "0.5px",
										color: "var(--replay)",
										background: "var(--bg)",
										border:
											"1px solid color-mix(in srgb, var(--replay) 40%, transparent)",
										borderRadius: 999,
										padding: "1px 7px",
										lineHeight: 1.4,
										pointerEvents: "none",
										zIndex: 31,
									}}
								>
									{`▶ REPLAY${
										playbackPass && playbackPass > 1 ? ` #${playbackPass}` : ""
									}`}
								</span>
							)}
							{turn.userItem && renderItem(turn.userItem, replayTurn)}
							{turn.items.map((item, i) =>
								renderItem(
									item,
									replayTurn,
									turn.items[i - 1]?.type === "execution",
								),
							)}
						</div>
					)
				})}

				{/* Todo progress */}
				{todos.length > 0 && <TodoProgress todos={todos} />}

				{/* The run ended because the user stopped it; closing the turn here
				    keeps the truncated answer from reading like a crash. Shown the
				    moment Stop is pressed — waiting for the harness to confirm the
				    abort would put the note a round trip behind the click. */}
				{interrupted && <InterruptedNotice />}

				<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 0.3; }
					50% { opacity: 1; }
				}
				@keyframes blink {
					0%, 100% { opacity: 1; }
					50% { opacity: 0; }
				}
				@keyframes replay-turn-in {
					from { opacity: 0; transform: translateY(6px); }
					to { opacity: 1; transform: none; }
				}
				@keyframes interrupt-note-in {
					from { opacity: 0; transform: translateY(-2px); }
					to { opacity: 1; transform: none; }
				}
			`}</style>

				{/* Bottom padding */}
				<div style={{ height: 16 }} />
			</div>
		</div>
	)
}

/**
 * One activity block per turn: fold all execution blocks of the
 * same turn into a single execution block, and ensure it ALWAYS appears
 * BEFORE the assistant's response (Worked for ... -> Assistant Message).
 */
export function organizeTurnItems(cleanedItems: RenderItem[]): RenderItem[] {
	const turnItems: RenderItem[] = []

	let currentTurnUser: Extract<RenderItem, { type: "user" }> | null = null
	let currentTurnExec: Extract<RenderItem, { type: "execution" }> | null = null
	let currentTurnSubagents: Extract<RenderItem, { type: "subagent" }>[] = []
	let currentTurnAssistants: Extract<RenderItem, { type: "assistant" }>[] = []

	const flushTurn = () => {
		if (currentTurnUser) {
			turnItems.push(currentTurnUser)
			currentTurnUser = null
		}

		// If no execution block was created by tool/thinking steps, but assistant has durationMs,
		// synthesize an execution block for this turn so "Worked for Xs" is displayed.
		if (!currentTurnExec && currentTurnAssistants.length > 0) {
			let foundDuration: number | undefined
			for (let i = currentTurnAssistants.length - 1; i >= 0; i--) {
				const d = currentTurnAssistants[i].data.durationMs
				if (d != null) {
					foundDuration = d
					break
				}
			}
			if (foundDuration != null && foundDuration > 0) {
				currentTurnExec = {
					type: "execution",
					key: `turn-exec-${currentTurnAssistants[0].data.id}`,
					data: {
						isActive: false,
						steps: [],
						durationMs: foundDuration,
						startedAt: null,
					},
				}
			}
		}

		if (
			currentTurnExec &&
			(currentTurnExec.data.steps.length > 0 ||
				currentTurnExec.data.isActive ||
				currentTurnExec.data.durationMs != null)
		) {
			if (currentTurnExec.data.durationMs == null) {
				for (let i = currentTurnAssistants.length - 1; i >= 0; i--) {
					const d = currentTurnAssistants[i].data.durationMs
					if (d != null) {
						currentTurnExec.data.durationMs = d
						break
					}
				}
			}
			if (!currentTurnExec.data.changedFiles) {
				for (let i = currentTurnAssistants.length - 1; i >= 0; i--) {
					const cf = currentTurnAssistants[i].data.changedFiles
					if (cf && cf.length > 0) {
						currentTurnExec.data.changedFiles = cf
						break
					}
				}
			}
			turnItems.push(currentTurnExec)
		}
		currentTurnExec = null

		for (const sa of currentTurnSubagents) {
			turnItems.push(sa)
		}
		currentTurnSubagents = []

		for (const asst of currentTurnAssistants) {
			turnItems.push(asst)
		}
		currentTurnAssistants = []
	}

	for (const item of cleanedItems) {
		if (item.type === "system") {
			flushTurn()
			turnItems.push(item)
			continue
		}
		if (item.type === "user") {
			flushTurn()
			currentTurnUser = item
			continue
		}
		if (item.type === "execution") {
			if (!currentTurnExec) {
				currentTurnExec = {
					...item,
					data: {
						...item.data,
						steps: [...item.data.steps],
					},
				}
			} else {
				const existingIds = new Set(currentTurnExec.data.steps.map((s) => s.id))
				for (const s of item.data.steps) {
					if (!existingIds.has(s.id)) {
						existingIds.add(s.id)
						currentTurnExec.data.steps.push(s)
					}
				}
				if (item.data.isActive) {
					currentTurnExec.data.isActive = true
					currentTurnExec.data.startedAt =
						item.data.startedAt ?? currentTurnExec.data.startedAt
				}
				if (item.data.durationMs != null) {
					currentTurnExec.data.durationMs = item.data.durationMs
				}
				if (item.data.changedFiles) {
					currentTurnExec.data.changedFiles = item.data.changedFiles
				}
			}
			continue
		}
		if (item.type === "subagent") {
			currentTurnSubagents.push(item)
			continue
		}
		if (item.type === "assistant") {
			currentTurnAssistants.push(item)
			continue
		}
	}
	flushTurn()
	return turnItems
}
