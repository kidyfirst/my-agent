import { A2AClient } from "@my-agent/a2a"
import { readDaemonInfo } from "./daemon.js"

export async function getActiveClient(
	targetPort?: number,
): Promise<{ client: A2AClient; isDaemon: boolean; baseUrl: string } | null> {
	const daemon = readDaemonInfo()
	const port = targetPort || daemon?.port || 3888
	const host = daemon?.host || "127.0.0.1"
	const baseUrl = `http://${host}:${port}`

	try {
		const res = await fetch(`${baseUrl}/health`, {
			signal: AbortSignal.timeout(1000),
		})
		if (res.ok) {
			const client = new A2AClient({ baseUrl })
			return { client, isDaemon: true, baseUrl }
		}
	} catch {}

	return null
}
