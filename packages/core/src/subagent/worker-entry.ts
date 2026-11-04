/**
 * Worker thread entry point for Subagent execution.
 *
 * Previously the host spawned the executor from an `eval: true` bootstrap
 * string. That made the executor path invisible to bundlers and left the
 * thread with no way to register a TypeScript resolver, so nothing imported by
 * this module could load when the package ran from source. A real entry file
 * fixes both: the bundler can see it, and `execArgv` on the Worker constructor
 * installs the `.js` -> `.ts` hook before anything is imported.
 */
import { parentPort } from "node:worker_threads"
import {
	SubagentWorkerExecutor,
	type WorkerChannel,
} from "./worker-executor.js"

const port = parentPort
if (!port) {
	throw new Error("worker-entry must be loaded as a Worker thread")
}

const channel: WorkerChannel = {
	postMessage: (msg) => port.postMessage(msg),
	onMessage: (handler) => port.on("message", handler),
}

// The host's model resolver closes over its request context and cannot cross a
// thread boundary, so it sends the already-resolved model instead. The executor
// reads that snapshot off the INIT payload, which is why no resolver is passed
// here — passing one would shadow the snapshot with a bare `{ id }`.
new SubagentWorkerExecutor(channel)
