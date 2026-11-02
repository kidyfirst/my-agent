export type AssistantStreamRecord =
	// 连续 text-delta 聚合：dt[i] 是与前一条的毫秒间隔
	| { type: "text-chunks"; index: number; dt: number[]; texts: string[] }
	// DeepSeek reasoning_content 必须原样保留，否则回放会重构出错误请求
	| { type: "reasoning-chunks"; index: number; dt: number[]; texts: string[] }
	| {
			type: "tool-call-chunks"
			index: number
			dt: number[]
			ids: string[]
			names: string[]
			args: string[]
	  }
	// 其余低频 chunk 原样保留（block-start/end、finish、usage、error）
	| { type: "chunk"; chunk: unknown }

/**
 * Session configuration the user picked in the composer, captured per run so a
 * replay can restore the exact conditions the run happened under.
 *
 * Without it a replay ran with whatever model/mode/permission the *current*
 * session happened to have — plan mode would hide write tools the recording
 * used, "read-only" would deny commands the recording ran, "auto-approve"
 * would skip approval prompts the recording showed.
 */
export interface RecordedRuntime {
	/** Fully qualified model id, e.g. `deepseek/deepseek-flash`. */
	modelId?: string
	/** Execution mode id (react / plan / build ...). */
	modeId?: string
	/** `default` | `auto-approve` | `read-only` */
	permissionMode?: string
	thinkingLevel?: string
	/** Resolved gate rules — the effective policy per category, plus tool overrides. */
	permissionRules?: {
		categories?: Record<string, string>
		tools?: Record<string, string>
	}
	/**
	 * Session grants ("always allow this category / tool") that were active when
	 * the run started. Without them a replay re-asks for approvals the recorded
	 * run had already answered, and can stall waiting for a click.
	 */
	grants?: {
		categories?: string[]
		tools?: string[]
	}
}

export type SessionEvent =
	| {
			type: "session"
			version: 1
			id: string
			createdAt: number
			cwd: string
			model: string
			recording: "recorded" | "authored"
			runtime?: RecordedRuntime
	  }
	| {
			type: "run/start"
			data: {
				runId: string
				threadId: string
				systemPrompt: string
				userPrompt?: string
				tools: { name: string; descriptionHash: string }[]
				stepLimit: number
				runtime?: RecordedRuntime
			}
	  }
	| { type: "step/start"; data: { turn: number; step: number } }
	| {
			type: "assistant/stream"
			data: {
				turn: number
				step: number
				stream: AssistantStreamRecord[]
				finishReason: string | null
			}
	  }
	| {
			type: "tool/result"
			data: {
				turn: number
				step: number
				toolCallId: string
				toolName: string
				input: unknown
				output: unknown
				isError: boolean
			}
	  }
	| {
			type: "run/end"
			data: {
				status: "completed" | "aborted" | "error" | "step-limit"
				finishReason?: string | null
				error?: string
			}
	  }

export interface ReplayToolResult {
	turn: number
	step: number
	toolCallId: string
	toolName: string
	input: unknown
	output: unknown
	isError: boolean
}

export interface ReplayEntry {
	runId: string
	threadId: string
	turn: number
	step: number
	streamRecords: AssistantStreamRecord[]
	finishReason: string | null
	toolResults: ReplayToolResult[]
}

export interface ReplayScript {
	session?: {
		version: number
		id: string
		createdAt: number
		cwd: string
		model: string
		recording: "recorded" | "authored"
		runtime?: RecordedRuntime
	}
	systemPrompt?: string
	tools?: { name: string; descriptionHash: string }[]
	stepLimit?: number
	/** Runtime of the last run/start — overrides `session.runtime` when present. */
	runtime?: RecordedRuntime
	entries: ReplayEntry[]
}
