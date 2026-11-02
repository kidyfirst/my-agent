import { handleServe } from "./commands/serve.js"
import { handleRun } from "./commands/run.js"
import { handleChat } from "./commands/chat.js"
import { handleProject } from "./commands/project.js"
import { handleThread } from "./commands/thread.js"
import { handleStatus } from "./commands/status.js"

export async function runCli(
	argv: string[] = process.argv.slice(2),
): Promise<void> {
	const command = argv[0]

	switch (command) {
		case "serve": {
			const portIdx = argv.indexOf("--port")
			const port = portIdx !== -1 ? parseInt(argv[portIdx + 1], 10) : undefined
			const hostIdx = argv.indexOf("--host")
			const host = hostIdx !== -1 ? argv[hostIdx + 1] : undefined
			await handleServe({ port, host })
			break
		}

		case "chat": {
			await handleChat({})
			break
		}

		case "run": {
			const prompt = argv[1]
			await handleRun(prompt, {})
			break
		}

		case "project": {
			const subcommand = argv[1] || "list"
			await handleProject(subcommand, argv.slice(2))
			break
		}

		case "thread": {
			const subcommand = argv[1] || "list"
			await handleThread(subcommand, argv.slice(2))
			break
		}

		case "status": {
			await handleStatus()
			break
		}

		case "--version":
		case "-v":
			console.log("my-agent v0.1.3")
			break

		case "--help":
		case "-h":
		default:
			printHelp()
			break
	}
}

function printHelp(): void {
	console.log(`
My Agent CLI (v0.1.3)
Autonomous full-stack code engineering & A2A daemon

Usage:
  my-agent <command> [options]

Commands:
  serve                      Start the A2A server and agent daemon
    --port <number>          Port to listen on (default: 3888)
    --host <string>          Host to bind (default: 127.0.0.1)

  chat                       Start an interactive terminal conversation session
  run "<prompt>"             Execute a task with the agent
  project [list|create|open] Manage workspaces and recent projects
  thread [list|create|get]   Manage agent conversation sessions
  status                     Display daemon health and endpoint status
  --help, -h                 Show help
  --version, -v              Show version
`)
}
