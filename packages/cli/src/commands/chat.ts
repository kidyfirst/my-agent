import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { getActiveClient } from "../client-runner.js"
import { createAgentHarness } from "@my-agent/core"

export async function handleChat(options: {
	contextId?: string
	mode?: string
}): Promise<void> {
	const rl = readline.createInterface({ input, output })
	const active = await getActiveClient()

	let threadId = options.contextId

	console.log("\n==========================================")
	console.log("       My Agent Interactive Chat          ")
	console.log("==========================================")
	console.log("Type your prompt and press Enter.")
	console.log("Special commands: /new (new thread), /exit (quit)\n")

	if (active) {
		console.log(`[Connected to Daemon at ${active.baseUrl}]`)
		if (!threadId) {
			const created = await active.client.createThread({ title: "CLI Chat" })
			threadId = created.threadId
		}
		console.log(`[Active Thread: ${threadId}]\n`)

		try {
			while (true) {
				const prompt = await rl.question("\nYou > ")
				const trimmed = prompt.trim()
				if (!trimmed) continue

				if (trimmed === "/exit" || trimmed === "/quit") {
					console.log("Bye!")
					break
				}

				if (trimmed === "/new") {
					const created = await active.client.createThread({
						title: "CLI Chat",
					})
					threadId = created.threadId
					console.log(`Switched to new thread: ${threadId}`)
					continue
				}

				process.stdout.write("\nAgent > ")
				try {
					const res = await active.client.sendMessage({
						contextId: threadId,
						message: { text: trimmed },
						mode: options.mode,
					})

					const text =
						res.message?.parts?.map((p: any) => p.text).join("") || ""
					console.log(text)
				} catch (err: any) {
					console.error(`\n[Error]: ${err.message}`)
				}
			}
		} finally {
			rl.close()
		}
		return
	}

	// In-process fallback when daemon is not running
	console.log(
		"[In-Process Mode: Daemon not running, initializing local engine...]",
	)
	const { harness } = await createAgentHarness({ cwd: process.cwd() })
	await harness.init()

	if (!threadId) {
		const created = await harness.createThread({ title: "CLI Chat" })
		threadId = created?.id || harness.getCurrentThreadId()
	}
	console.log(`[Active Thread: ${threadId}]\n`)

	// Event listener for streaming and tool calls
	harness.subscribe((event: any) => {
		if (event.type === "message_delta" || event.type === "delta") {
			process.stdout.write(event.delta || event.text || "")
		} else if (event.type === "tool_start" || event.type === "tool_call") {
			process.stdout.write(`\n[Tool: ${event.toolName || event.name}]... `)
		} else if (event.type === "tool_end" || event.type === "tool_result") {
			process.stdout.write(`✓\n`)
		}
	})

	try {
		while (true) {
			const prompt = await rl.question("\nYou > ")
			const trimmed = prompt.trim()
			if (!trimmed) continue

			if (trimmed === "/exit" || trimmed === "/quit") {
				console.log("Bye!")
				break
			}

			if (trimmed === "/new") {
				const created = await harness.createThread({ title: "CLI Chat" })
				threadId = created?.id || harness.getCurrentThreadId()
				console.log(`Switched to new thread: ${threadId}`)
				continue
			}

			process.stdout.write("\nAgent > ")
			try {
				await harness.sendMessage({
					content: trimmed,
					threadId,
				})
				console.log("\n")
			} catch (err: any) {
				console.error(`\n[Error]: ${err.message}\n`)
			}
		}
	} finally {
		rl.close()
	}
}
