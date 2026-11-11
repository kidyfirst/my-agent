#!/usr/bin/env node

import { createAgentHarness } from "@my-agent/core"
import { startA2AServer } from "../src/index.js"

const port = Number(
	process.env.A2A_PORT ||
		process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ||
		3888,
)
const host =
	process.env.A2A_HOST ||
	process.argv.find((a) => a.startsWith("--host="))?.split("=")[1] ||
	"127.0.0.1"

async function main() {
	const result = await createAgentHarness({ cwd: process.cwd() })
	const harness = result.harness
	await harness.init()

	console.log(`[A2A Server] Starting on http://${host}:${port}...`)
	const server = await startA2AServer({ harness, port, host })
	console.log(`[A2A Server] Ready! Listening at: ${server.baseUrl}`)

	const cleanup = async () => {
		console.log("\n[A2A Server] Stopping...")
		await server.close()
		process.exit(0)
	}

	process.on("SIGINT", cleanup)
	process.on("SIGTERM", cleanup)
}

main().catch((err) => {
	console.error("[A2A Server Error]:", err)
	process.exit(1)
})
