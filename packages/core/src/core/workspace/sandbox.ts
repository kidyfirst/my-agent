import path from "node:path"
import { spawn } from "node:child_process"

export interface LocalSandboxOptions {
	workingDirectory: string
	env?: Record<string, string | undefined>
}

export interface CommandResult {
	exitCode: number
	stdout: string
	stderr: string
}

export class LocalSandbox {
	workingDirectory: string
	env: Record<string, string | undefined>

	constructor(options: LocalSandboxOptions) {
		this.workingDirectory = path.resolve(options.workingDirectory)
		this.env = options.env ?? { ...process.env }
	}

	async executeCommand(
		command: string,
		args: string[] = [],
		options?: { cwd?: string; env?: Record<string, string | undefined> },
	): Promise<CommandResult> {
		return new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: options?.cwd ?? this.workingDirectory,
				env: { ...this.env, ...options?.env } as NodeJS.ProcessEnv,
				shell: true,
			})

			let stdout = ""
			let stderr = ""

			child.stdout?.on("data", (data) => {
				stdout += data.toString()
			})

			child.stderr?.on("data", (data) => {
				stderr += data.toString()
			})

			child.on("error", (err) => {
				reject(err)
			})

			child.on("close", (code) => {
				resolve({
					exitCode: code ?? 0,
					stdout,
					stderr,
				})
			})
		})
	}
}
