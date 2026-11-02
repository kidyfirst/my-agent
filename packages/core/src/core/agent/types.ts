export type MessageRole = "user" | "assistant" | "system" | "signal" | "tool"

export interface MyAgentMessagePart {
	type: string
	text?: string
	toolName?: string
	args?: unknown
	result?: unknown
	isError?: boolean
	[key: string]: unknown
}

export interface MyAgentMessageContentV2 {
	format: 2
	parts: MyAgentMessagePart[]
	content?: string
	toolInvocations?: unknown[]
	reasoning?: unknown
	experimental_attachments?: unknown[]
	metadata?: Record<string, unknown>
	[key: string]: unknown
}

export interface MyAgentDBMessage {
	id: string
	role: MessageRole
	createdAt: Date
	threadId?: string
	resourceId?: string
	type?: string
	content: MyAgentMessageContentV2
	durationMs?: number
	[key: string]: unknown
}
