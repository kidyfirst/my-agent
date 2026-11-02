import { getActiveClient } from "../client-runner.js"
import { createAgentHarness } from "@my-agent/core"

export async function handleRun(
	prompt: string,
	options: { contextId?: string; mode?: string },
): Promise<void> {
	if (!prompt?.trim()) {
		console.error("Error: prompt cannot be empty.")
		process.exit(1)
	}

	const active = await getActiveClient()

	if (active) {
		console.log(`[Daemon] Sending task to daemon at ${active.baseUrl}...`)
		const task = await active.client.sendMessage({
			contextId: options.contextId,
			message: { text: prompt },
			mode: options.mode,
		})

		console.log(`\nAgent (${task.status}):`)
		const text = task.message?.parts?.map((p: any) => p.text).join("\n") || ""
		console.log(text)
		return
	}

	// In-process fallback
	console.log("[In-Process] Starting local agent execution...")
	const { harness } = await createAgentHarness({ cwd: process.cwd() })
	await harness.init()

	let threadId = options.contextId
	if (!threadId) {
		const created = await harness.createThread()
		threadId = created?.id || harness.getCurrentThreadId()
	}

	harness.subscribe((event: any) => {
		if (event.type === "message_delta" || event.type === "delta") {
			process.stdout.write(event.delta || event.text || "")
		} else if (event.type === "tool_start" || event.type === "tool_call") {
			console.log(`\n⚙️ Running tool: ${event.toolName || event.name}...`)
		}
	})

	await harness.sendMessage({
		content: prompt,
		threadId,
	})
	console.log("\n")
}
