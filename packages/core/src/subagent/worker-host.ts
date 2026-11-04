/**
 * Host-side manager for Subagent Workers.
 *
 * Runs in the Main process (Electron / CLI), responsible for:
 * - Spawning and lifecycle management of Worker threads
 * - Synchronizing initial context (model, task, workspace, tools) via Handshake
 * - Real-time forwarding of stream events to Harness / Frontend UI
 * - Sub-millisecond abort signal synchronization and forceful teardown on timeout
 * - RPC bridging for host-bound sensitive tools (e.g. approval-required commands)
 * - Process crash isolation to guarantee the main Electron app never crashes
 */
import { Worker } from "node:worker_threads"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { logger } from "../core/logger/index.js"
import { RequestContext } from "../core/context/request-context.js"
import type { HarnessRequestContext } from "../harness/index.js"
import type {
	HostToWorkerMessage,
	WorkerToHostMessage,
	WorkerInitPayload,
	WorkerDonePayload,
	ResolvedModelSnapshot,
} from "./protocol.js"
import {
	SubagentWorkerExecutor,
	type WorkerChannel,
} from "./worker-executor.js"

export interface SubagentTaskParams {
	toolCallId: string
	agentType: string
	task: string
	modelId: string
	projectRoot?: string
	allowedTools: string[]
	timeoutMs?: number
}

export interface SubagentHostDeps {
	/** Registry of host-side tools available for RPC proxying */
	tools?: Record<string, any>
	/** Model resolver function */
	resolveModel?: (modelId: string) => any
	/** Run mode: "worker" (isolated thread) or "direct" (in-process fallback) */
	mode?: "worker" | "direct"
}

export class SubagentWorkerHost {
	private deps: SubagentHostDeps

	constructor(deps: SubagentHostDeps = {}) {
		this.deps = deps
	}

	/**
	 * Executes a subagent task using either an isolated Worker thread (default)
	 * or direct execution mode.
	 */
	async execute(
		params: SubagentTaskParams,
		harnessContext?: HarnessRequestContext,
		rawRequestContext?: any,
	): Promise<{ content: string; isError: boolean }> {
		const mode = this.deps.mode || "worker"

		if (mode === "direct") {
			return this.executeDirect(params, harnessContext, rawRequestContext)
		}

		return this.executeInWorkerThread(params, harnessContext, rawRequestContext)
	}

	/**
	 * Direct in-process execution (used as fallback or for lightweight unit tests).
	 */
	private async executeDirect(
		params: SubagentTaskParams,
		harnessContext?: HarnessRequestContext,
		rawRequestContext?: any,
	): Promise<{ content: string; isError: boolean }> {
		let hostHandler: ((msg: HostToWorkerMessage) => void) | undefined

		const workerChannel: WorkerChannel = {
			postMessage: (msg: WorkerToHostMessage) => {
				this.handleWorkerMessage(
					msg,
					(toWorker) => hostHandler?.(toWorker),
					harnessContext,
					rawRequestContext,
				)
			},
			onMessage: (handler) => {
				hostHandler = handler
			},
		}

		const executor = new SubagentWorkerExecutor(
			workerChannel,
			this.deps.resolveModel,
		)

		return new Promise((resolve) => {
			const toolCallId = params.toolCallId

			// Wire abort signal
			if (harnessContext?.abortSignal) {
				const onAbort = () => {
					hostHandler?.({
						type: "ABORT",
						payload: { toolCallId, reason: "Aborted by user" },
					})
				}
				if (harnessContext.abortSignal.aborted) {
					onAbort()
				} else {
					harnessContext.abortSignal.addEventListener("abort", onAbort, {
						once: true,
					})
				}
			}

			// Intercept DONE message
			const originalPost = workerChannel.postMessage
			workerChannel.postMessage = (msg: WorkerToHostMessage) => {
				if (msg.type === "DONE" && msg.payload.toolCallId === toolCallId) {
					resolve({
						content: msg.payload.resultText + msg.payload.meta,
						isError: msg.payload.isError,
					})
				} else if (
					msg.type === "ERROR" &&
					msg.payload.toolCallId === toolCallId
				) {
					resolve({
						content: `Subagent failed: ${msg.payload.error}`,
						isError: true,
					})
				}
				originalPost(msg)
			}

			// Send INIT
			hostHandler?.({
				type: "INIT",
				payload: {
					toolCallId: params.toolCallId,
					agentType: params.agentType,
					task: params.task,
					modelId: params.modelId,
					projectRoot: params.projectRoot,
					allowedTools: params.allowedTools,
					timeoutMs: params.timeoutMs,
				},
			})
		})
	}

