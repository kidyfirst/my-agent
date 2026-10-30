import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
import type { LanguageModelMiddleware } from "ai"
import type {
	AssistantStreamRecord,
	RecordedRuntime,
	SessionEvent,
} from "./types.js"

export function hashDescription(desc: string | object | undefined): string {
	const s = typeof desc === "string" ? desc : JSON.stringify(desc ?? "")
	return createHash("sha256").update(s).digest("hex").slice(0, 16)
}

interface ActiveAggregator {
	kind: "text" | "reasoning" | "tool-call"
	index: number
	dt: number[]
	texts?: string[]
	ids?: string[]
	names?: string[]
	args?: string[]
	lastTime: number
}

export interface SessionRecorderOptions {
	threadId: string
	runId: string
	sessionsDir: string
	cwd: string
	model: string
	recording?: "recorded" | "authored"
	/** Model / mode / permission the user had selected when this run started. */
	runtime?: RecordedRuntime
}

export class SessionRecorder {
	readonly threadId: string
	readonly runId: string
	readonly filePath: string
	private writeStream: fs.WriteStream | null = null
	private sessionHeaderWritten = false
	private currentStepRecords: AssistantStreamRecord[] = []
	private activeAggregator: ActiveAggregator | null = null
	private _isRecording = true
	private options: SessionRecorderOptions

	constructor(options: SessionRecorderOptions) {
		this.options = options
		this.threadId = options.threadId
		this.runId = options.runId

		const dir = path.join(options.sessionsDir, options.threadId)
		try {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}
		} catch (err) {
			console.error(`[SessionRecorder] Failed to create dir ${dir}:`, err)
		}

