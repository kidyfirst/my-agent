import { readDaemonInfo } from "../daemon.js"
import { getActiveClient } from "../client-runner.js"

export async function handleStatus(): Promise<void> {
	const info = readDaemonInfo()
	const active = await getActiveClient()

	console.log("\n--- My Agent Status ---")
	if (info && active) {
		console.log("Status:     🟢 DAEMON RUNNING")
		console.log(`PID:        ${info.pid}`)
		console.log(`Port:       ${info.port}`)
		console.log(`Host:       ${info.host}`)
		console.log(`Endpoint:   ${info.baseUrl}/a2a`)
		console.log(`Agent Card: ${info.baseUrl}/.well-known/agent-card.json`)
		console.log(`Workspace:  ${info.cwd}`)
		console.log(`Started:    ${info.startedAt}`)
	} else {
		console.log("Status:     ⚪ DAEMON NOT RUNNING")
		console.log("To start daemon: my-agent serve")
	}
	console.log("-----------------------\n")
}
