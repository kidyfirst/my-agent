import { getActiveClient } from "../client-runner.js"
import { createAgentHarness } from "@my-agent/core"

export async function handleThread(
	subcommand: string,
	args: string[],
): Promise<void> {
	const active = await getActiveClient()

	if (!active) {
		console.log("No running daemon detected. Launching in-process engine...")
		const { harness } = await createAgentHarness({ cwd: process.cwd() })
		await harness.init()

		switch (subcommand) {
			case "list": {
				const threads = await harness.listThreads()
				console.log("\nThreads (Local):")
				for (const t of threads) {
					console.log(`  • [${t.id}] ${t.title || "Untitled"}`)
				}
				break
			}
			case "create": {
				const title = args[0] || "CLI Session"
				const t = await harness.createThread({ title })
				console.log(`Thread created: [${t?.id}] ${t?.title}`)
				break
			}
			case "delete": {
				const threadId = args[0]
				if (!threadId) {
					console.error("Usage: my-agent thread delete <threadId>")
					process.exit(1)
				}
				await harness.deleteThread({ threadId })
				console.log(`Thread deleted: ${threadId}`)
				break
			}
			default:
				console.log(
					"Usage: my-agent thread [list | create <title> | delete <threadId>]",
				)
				break
		}
		return
	}

	// Active daemon mode
	switch (subcommand) {
		case "list": {
			const res = await active.client.listThreads()
			console.log(`\nThreads for [${res.resourceId}]:`)
			for (const t of res.threads) {
				console.log(`  • [${t.id}] ${t.title}`)
			}
			break
		}
		case "create": {
			const title = args[0] || "CLI Session"
			const res = await active.client.createThread({ title })
			console.log(`Thread created in daemon: [${res.threadId}] ${res.title}`)
			break
		}
		case "get": {
			const threadId = args[0]
			if (!threadId) {
				console.error("Usage: my-agent thread get <threadId>")
				process.exit(1)
			}
			const res = await active.client.call("threads/get", { threadId })
			console.log(`\nMessages for thread [${threadId}]:`)
			for (const m of res.messages || []) {
				const role = m.role?.toUpperCase() || "UNKNOWN"
				const text =
					typeof m.content === "string" ? m.content : JSON.stringify(m.content)
				console.log(`[${role}]: ${text}\n`)
			}
			break
		}
		case "delete": {
			const threadId = args[0]
			if (!threadId) {
				console.error("Usage: my-agent thread delete <threadId>")
				process.exit(1)
			}
			await active.client.call("threads/delete", { threadId })
			console.log(`Thread deleted: ${threadId}`)
			break
		}
		default:
			console.log(
				"Usage: my-agent thread [list | create <title> | get <threadId> | delete <threadId>]",
			)
			break
	}
}
