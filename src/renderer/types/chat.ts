import type { Message } from "./ipc"
import { normalizeMessageContent } from "../utils/messageParser"

export function isUserMessage(
	msg:
		| Message
		| {
				role?: string
				type?: string
				content?: unknown
				[key: string]: unknown
		  }
		| undefined,
): boolean {
	if (!msg) return false
	if (msg.role === "user") return true
	if ((msg.role as string) === "signal") {
		const type = (msg as any).type
		if (type === "user" || type === "data-user-message") return true
		const rawContent = msg.content
		if (typeof rawContent === "object" && rawContent !== null) {
			const signalType = (rawContent as any)?.metadata?.signal?.type
			if (signalType === "user" || signalType === "data-user-message")
				return true
		}
		if (typeof rawContent === "string") {
			if (
				rawContent.includes('"type":"user"') ||
				rawContent.includes('"data-user-message"')
			) {
				return true
			}
		}
	}
	return false
}

export function getMessageText(
	msg:
		| Message
		| { content?: unknown; text?: unknown; [key: string]: unknown }
		| undefined,
): string {
	if (!msg) return ""
	if (typeof (msg as any).text === "string" && (msg as any).text) {
		return (msg as any).text.trim()
	}
	const content = msg.content
	if (typeof content === "string") {
		const trimmed = content.trim()
		if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
			return trimmed
		}
	}
	if (Array.isArray(content) && content.length > 0) {
		let fastText = ""
		let isSimple = true
		for (const c of content) {
			if (typeof c === "string") {
				fastText += c
			} else if (
				c &&
				typeof c === "object" &&
				(c as any).type === "text" &&
				typeof (c as any).text === "string"
			) {
				fastText += (c as any).text
			} else {
				isSimple = false
				break
			}
		}
		if (isSimple) return fastText.trim()
	}
	const blocks = normalizeMessageContent(msg.content, (msg as any).text)
	const textParts = blocks.filter((b) => !b.type || b.type === "text")
	if (textParts.length > 0) {
		return textParts
			.map(
				(c) =>
					(c as unknown as { text?: string; content?: string }).text ??
					(c as unknown as { content?: string }).content ??
					"",
			)
			.join("")
			.trim()
	}
	return ""
}

function findMatchingMessageIndex(
	messages: Message[],
	incoming: Message,
): number {
	// 1. Exact ID match
	const exactIdx = messages.findIndex((m) => m.id === incoming.id)
	if (exactIdx !== -1) return exactIdx

	// 2. ONLY server messages (!id.startsWith("user-")) should ever reconcile with an existing optimistic message
	if (isUserMessage(incoming) && !incoming.id.startsWith("user-")) {
		const incomingText = getMessageText(incoming)
		// Check from the end towards the beginning (most recent messages first)
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i]
			// Stop scanning if we hit a completed turn's assistant message
			if (
				m.role === "assistant" &&
				Array.isArray(m.content) &&
				m.content.length > 0
			) {
				break
			}
			if (isUserMessage(m)) {
				// Reconcile if optimistic ID ("user-") and text matches or matches turn
				if (m.id.startsWith("user-")) {
					const existingText = getMessageText(m)
					if (!existingText || !incomingText || existingText === incomingText) {
						return i
					}
				}
				// Or if text content is identical
				const existingText = getMessageText(m)
				if (existingText && incomingText && existingText === incomingText) {
					return i
				}
			}
		}
	}

	return -1
}

export type ToolState = {
	id: string
	name: string
	args: unknown
	result?: unknown
	isError?: boolean
	status: "pending" | "running" | "complete" | "error"
	shellOutput?: string
}