	/**
	 * Reduces the host's resolved model to something that survives
	 * `postMessage`. AI SDK model instances carry provider clients and closures
	 * that fail structured cloning, so only the identifying fields are carried
	 * across and the worker rebuilds a config object from them.
	 */
	private snapshotModel(modelId: string): ResolvedModelSnapshot | undefined {
		if (!this.deps.resolveModel) return undefined

		let resolved: any
		try {
			resolved = this.deps.resolveModel(modelId)
		} catch (err) {
			logger.warn(
				"subagent",
				"Model resolver threw while snapshotting for worker",
				{
					modelId,
					error: err instanceof Error ? err.message : String(err),
				},
			)
			return undefined
		}
		if (!resolved) return undefined

		const snapshot: ResolvedModelSnapshot = { modelId }
		for (const key of ["provider", "modelName", "baseURL"] as const) {
			const value = resolved?.[key]
			if (typeof value === "string") snapshot[key] = value
		}
		return snapshot
	}

	/**
	 * Resolves candidate URLs for the subagent worker entry point.
	 * Checks compiled artifacts first (subagent-worker.cjs), followed by
	 * bundled scripts and source files across both dev and production layouts.
	 */
	private entryCandidates(): URL[] {
		const out: URL[] = []
		const checkedPaths = new Set<string>()

		const addCandidate = (filePath: string) => {
			if (!filePath || checkedPaths.has(filePath)) return
			checkedPaths.add(filePath)
			if (existsSync(filePath)) {
				out.push(pathToFileURL(filePath))
			}
		}

		// 1. Probing relative to import.meta.url (covers dist/main/ or direct execution)
		try {
			const metaDir = dirname(fileURLToPath(import.meta.url))
			for (const name of [
				"subagent-worker.cjs",
				"subagent-worker.js",
				"worker-entry.cjs",
				"worker-entry.js",
				"worker-entry.ts",
			]) {
				addCandidate(resolve(metaDir, name))
			}
		} catch {}

		// 2. Probing standard dist/main output directory
		const cwd = process.cwd()
		addCandidate(resolve(cwd, "dist/main/subagent-worker.cjs"))
		addCandidate(resolve(cwd, "dist/main/subagent-worker.js"))

		// 3. Probing source tree in workspace (for dev / test environments)
		addCandidate(resolve(cwd, "packages/core/src/subagent/worker-entry.ts"))
		addCandidate(resolve(cwd, "packages/core/src/subagent/worker-entry.js"))

		// 4. Probing relative to __dirname if available
		if (typeof __dirname === "string") {
			for (const name of [
				"subagent-worker.cjs",
				"subagent-worker.js",
				"worker-entry.cjs",
				"worker-entry.js",
				"worker-entry.ts",
			]) {
				addCandidate(resolve(__dirname, name))
			}
		}

		return out
	}

	/**
	 * `execArgv` a Worker needs to import the entry point when the host runs from
	 * TypeScript source. A built package resolves `.cjs`/`.js` directly and gets an empty array.
	 */
	private sourceExecArgv(entry: URL): string[] {
		const pathname = entry.pathname
		if (pathname.endsWith(".cjs") || pathname.endsWith(".js")) return []

		const hook = new URL("./ts-resolve-register.mjs", import.meta.url)
		if (!existsSync(fileURLToPath(hook))) return []

		// `--experimental-transform-types` rather than `--experimental-strip-types`:
		// the latter only erases types and throws on the TypeScript `enum`s this
		// package relies on.
		return [
			"--experimental-transform-types",
			"--no-warnings",
			"--import",
			hook.href,
		]
	}

