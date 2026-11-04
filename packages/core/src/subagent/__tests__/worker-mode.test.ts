/**
 * Integration tests for the REAL worker-thread path.
 *
 * `worker-host.test.ts` covers `mode: "direct"`, which runs the executor on the
 * main thread so `Agent.prototype.stream` can be spied on. That means the actual
 * `new Worker(...)` path — the one production uses, since `subagent.ts` defaults
 * to "worker" outside VITEST — has no coverage at all. These tests exercise it.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { Worker } from "node:worker_threads"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { SubagentWorkerHost } from "../worker-host.js"

const ENTRY = new URL("../worker-entry.ts", import.meta.url)
const HOOK = new URL("../ts-resolve-register.mjs", import.meta.url)

describe("SubagentWorkerHost — worker thread mode", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("resolves a real .ts worker entry and its loader hook", () => {
		// The bootstrap used to be an `eval: true` string that `require`d the
		// emitted `.js` at a path which does not exist in a source checkout, so
		// the thread threw before `new Worker` was reached and the direct-mode
		// fallback could not run either. Both files must be present on disk for
		// the real entry point to be usable at all.
		expect(existsSync(fileURLToPath(ENTRY))).toBe(true)
		expect(existsSync(fileURLToPath(HOOK))).toBe(true)
	})

	it("boots a worker thread from the entry file", async () => {
		// Proves the thread starts, the entry module loads, and the module graph
		// reaches at least the worker-local code. Under vitest's own transform
		// pipeline the deeper dependency graph (LSP client, `vscode-jsonrpc`)
		// still hits CommonJS type-export edges, so this asserts thread startup
		// rather than a full task run.
		const error = await new Promise<string | null>((resolve) => {
			const worker = new Worker(ENTRY, {
				execArgv: [
					"--experimental-transform-types",
					"--no-warnings",
					"--import",
					HOOK.href,
				],
			})
			const timer = setTimeout(() => resolve("timeout"), 15_000)
			worker.on("error", (err) => {
				clearTimeout(timer)
				resolve(err instanceof Error ? err.message : String(err))
			})
			worker.on("exit", () => {
				clearTimeout(timer)
				resolve(null)
			})
			// No INIT is sent, so a healthy worker simply waits for one.
			setTimeout(() => {
				clearTimeout(timer)
				void worker.terminate()
				resolve(null)
			}, 1_500).unref()
		})

		expect(error).toBeNull()
	}, 20_000)

	it("surfaces a worker-side failure as an error result instead of throwing", async () => {
		// Whatever goes wrong inside the thread, the host must convert it into an
		// `isError` result. Letting it throw would take down the main process,
		// which is the whole reason this path exists.
		const host = new SubagentWorkerHost({ tools: {}, mode: "worker" })

		const result = await host.execute({
			toolCallId: "tc-unknown-agent",
			agentType: "does-not-exist",
			task: "noop",
			modelId: "anthropic/claude-sonnet-4-5",
			allowedTools: [],
			timeoutMs: 5_000,
		})

		expect(result.isError).toBe(true)
		expect(typeof result.content).toBe("string")
		expect(result.content.length).toBeGreaterThan(0)
	}, 30_000)
})
