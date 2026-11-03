import fs from "node:fs"
import path from "node:path"
import { createAgentHarness, getAppDataDir } from "@my-agent/core"
import { startA2AServer, type A2AServerInstance } from "@my-agent/a2a"

export interface DaemonInfo {
	pid: number
	port: number
	host: string
	baseUrl: string
	cwd: string
	startedAt: string
}

export function getDaemonFilePath(): string {
	return path.join(getAppDataDir(), "daemon.json")
}

export function readDaemonInfo(): DaemonInfo | null {
	try {
		const filePath = getDaemonFilePath()
		if (!fs.existsSync(filePath)) return null
		const content = fs.readFileSync(filePath, "utf-8")
		const data = JSON.parse(content) as DaemonInfo
		// Check if process is still running
		try {
			process.kill(data.pid, 0)
			return data
		} catch {
			// Process died without cleanup
			try {
				fs.unlinkSync(filePath)
			} catch {}
			return null
		}
	} catch {
		return null
	}
}

export function writeDaemonInfo(info: DaemonInfo): void {
	const filePath = getDaemonFilePath()
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, JSON.stringify(info, null, 2))
}

export function removeDaemonInfo(): void {
	try {
		const filePath = getDaemonFilePath()
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath)
		}
	} catch {}
}

export interface StartDaemonOptions {
	port?: number
	host?: string
	cwd?: string
}

export async function startDaemon(
	options: StartDaemonOptions = {},
): Promise<{ server: A2AServerInstance; harness: any }> {
	const port = options.port || 3888
	const host = options.host || "127.0.0.1"
	const cwd = options.cwd || process.cwd()

	console.log(`[My Agent Daemon] Initializing agent core engine at ${cwd}...`)
	const result = await createAgentHarness({ cwd })
	const harness = result.harness
	await harness.init()

	console.log(
		`[My Agent Daemon] Starting A2A protocol server on http://${host}:${port}...`,
	)
	const server = await startA2AServer({
		harness,
		port,
		host,
	})

	const daemonInfo: DaemonInfo = {
		pid: process.pid,
		port: server.port,
		host: server.host,
		baseUrl: server.baseUrl,
		cwd,
		startedAt: new Date().toISOString(),
	}
	writeDaemonInfo(daemonInfo)

	const cleanup = async () => {
		console.log("\n[My Agent Daemon] Shutting down...")
		removeDaemonInfo()
		await server.close()
		process.exit(0)
	}

	process.on("SIGINT", cleanup)
	process.on("SIGTERM", cleanup)

	console.log(`[My Agent Daemon] Ready!`)
	console.log(`  - A2A Endpoint:  ${server.baseUrl}/a2a`)
	console.log(
		`  - Agent Card:    ${server.baseUrl}/.well-known/agent-card.json`,
	)
	console.log(`  - SSE Stream:    ${server.baseUrl}/a2a/stream`)
	console.log(`  - Health Check:  ${server.baseUrl}/health`)

	return { server, harness }
}