	private async executeInWorkerThread(
		params: SubagentTaskParams,
		harnessContext?: HarnessRequestContext,
		rawRequestContext?: any,
	): Promise<{ content: string; isError: boolean }> {
		const {
			toolCallId,
			agentType,
			task,
			modelId,
			projectRoot,
			allowedTools,
			timeoutMs,
		} = params

		return new Promise<{ content: string; isError: boolean }>((resolve) => {
			let isResolved = false
			const safeResolve = (res: { content: string; isError: boolean }) => {
				if (!isResolved) {
					isResolved = true
					cleanup()
					resolve(res)
				}
			}
			let worker: Worker | null = null
			let abortCleanup: (() => void) | null = null

			const cleanup = () => {
				if (abortCleanup) {
					abortCleanup()
					abortCleanup = null
				}
				if (worker) {
					try {
						worker.terminate().catch(() => {})
					} catch {}
					worker = null
				}
			}
			const [entry] = this.entryCandidates()
			if (!entry) {
				logger.warn(
					"subagent",
					"No worker entry point found, falling back to direct mode",
					{
						toolCallId,
					},
				)
				return this.executeDirect(
					params,
					harnessContext,
					rawRequestContext,
				).then(safeResolve)
			}

			try {
				worker = new Worker(entry, {
					execArgv: this.sourceExecArgv(entry),
				})
			} catch (err) {
				logger.warn(
					"subagent",
					"Failed to spawn Worker thread, falling back to direct mode",
					{
						error: err instanceof Error ? err.message : String(err),
					},
				)
				// Fallback gracefully to direct execution
				return this.executeDirect(
					params,
					harnessContext,
					rawRequestContext,
				).then(safeResolve)
			}

			// Wire message handling
			worker.on("message", (msg: WorkerToHostMessage) => {
				if (!worker) return

				if (msg.type === "DONE" && msg.payload.toolCallId === toolCallId) {
					safeResolve({
						content: msg.payload.resultText + msg.payload.meta,
						isError: msg.payload.isError,
					})
					return
				}

				if (msg.type === "ERROR" && msg.payload.toolCallId === toolCallId) {
					safeResolve({
						content: `Subagent failed: ${msg.payload.error}`,
						isError: true,
					})
					return
				}

				this.handleWorkerMessage(
					msg,
					(reply) => worker?.postMessage(reply),
					harnessContext,
					rawRequestContext,
				)
			})

			worker.on("error", (err: unknown) => {
				const errMsg = err instanceof Error ? err.message : String(err)
				logger.error("subagent", "Subagent worker thread error", {
					toolCallId,
					error: errMsg,
				})
				safeResolve({
					content: `Subagent worker crashed: ${errMsg}`,
					isError: true,
				})
			})

			worker.on("exit", (exitCode) => {
				if (exitCode !== 0 && !isResolved) {
					logger.warn(
						"subagent",
						"Subagent worker thread exited with non-zero code",
						{
							toolCallId,
							exitCode,
						},
					)
					safeResolve({
						content: `Subagent worker exited unexpectedly with code ${exitCode}`,
						isError: true,
					})
				}
			})

			// Wire Abort Signal for instant cancellation
			if (harnessContext?.abortSignal) {
				const onAbort = () => {
					if (!worker) return
					worker.postMessage({
						type: "ABORT",
						payload: { toolCallId, reason: "Aborted by user" },
					} as HostToWorkerMessage)

					// Forceful kill if worker fails to stop gracefully within 2 seconds
					setTimeout(() => {
						if (!isResolved && worker) {
							logger.warn(
								"subagent",
								"Forcefully terminating unresponsive worker thread",
								{
									toolCallId,
								},
							)
							cleanup()
							safeResolve({
								content: "[Aborted by user]",
								isError: false,
							})
						}
					}, 2000).unref()
				}

				if (harnessContext.abortSignal.aborted) {
					onAbort()
				} else {
					harnessContext.abortSignal.addEventListener("abort", onAbort, {
						once: true,
					})
					abortCleanup = () => {
						harnessContext.abortSignal?.removeEventListener("abort", onAbort)
					}
				}
			}
			// Send INIT context to Worker
			const initMessage: HostToWorkerMessage = {
				type: "INIT",
				payload: {
					toolCallId,
					agentType,
					task,
					modelId,
					model: this.snapshotModel(modelId),
					projectRoot,
					allowedTools,
					timeoutMs,
				},
			}
			worker.postMessage(initMessage)
		})
	}

	private createToolRequestContext(
		harnessContext?: HarnessRequestContext,
		rawRequestContext?: any,
	): any {
		if (rawRequestContext && typeof rawRequestContext.get === "function") {
			return rawRequestContext
		}
		if (harnessContext && typeof (harnessContext as any).get === "function") {
			return harnessContext
		}
		if (
			(harnessContext as any)?.requestContext &&
			typeof (harnessContext as any).requestContext.get === "function"
		) {
			return (harnessContext as any).requestContext
		}
		const rc = new RequestContext()
		if (harnessContext) {
			rc.set("controller", harnessContext)
			rc.set("harness", harnessContext)
			if ((harnessContext as any).session) {
				rc.set("session", (harnessContext as any).session)
			}
		}
		return rc
	}

	private async handleWorkerMessage(
		msg: WorkerToHostMessage,
		sendToWorker: (reply: HostToWorkerMessage) => void,
		harnessContext?: HarnessRequestContext,
		rawRequestContext?: any,
	) {
		switch (msg.type) {
			case "EVENT":
				// Forward stream event directly to UI / Harness
				harnessContext?.emitEvent?.(msg.payload.event)
				break

			case "TOOL_INVOKE": {
				const { callId, toolName, args } = msg.payload
				const tool = this.deps.tools?.[toolName]

				if (!tool || typeof tool.execute !== "function") {
					sendToWorker({
						type: "TOOL_RESULT",
						payload: {
							callId,
							isError: true,
							error: `Tool ${toolName} not found on host`,
						},
					})
					return
				}

				try {
					const reqContext = this.createToolRequestContext(
						harnessContext,
						rawRequestContext,
					)
					const result = await tool.execute(args, {
						requestContext: reqContext,
						toolCallId: callId,
					})
					sendToWorker({
						type: "TOOL_RESULT",
						payload: {
							callId,
							result,
							isError: false,
						},
					})
				} catch (err) {
					sendToWorker({
						type: "TOOL_RESULT",
						payload: {
							callId,
							isError: true,
							error: err instanceof Error ? err.message : String(err),
						},
					})
				}
				break
			}
		}
	}
}