export type SubagentState = {
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

export interface AttachedFile {
	type: "image" | "file"
	name: string
	mimeType: string
	data: string // base64 for images, text content for files
	preview: string // data URL for images, empty for files
	size?: number
}

export interface QueuedMessage {
	id: string
	threadId: string | null
	content: string
	files?: AttachedFile[]
	createdAt: string
}

export type ChatState = {
	messages: Message[]
	isAgentActive: boolean
	agentStartedAt: number | null
	streamingMessageId: string | null
	tools: Map<string, ToolState>
	subagents: Map<string, SubagentState>
	queuesByThread: Record<string, QueuedMessage[]>
	isQueuePaused?: boolean
}

export type ChatAction =
	| { type: "AGENT_START" }
	| { type: "AGENT_END"; changedFiles?: Message["changedFiles"] }
	| {
			type: "SET_MESSAGE_CHANGED_FILES"
			messageId: string
			files: Message["changedFiles"]
	  }
	| { type: "MESSAGE_START"; message: Message }
	| { type: "MESSAGE_UPDATE"; message: Message }
	| { type: "MESSAGE_END"; message: Message }
	| { type: "TOOL_START"; id: string; name: string; args: unknown }
	| { type: "TOOL_UPDATE"; id: string; partialResult: unknown }
	| { type: "TOOL_END"; id: string; result: unknown; isError: boolean }
	| {
			type: "SHELL_OUTPUT"
			id: string
			output: string
			stream: "stdout" | "stderr"
	  }
	| {
			type: "SUBAGENT_START"
			toolCallId: string
			agentType: string
			task: string
			modelId?: string
	  }
	| {
			type: "SUBAGENT_TOOL_START"
			toolCallId: string
			subToolName: string
			subToolArgs: unknown
	  }
	| {
			type: "SUBAGENT_TOOL_END"
			toolCallId: string
			subToolName: string
			subToolResult: unknown
			isError: boolean
	  }
	| {
			type: "SUBAGENT_END"
			toolCallId: string
			result: string
			isError: boolean
			durationMs: number
	  }
	| { type: "SET_MESSAGES"; messages: Message[] }
	| { type: "SET_THREAD_QUEUE"; threadId: string; queue: QueuedMessage[] }
	| { type: "ENQUEUE_MESSAGE"; threadId: string; message: QueuedMessage }
	| { type: "DEQUEUE_MESSAGE"; threadId: string; id: string }
	| { type: "REMOVE_QUEUED_MESSAGE"; threadId: string; id: string }
	| { type: "REORDER_THREAD_QUEUE"; threadId: string; queue: QueuedMessage[] }
	| { type: "CLEAR_THREAD_QUEUE"; threadId: string }
	| { type: "SET_QUEUE_PAUSED"; paused: boolean }
	| { type: "CLEAR" }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
	try {
		return internalChatReducer(state, action)
	} catch (err) {
		console.error("Error in chatReducer:", err, action)
		return state
	}
}

function internalChatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case "AGENT_START":
			return { ...state, isAgentActive: true, agentStartedAt: Date.now() }
		case "SET_MESSAGE_CHANGED_FILES": {
			const hasMatch = state.messages.some((m) => m.id === action.messageId)
			if (hasMatch) {
				return {
					...state,
					messages: state.messages.map((m) =>
						m.id === action.messageId
							? { ...m, changedFiles: action.files }
							: m,
					),
				}
			}
			// Fallback: attach to the last assistant message if ID didn't match
			let lastAssistantIdx = -1
			for (let i = state.messages.length - 1; i >= 0; i--) {
				if (state.messages[i].role === "assistant") {
					lastAssistantIdx = i
					break
				}
			}
			if (lastAssistantIdx !== -1) {
				const nextMessages = [...state.messages]
				nextMessages[lastAssistantIdx] = {
					...nextMessages[lastAssistantIdx],
					changedFiles: action.files,
				}
				return { ...state, messages: nextMessages }
			}
			return state
		}
		case "AGENT_END": {
			const durationMs = state.agentStartedAt
				? Date.now() - state.agentStartedAt
				: undefined
			let lastAssistantIdx = -1
			for (let i = state.messages.length - 1; i >= 0; i--) {
				if (state.messages[i].role === "assistant") {
					lastAssistantIdx = i
					break
				}
			}
			const msgs = state.messages.map((m, idx) => {
				if (idx === lastAssistantIdx) {
					return {
						...m,
						durationMs: m.durationMs ?? durationMs,
						changedFiles: action.changedFiles ?? m.changedFiles,
					}
				}
				return m
			})
			return {
				...state,
				messages: msgs,
				isAgentActive: false,
				streamingMessageId: null,
			}
		}
		case "MESSAGE_START": {
			if (!action.message?.id) return state
			const incoming = action.message

			// 1. Optimistic messages dispatched locally by handleSend (id: "user-*")
			// ALWAYS append immediately to state.messages for instant UI display
			if (incoming.id.startsWith("user-")) {
				return {
					...state,
					messages: [...state.messages, incoming],
					streamingMessageId: null,
				}
			}

			// 2. Server incoming message: check if it reconciles an existing message (or optimistic message)
			const matchIdx = findMatchingMessageIndex(state.messages, incoming)

			if (matchIdx !== -1) {
				const existing = state.messages[matchIdx]
				const merged: Message = {
					...existing,
					...incoming,
					id: incoming.id,
					role: incoming.role || existing.role,
					attachments: existing.attachments || incoming.attachments,
					createdAt: existing.createdAt || incoming.createdAt,
				}
				// Never let a text-less server update wipe the optimistic user text
				// (e.g. signal messages carrying only attachments).
				if (
					isUserMessage(merged) &&
					!getMessageText(incoming) &&
					getMessageText(existing)
				) {
					merged.content = existing.content
				}
				const newMessages = [...state.messages]
				newMessages[matchIdx] = merged
				return {
					...state,
					messages: newMessages,
					streamingMessageId:
						incoming.role === "assistant"
							? incoming.id
							: state.streamingMessageId,
				}
			}

			// 3. For server user messages, avoid duplicate bubble if the last message is already identical
			if (isUserMessage(incoming)) {
				const lastMsg = state.messages[state.messages.length - 1]
				if (lastMsg && isUserMessage(lastMsg)) {
					const lastText = getMessageText(lastMsg)
					const incomingText = getMessageText(incoming)
					if (lastText && incomingText && lastText === incomingText) {
						return state
					}
				}
			}

			return {
				...state,
				messages: [...state.messages, incoming],
				streamingMessageId: incoming.role === "assistant" ? incoming.id : null,
			}
		}
		case "MESSAGE_UPDATE": {
			if (!action.message?.id) return state
			const incoming = action.message
			const matchIdx = findMatchingMessageIndex(state.messages, incoming)

			if (matchIdx !== -1) {
				const existing = state.messages[matchIdx]
				const newContent =
					incoming.content && incoming.content.length > 0
						? incoming.content
						: existing.content
				const merged: Message = {
					...existing,
					...incoming,
					id: incoming.id,
					role: existing.role || incoming.role,
					content: newContent,
					durationMs: existing.durationMs ?? (incoming as any).durationMs,
					attachments: existing.attachments || incoming.attachments,
				}
				const newMessages = [...state.messages]
				newMessages[matchIdx] = merged
				return {
					...state,
					messages: newMessages,
					streamingMessageId:
						incoming.role === "assistant"
							? incoming.id
							: state.streamingMessageId,
				}
			}

			if (isUserMessage(incoming)) {
				const lastMsg = state.messages[state.messages.length - 1]
				if (lastMsg && isUserMessage(lastMsg)) {
					return state
				}
			}

			return {
				...state,
				messages: [...state.messages, incoming],
				streamingMessageId:
					incoming.role === "assistant"
						? incoming.id
						: state.streamingMessageId,
			}
		}
		case "MESSAGE_END": {
			if (!action.message?.id) {
				return { ...state, streamingMessageId: null }
			}
			const incoming = action.message
			const matchIdx = findMatchingMessageIndex(state.messages, incoming)

			if (matchIdx !== -1) {
				const existing = state.messages[matchIdx]
				const newContent =
					incoming.content && incoming.content.length > 0
						? incoming.content
						: existing.content
				const merged: Message = {
					...existing,
					...incoming,
					id: incoming.id,
					role: existing.role || incoming.role,
					content: newContent,
					durationMs: existing.durationMs ?? (incoming as any).durationMs,
					attachments: existing.attachments || incoming.attachments,
				}
				const newMessages = [...state.messages]
				newMessages[matchIdx] = merged
				return { ...state, messages: newMessages, streamingMessageId: null }
			}

			if (isUserMessage(incoming)) {
				const lastMsg = state.messages[state.messages.length - 1]
				if (lastMsg && isUserMessage(lastMsg)) {
					return { ...state, streamingMessageId: null }
				}
			}

			return {
				...state,
				messages: [...state.messages, incoming],
				streamingMessageId: null,
			}
		}
		case "TOOL_START": {
			const tools = new Map(state.tools)
			tools.set(action.id, {
				id: action.id,
				name: action.name,
				args: action.args,
				status: "running",
			})
			return { ...state, tools }
		}
		case "TOOL_UPDATE": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, { ...tool, result: action.partialResult })
			}
			return { ...state, tools }
		}
		case "TOOL_END": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, {
					...tool,
					result: action.result,
					isError: action.isError,
					status: action.isError ? "error" : "complete",
				})
			}
			return { ...state, tools }
		}
		case "SHELL_OUTPUT": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, {
					...tool,
					shellOutput: (tool.shellOutput ?? "") + action.output,
				})
			}
			return { ...state, tools }
		}
		case "SUBAGENT_START": {
			const subagents = new Map(state.subagents)
			subagents.set(action.toolCallId, {
				toolCallId: action.toolCallId,
				agentType: action.agentType,
				task: action.task,
				modelId: action.modelId,
				tools: [],
				status: "running",
			})
			return { ...state, subagents }
		}
		case "SUBAGENT_TOOL_START": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				subagents.set(action.toolCallId, {
					...sa,
					tools: [
						...sa.tools,
						{
							name: action.subToolName,
							args: action.subToolArgs,
							status: "running",
						},
					],
				})
			}
			return { ...state, subagents }
		}
		case "SUBAGENT_TOOL_END": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				const tools = sa.tools.map((t) =>
					t.name === action.subToolName && t.status === "running"
						? {
								...t,
								result: action.subToolResult,
								isError: action.isError,
								status: "complete" as const,
							}
						: t,
				)
				subagents.set(action.toolCallId, { ...sa, tools })
			}
			return { ...state, subagents }
		}
		case "SUBAGENT_END": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				subagents.set(action.toolCallId, {
					...sa,
					result: action.result,
					isError: action.isError,
					durationMs: action.durationMs,
					status: "complete",
				})
			}
			return { ...state, subagents }
		}
		case "SET_MESSAGES": {
			// If new message list is empty but state already has messages, avoid wiping out the active conversation.
			if (action.messages.length === 0 && state.messages.length > 0) {
				return state
			}

			const lastCurrent = state.messages[state.messages.length - 1]
			const hasPendingError =
				lastCurrent?.stopReason === "error" &&
				!action.messages.some((m) => m.id === lastCurrent.id)

			// Preserve ephemeral changedFiles and durationMs across message reload
			const existingChangedFilesById = new Map<
				string,
				Message["changedFiles"]
			>()
			let lastAssistantChangedFiles: Message["changedFiles"] | undefined

			// The DB has no duration column, so a reload would wipe the turn
			// duration that drives "Worked for 45s".
			const existingDurationById = new Map<string, number>()
			let lastAssistantDuration: number | undefined

			for (const m of state.messages) {
				if (m.changedFiles && m.changedFiles.length > 0) {
					if (m.id) existingChangedFilesById.set(m.id, m.changedFiles)
					if (m.role === "assistant") {
						lastAssistantChangedFiles = m.changedFiles
					}
				}
				if (m.role === "assistant" && m.durationMs != null) {
					if (m.id) existingDurationById.set(m.id, m.durationMs)
					lastAssistantDuration = m.durationMs
				}
			}

			const cleanedMessages: Message[] = []
			for (const m of action.messages) {
				if (isUserMessage(m) && cleanedMessages.length > 0) {
					const prev = cleanedMessages[cleanedMessages.length - 1]
					if (isUserMessage(prev)) {
						const prevText = getMessageText(prev)
						const currText = getMessageText(m)
						if (prevText && currText && prevText === currText) {
							continue
						}
					}
				}
				const preservedFiles =
					m.changedFiles || existingChangedFilesById.get(m.id)
				const preservedDuration = m.durationMs ?? existingDurationById.get(m.id)
				cleanedMessages.push({
					...m,
					...(preservedFiles ? { changedFiles: preservedFiles } : {}),
					...(preservedDuration != null
						? { durationMs: preservedDuration }
						: {}),
				})
			}

			// If no message in the new list has changedFiles, but the previous state had them on the last assistant message,
			// restore them to the new last assistant message
			if (
				lastAssistantChangedFiles &&
				!cleanedMessages.some(
					(m) => m.changedFiles && m.changedFiles.length > 0,
				)
			) {
				for (let i = cleanedMessages.length - 1; i >= 0; i--) {
					if (cleanedMessages[i].role === "assistant") {
						cleanedMessages[i] = {
							...cleanedMessages[i],
							changedFiles: lastAssistantChangedFiles,
						}
						break
					}
				}
			}

			// Same fallback for the turn duration when nobody matched by id
			if (
				lastAssistantDuration != null &&
				!cleanedMessages.some((m) => m.durationMs != null)
			) {
				for (let i = cleanedMessages.length - 1; i >= 0; i--) {
					if (cleanedMessages[i].role === "assistant") {
						cleanedMessages[i] = {
							...cleanedMessages[i],
							durationMs: lastAssistantDuration,
						}
						break
					}
				}
			}

			// A send shows up in the renderer before the harness has stored it, so
			// a reload that races the send (e.g. the queue draining while
			// agent_end reloads the thread) would drop the bubble the user just
			// sent. Re-append optimistic user messages the stored list lacks.
			const pendingUserMessages = state.messages.filter(
				(m) => isUserMessage(m) && String(m.id ?? "").startsWith("user-"),
			)
			if (pendingUserMessages.length > 0) {
				const storedTexts = new Set(
					cleanedMessages.filter(isUserMessage).map((m) => getMessageText(m)),
				)
				for (const pending of pendingUserMessages) {
					if (cleanedMessages.some((m) => m.id === pending.id)) continue
					if (storedTexts.has(getMessageText(pending))) continue
					cleanedMessages.push(pending)
				}
			}

			return {
				...state,
				messages: hasPendingError
					? [...cleanedMessages, lastCurrent]
					: cleanedMessages,
				tools: state.tools,
				subagents: state.subagents,
			}
		}
		case "SET_THREAD_QUEUE": {
			return {
				...state,
				queuesByThread: {
					...state.queuesByThread,
					[action.threadId]: action.queue,
				},
			}
		}
		case "ENQUEUE_MESSAGE": {
			const existing = state.queuesByThread[action.threadId] || []
			return {
				...state,
				queuesByThread: {
					...state.queuesByThread,
					[action.threadId]: [...existing, action.message],
				},
			}
		}
		case "DEQUEUE_MESSAGE":
		case "REMOVE_QUEUED_MESSAGE": {
			const existing = state.queuesByThread[action.threadId] || []
			return {
				...state,
				queuesByThread: {
					...state.queuesByThread,
					[action.threadId]: existing.filter((m) => m.id !== action.id),
				},
			}
		}
		case "REORDER_THREAD_QUEUE": {
			return {
				...state,
				queuesByThread: {
					...state.queuesByThread,
					[action.threadId]: action.queue,
				},
			}
		}
		case "CLEAR_THREAD_QUEUE": {
			return {
				...state,
				queuesByThread: {
					...state.queuesByThread,
					[action.threadId]: [],
				},
			}
		}
		case "SET_QUEUE_PAUSED": {
			return {
				...state,
				isQueuePaused: action.paused,
			}
		}
		case "CLEAR":
			return {
				...state,
				messages: [],
				isAgentActive: false,
				agentStartedAt: null,
				streamingMessageId: null,
				tools: new Map(),
				subagents: new Map(),
			}
		default:
			return state
	}
}

export const initialChatState: ChatState = {
	messages: [],
	isAgentActive: false,
	agentStartedAt: null,
	streamingMessageId: null,
	tools: new Map(),
	subagents: new Map(),
	queuesByThread: {},
	isQueuePaused: false,
}
