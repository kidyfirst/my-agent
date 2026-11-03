import path from "node:path"
import { getActiveClient } from "../client-runner.js"
import { loadRecentProjects, saveRecentProject } from "@my-agent/core"

export async function handleProject(
	subcommand: string,
	args: string[],
): Promise<void> {
	const active = await getActiveClient()

	switch (subcommand) {
		case "list": {
			if (active) {
				const res = await active.client.listProjects()
				console.log("\nRecent Projects (via Daemon):")
				for (const p of res.projects) {
					const activeMarker = p.isActive ? " (Active)" : ""
					console.log(`  • ${p.name}${activeMarker}: ${p.rootPath}`)
				}
			} else {
				const recent = loadRecentProjects()
				console.log("\nRecent Projects (Local):")
				for (const p of recent) {
					console.log(
						`  • ${p.name || path.basename(p.rootPath)}: ${p.rootPath}`,
					)
				}
			}
			break
		}

		case "create": {
			const projectPath = args[0]
			if (!projectPath) {
				console.error(
					"Usage: my-agent project create <path> [--name <name>] [--git]",
				)
				process.exit(1)
			}

			const absPath = path.resolve(projectPath)
			if (active) {
				const res = await active.client.createProject({
					path: absPath,
					initGit: args.includes("--git"),
				})
				console.log(`Project created successfully: ${res.project.rootPath}`)
			} else {
				saveRecentProject(absPath, path.basename(absPath))
				console.log(`Project registered: ${absPath}`)
			}
			break
		}

		case "open": {
			const projectPath = args[0]
			if (!projectPath) {
				console.error("Usage: my-agent project open <path>")
				process.exit(1)
			}

			const absPath = path.resolve(projectPath)
			if (active) {
				await active.client.openProject(absPath)
				console.log(`Project opened in daemon: ${absPath}`)
			} else {
				saveRecentProject(absPath, path.basename(absPath))
				console.log(`Project set as active: ${absPath}`)
			}
			break
		}

		default:
			console.log(
				"Usage: my-agent project [list | create <path> | open <path>]",
			)
			break
	}
}
