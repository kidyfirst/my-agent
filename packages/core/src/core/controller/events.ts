/**
 * Types for the events a run streams to subscribers.
 *
 * These used to be `type HarnessEvent = any`, which meant a typo in an event
 * name or a field that was renamed reached the renderer silently and only
 * surfaced as a blank UI region. The union below is what the controller and the
 * subagent worker actually emit; adding a new event now fails the build until
 * it is listed.
 *
 * Trace fields are optional because they are stamped by `Controller.emit()`
 * from the ambient trace context rather than passed by each call site.
 */

export interface TraceStamp {
	/** Run this event belongs to. */
	traceId?: string
	/** Span within that run, for events emitted while a tool is executing. */
	spanId?: string
}

interface ThreadScoped {
	threadId?: string
}

export type MessageStartEvent = ThreadScoped &
	TraceStamp & {
		type: "message_start"
		id: string
		message: unknown
	}

export type MessageEndEvent = ThreadScoped &
	TraceStamp & {
		type: "message_end"
		id: string
		message: unknown
	}

export type MessageUpdateEvent = ThreadScoped &
	TraceStamp & {
		type: "message_update"
		id: string
		message: unknown
	}

export type ToolStartEvent = ThreadScoped &
	TraceStamp & {
		type: "tool_start"
		toolName: string
		toolCallId: string
		args: unknown
	}

export type ToolEndEvent = ThreadScoped &
	TraceStamp & {
		type: "tool_end"
		toolName: string
		toolCallId: string
		result: unknown
		isError: boolean
		durationMs?: number
	}

export type ToolApprovalRequiredEvent = ThreadScoped &
	TraceStamp & {
		type: "tool_approval_required"
		toolCallId: string
		toolName: string
		args: unknown
		category?: string
		categoryLabel?: string
	}

export type ToolApprovalResolvedEvent = ThreadScoped &
	TraceStamp & {
		type: "tool_approval_resolved"
		toolCallId: string
		decision: string
		feedback?: string
	}

export type AgentStartEvent = ThreadScoped &
	TraceStamp & {
		type: "agent_start"
		id: string
		runId: string
	}

export type AgentEndEvent = ThreadScoped &
	TraceStamp & {
		type: "agent_end"
		id: string
		runId: string
		durationMs?: number
		/** Present when the run ended because it threw. */
		error?: string
	}

export type RunErrorEvent = ThreadScoped &
	TraceStamp & {
		type: "error"
		error: { message: string }
	}

export type ModeChangedEvent = TraceStamp & {
	type: "mode_changed"
	modeId: string
}

export type ModelChangedEvent = TraceStamp & {
	type: "model_changed"
	modelId: string
}

export type PermissionModeChangedEvent = TraceStamp & {
	type: "permission_mode_changed"
	permissionMode: string
	rules?: unknown
}

export type ThreadCreatedEvent = TraceStamp & {
	type: "thread_created"
	thread: {
		id: string
		title?: string
		resourceId?: string
		createdAt?: Date | string
		updatedAt?: Date | string
		metadata?: unknown
	}
}

export type ThreadChangedEvent = TraceStamp & {
	type: "thread_changed"
	threadId: string
}

export type ThreadDeletedEvent = TraceStamp & {
	type: "thread_deleted"
	threadId: string
}

export type ThreadTitleUpdatedEvent = TraceStamp & {
	type: "thread_title_updated"
	threadId: string
	title: string
}

export type SessionReplayStoppedEvent = ThreadScoped &
	TraceStamp & { type: "session_replay_stopped" }

/**
 * Subagent lifecycle, emitted from the worker thread and forwarded to the host.
 * These were untyped for so long that no single place described their shape.
 */
export type SubagentStartEvent = TraceStamp & {
	type: "subagent_start"
	toolCallId: string
	agentType: string
	task: string
	modelId: string
}

export type SubagentTextDeltaEvent = TraceStamp & {
	type: "subagent_text_delta"
	toolCallId: string
	agentType: string
	textDelta: string
}

export type SubagentToolStartEvent = TraceStamp & {
	type: "subagent_tool_start"
	toolCallId: string
	agentType: string
	subToolName: string
	subToolArgs: unknown
}

export type SubagentToolEndEvent = TraceStamp & {
	type: "subagent_tool_end"
	toolCallId: string
	agentType: string
	subToolName: string
	subToolResult: unknown
	isError: boolean
}

export type SubagentEndEvent = TraceStamp & {
	type: "subagent_end"
	toolCallId: string
	agentType: string
	result: string
	isError: boolean
	durationMs: number
}

export type HarnessEvent =
	| MessageStartEvent
	| MessageEndEvent
	| MessageUpdateEvent
	| ToolStartEvent
	| ToolEndEvent
	| ToolApprovalRequiredEvent
	| ToolApprovalResolvedEvent
	| AgentStartEvent
	| AgentEndEvent
	| RunErrorEvent
	| ModeChangedEvent
	| ModelChangedEvent
	| PermissionModeChangedEvent
	| ThreadCreatedEvent
	| ThreadChangedEvent
	| ThreadDeletedEvent
	| ThreadTitleUpdatedEvent
	| SessionReplayStoppedEvent
	| SubagentStartEvent
	| SubagentTextDeltaEvent
	| SubagentToolStartEvent
	| SubagentToolEndEvent
	| SubagentEndEvent
