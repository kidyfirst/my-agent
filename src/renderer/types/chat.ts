import type { Message } from "./ipc"

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
	| { type: "AGENT_END" }
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
		case "AGENT_END": {
			const durationMs = state.agentStartedAt
				? Date.now() - state.agentStartedAt
				: undefined
			const msgs = state.messages.map((m, idx) => {
				if (idx === state.messages.length - 1 && m.role === "assistant") {
					return { ...m, durationMs: m.durationMs ?? durationMs }
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
			if (action.message.role === "user") {
				const lastMsg = state.messages[state.messages.length - 1]
				if (lastMsg?.role === "user") {
					return state
				}
			}
			if (state.messages.some((m) => m.id === action.message.id)) {
				return {
					...state,
					messages: state.messages.map((m) =>
						m.id === action.message.id ? action.message : m,
					),
					streamingMessageId:
						action.message.role === "assistant" ? action.message.id : null,
				}
			}
			return {
				...state,
				messages: [...state.messages, action.message],
				streamingMessageId:
					action.message.role === "assistant" ? action.message.id : null,
			}
		}
		case "MESSAGE_UPDATE": {
			if (!action.message?.id) return state
			const exists = state.messages.some((m) => m.id === action.message.id)
			const msgs = exists
				? state.messages.map((m) => {
						if (m.id !== action.message.id) return m
						const newContent =
							action.message.content && action.message.content.length > 0
								? action.message.content
								: m.content
						return {
							...m,
							...action.message,
							role: m.role || action.message.role,
							content: newContent,
							durationMs: m.durationMs ?? (action.message as any).durationMs,
						}
					})
				: [...state.messages, action.message]
			return {
				...state,
				messages: msgs,
				streamingMessageId:
					action.message.role === "assistant"
						? action.message.id
						: state.streamingMessageId,
			}
		}
		case "MESSAGE_END": {
			if (!action.message?.id) {
				return { ...state, streamingMessageId: null }
			}
			const exists = state.messages.some((m) => m.id === action.message.id)
			const msgs = exists
				? state.messages.map((m) => {
						if (m.id !== action.message.id) return m
						const newContent =
							action.message.content && action.message.content.length > 0
								? action.message.content
								: m.content
						return {
							...m,
							...action.message,
							role: m.role || action.message.role,
							content: newContent,
							durationMs: m.durationMs ?? (action.message as any).durationMs,
						}
					})
				: [...state.messages, action.message]
			return { ...state, messages: msgs, streamingMessageId: null }
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
			const lastCurrent = state.messages[state.messages.length - 1]
			const hasPendingError =
				lastCurrent?.stopReason === "error" &&
				!action.messages.some((m) => m.id === lastCurrent.id)
			return {
				...state,
				messages: hasPendingError
					? [...action.messages, lastCurrent]
					: action.messages,
				tools: new Map(),
				subagents: new Map(),
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
