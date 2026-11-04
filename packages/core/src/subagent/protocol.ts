/**
 * Protocol and message contracts between the Main Process (Host)
 * and Subagent Worker threads/processes.
 */
import type { HarnessEvent } from "../harness/index.js"
/**
 * Serialisable description of the model the host resolved for a subagent run.
 *
 * The host's resolver is a closure over its request context and cannot be
 * structured-cloned across a thread boundary, so the resolved model config is
 * snapshotted into this shape instead and rebuilt inside the worker.
 */
export interface ResolvedModelSnapshot {
	modelId: string
	provider?: string
	modelName?: string
	baseURL?: string
}

export interface WorkerInitPayload {
	toolCallId: string
	agentType: string
	task: string
	modelId: string
	/** Resolved model config so the worker does not fall back to a bare `{ id }`. */
	model?: ResolvedModelSnapshot
	projectRoot?: string
	allowedTools: string[]
	/** Timeout in milliseconds before forceful termination */
	timeoutMs?: number
}

export interface WorkerToolInvokePayload {
	callId: string
	toolName: string
	args: Record<string, unknown>
}

export interface HostToolResultPayload {
	callId: string
	result?: unknown
	isError?: boolean
	error?: string
}

export interface WorkerDonePayload {
	toolCallId: string
	agentType: string
	resultText: string
	toolCallLog: Array<{ name: string; isError?: boolean }>
	durationMs: number
	meta: string
	isError: boolean
}

/** Messages sent from Main (Host) -> Worker */
export type HostToWorkerMessage =
	| { type: "INIT"; payload: WorkerInitPayload }
	| { type: "ABORT"; payload: { toolCallId: string; reason?: string } }
	| { type: "TOOL_RESULT"; payload: HostToolResultPayload }

/** Messages sent from Worker -> Main (Host) */
export type WorkerToHostMessage =
	| { type: "READY"; payload: { toolCallId: string } }
	| { type: "EVENT"; payload: { toolCallId: string; event: HarnessEvent } }
	| { type: "TOOL_INVOKE"; payload: WorkerToolInvokePayload }
	| { type: "DONE"; payload: WorkerDonePayload }
	| {
			type: "ERROR"
			payload: { toolCallId: string; error: string; partialText?: string }
	  }
