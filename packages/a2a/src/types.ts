/**
 * A2A (Agent-to-Agent) Protocol Types (Specification v1.0)
 */

export interface AgentCard {
	name: string
	description: string
	version: string
	provider?: {
		organization: string
		url?: string
	}
	supportedInterfaces: Array<{
		url: string
		protocolBinding: "JSON-RPC" | "HTTP+JSON" | "gRPC"
		protocolVersion: "1.0"
	}>
	capabilities: {
		streaming: boolean
		pushNotifications?: boolean
		extendedAgentCard?: boolean
		humanInTheLoop?: boolean
		stateTransitionHistory?: boolean
	}
	defaultInputModes: string[]
	defaultOutputModes: string[]
	skills: Array<AgentSkill>
	securitySchemes?: Record<string, any>
	security?: Array<Record<string, string[]>>
}

export interface AgentSkill {
	id: string
	name: string
	description: string
	inputModes?: string[]
	outputModes?: string[]
	parameters?: Record<string, any>
}

export type A2ATaskStatus =
	| "SUBMITTED"
	| "WORKING"
	| "INPUT_REQUIRED"
	| "COMPLETED"
	| "FAILED"
	| "CANCELLED"

export interface A2AMessagePart {
	type: "text" | "thinking" | "tool_call" | "tool_result" | "image" | "file"
	text?: string
	toolCallId?: string
	name?: string
	args?: Record<string, any>
	result?: any
	mimeType?: string
	data?: string
}

export interface A2AMessage {
	role: "user" | "agent" | "system"
	parts: A2AMessagePart[]
	createdAt?: string
}

export interface A2ATask {
	taskId: string
	contextId: string
	status: A2ATaskStatus
	message?: A2AMessage
	pendingApprovals?: Array<{
		approvalId: string
		toolName: string
		args?: any
		description?: string
	}>
	error?: string
	createdAt: string
	updatedAt: string
}

export interface JSONRPCRequest<T = any> {
	jsonrpc: "2.0"
	id: string | number
	method: string
	params?: T
}

export interface JSONRPCResponse<T = any> {
	jsonrpc: "2.0"
	id: string | number
	result?: T
	error?: {
		code: number
		message: string
		data?: any
	}
}
