import { startDaemon } from "../daemon.js"

export async function handleServe(args: {
	port?: number
	host?: string
	cwd?: string
}): Promise<void> {
	await startDaemon({
		port: args.port,
		host: args.host,
		cwd: args.cwd,
	})
	// Keep event loop alive
	await new Promise(() => {})
}