		this.filePath = path.join(dir, `${options.runId}.jsonl`)
		try {
			this.writeStream = fs.createWriteStream(this.filePath, {
				flags: "a",
				encoding: "utf8",
			})
			this.writeStream.on("error", (err) => {
				console.error(
					`[SessionRecorder] Write stream error on ${this.filePath}:`,
					err,
				)
			})
		} catch (err) {
			console.error(
				`[SessionRecorder] Failed to open stream for ${this.filePath}:`,
				err,
			)
		}
	}

	isRecording(): boolean {
		return this._isRecording && this.writeStream !== null
	}

	writeEvent(event: SessionEvent): void {
		if (!this.writeStream || this.writeStream.destroyed) return
		const line = JSON.stringify(event) + "\n"
		this.writeStream.write(line)
	}

	ensureSessionHeader(): void {
		if (this.sessionHeaderWritten) return
		this.sessionHeaderWritten = true
		this.writeEvent({
			type: "session",
			version: 1,
			id: this.runId,
			createdAt: Date.now(),
			cwd: this.options.cwd,
			model: this.options.model,
			recording: this.options.recording ?? "recorded",
			...(this.options.runtime ? { runtime: this.options.runtime } : {}),
		})
	}

	recordRunStart(data: {
		systemPrompt: string
		tools: { name: string; description?: string | object }[]
		stepLimit: number
		userPrompt?: string
		runtime?: RecordedRuntime
	}): void {
		this.ensureSessionHeader()
		this.writeEvent({
			type: "run/start",
			data: {
				runId: this.runId,
				threadId: this.threadId,
				systemPrompt: data.systemPrompt,
				userPrompt: data.userPrompt,
				tools: data.tools.map((t) => ({
					name: t.name,
					descriptionHash: hashDescription(t.description),
				})),
				stepLimit: data.stepLimit,
				...(data.runtime ? { runtime: data.runtime } : {}),
			},
		})
	}

	recordStepStart(turn: number, step: number): void {
		this.flushActiveAggregator()
		this.currentStepRecords = []
		this.writeEvent({
			type: "step/start",
			data: { turn, step },
		})
	}

	recordChunk(chunk: any): void {
		if (!this.isRecording() || !chunk) return
		const now = Date.now()

		if (chunk.type === "text-delta") {
			// The recorder sits on the *provider* stream (`wrapLanguageModel`), where
			// the AI SDK v5/v6 part shape is `{ type: "text-delta", id, delta }`.
			// Reading only `textDelta`/`text` stored an empty string for every
			// fragment, so recordings replayed as a blank conversation.
			const text = (chunk.delta ??
				chunk.textDelta ??
				chunk.text ??
				"") as string
			if (this.activeAggregator?.kind === "text") {
				const dt = now - this.activeAggregator.lastTime
				this.activeAggregator.lastTime = now
				this.activeAggregator.dt.push(dt)
				this.activeAggregator.texts!.push(text)
			} else {
				this.flushActiveAggregator()
				this.activeAggregator = {
					kind: "text",
					index: this.currentStepRecords.length,
					dt: [0],
					texts: [text],
					lastTime: now,
				}
			}
		} else if (
			chunk.type === "reasoning-delta" ||
			chunk.type === "reasoning" ||
			chunk.type === "reasoning-content"
		) {
			const text = (chunk.delta ??
				chunk.textDelta ??
				chunk.text ??
				"") as string
			if (this.activeAggregator?.kind === "reasoning") {
				const dt = now - this.activeAggregator.lastTime
				this.activeAggregator.lastTime = now
				this.activeAggregator.dt.push(dt)
				this.activeAggregator.texts!.push(text)
			} else {
				this.flushActiveAggregator()
				this.activeAggregator = {
					kind: "reasoning",
					index: this.currentStepRecords.length,
					dt: [0],
					texts: [text],
					lastTime: now,
				}
			}
		} else if (chunk.type === "tool-call") {
			const toolCallId = (chunk.toolCallId || "") as string
			const toolName = (chunk.toolName || "") as string
			// `input` is the v5/v6 field; `args` was the v4 name.
			const rawInput = chunk.input ?? chunk.args ?? {}
			const args =
				typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput)
			if (this.activeAggregator?.kind === "tool-call") {
				const dt = now - this.activeAggregator.lastTime
				this.activeAggregator.lastTime = now
				this.activeAggregator.dt.push(dt)
				this.activeAggregator.ids!.push(toolCallId)
				this.activeAggregator.names!.push(toolName)
				this.activeAggregator.args!.push(args)
			} else {
				this.flushActiveAggregator()
				this.activeAggregator = {
					kind: "tool-call",
					index: this.currentStepRecords.length,
					dt: [0],
					ids: [toolCallId],
					names: [toolName],
					args: [args],
					lastTime: now,
				}
			}
		} else {
			// Low-frequency chunk (e.g. finish, usage, error, block-start)
			this.flushActiveAggregator()
			this.currentStepRecords.push({
				type: "chunk",
				chunk,
			})
		}
	}

	private flushActiveAggregator(): void {
		if (!this.activeAggregator) return
		const active = this.activeAggregator
		this.activeAggregator = null

		if (active.kind === "text") {
			this.currentStepRecords.push({
				type: "text-chunks",
				index: active.index,
				dt: active.dt,
				texts: active.texts ?? [],
			})
		} else if (active.kind === "reasoning") {
			this.currentStepRecords.push({
				type: "reasoning-chunks",
				index: active.index,
				dt: active.dt,
				texts: active.texts ?? [],
			})
		} else if (active.kind === "tool-call") {
			this.currentStepRecords.push({
				type: "tool-call-chunks",
				index: active.index,
				dt: active.dt,
				ids: active.ids ?? [],
				names: active.names ?? [],
				args: active.args ?? [],
			})
		}
	}

	recordAssistantStream(data: {
		turn: number
		step: number
		finishReason: string | null
	}): void {
		this.flushActiveAggregator()
		this.writeEvent({
			type: "assistant/stream",
			data: {
				turn: data.turn,
				step: data.step,
				stream: [...this.currentStepRecords],
				finishReason: data.finishReason,
			},
		})
		this.currentStepRecords = []
	}

	recordToolResult(data: {
		turn: number
		step: number
		toolCallId: string
		toolName: string
		input: unknown
		output: unknown
		isError: boolean
	}): void {
		this.writeEvent({
			type: "tool/result",
			data,
		})
	}

	private closePromise: Promise<void> | null = null

	recordRunEnd(data: {
		status: "completed" | "aborted" | "error" | "step-limit"
		finishReason?: string | null
		error?: string
	}): void {
		this.flushActiveAggregator()
		this.writeEvent({
			type: "run/end",
			data,
		})
	}

	createWrapStreamMiddleware(): LanguageModelMiddleware["wrapStream"] {
		return async ({ doStream }) => {
			const { stream, ...rest } = await doStream()
			if (!this.isRecording()) {
				return { stream, ...rest }
			}
			return {
				...rest,
				stream: stream.pipeThrough(
					new TransformStream({
						transform: (chunk, controller) => {
							try {
								this.recordChunk(chunk)
							} catch (e) {
								console.error("[SessionRecorder] Error recording chunk:", e)
							}
							controller.enqueue(chunk)
						},
					}),
				),
			}
		}
	}

	async close(): Promise<void> {
		if (this.closePromise) return this.closePromise
		this._isRecording = false
		this.flushActiveAggregator()
		if (!this.writeStream) return Promise.resolve()
		const ws = this.writeStream
		this.writeStream = null
		this.closePromise = new Promise((resolve) => {
			ws.end(() => resolve())
		})
		return this.closePromise
	}
}
