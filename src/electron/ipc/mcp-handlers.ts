import * as path from "path"
import * as fs from "fs"
import type { HandlerContext, IpcCommandHandler } from "./types.js"
import type { MCPManager } from "../../mcp/manager.js"
import { saveBuiltinApiKey, getBuiltinServer } from "../../mcp/builtin.js"

export function getMcpHandlers(): Record<string, IpcCommandHandler> {
	/**
	 * Reconnect every open project, not just the active one.
	 *
	 * A key is global, but each project path owns its own harness and manager.
	 * Reloading only the active session left every other open project holding a
	 * config snapshot without the credential: its server stayed "needs API key"
	 * for the rest of the app's life, and its turns reported no web access.
	 */
	const reloadAllSessions = async (ctx: HandlerContext) => {
		const managers = [
			...new Set(
				[...ctx.sessions.values()]
					.map((session) => session.mcpManager)
					.filter((manager): manager is MCPManager => Boolean(manager)),
			),
		]
		await Promise.all(
			managers.map((manager) =>
				manager.reload().catch((error) => {
					console.warn("[mcp] reload failed", error)
				}),
			),
		)
		return ctx.getActiveSession().mcpManager?.getServerStatuses() ?? []
	}

	return {
		getMcpStatuses: async (_command, ctx) => {
			return ctx.getActiveSession().mcpManager?.getServerStatuses() ?? []
		},
		getMcpConfig: async (_command, ctx) => {
			return (
				ctx.getActiveSession().mcpManager?.getConfig() ?? { mcpServers: {} }
			)
		},
		getMcpConfigPaths: async (_command, ctx) => {
			return (
				ctx.getActiveSession().mcpManager?.getConfigPaths() ?? {
					project: "",
					global: "",
				}
			)
		},
		reloadMcp: async (_command, ctx) => {
			return reloadAllSessions(ctx)
		},
		/**
		 * Store the API key for a built-in server and reconnect.
		 *
		 * The key lives in settings.json, not in mcp.json: the server entry itself
		 * is generated, so the only thing the user ever supplies is the credential.
		 * Empty key clears it.
		 */
		setMcpApiKey: async (command, ctx) => {
			if (!getBuiltinServer(command.serverName)) {
				throw new Error(`"${command.serverName}" is not a built-in server`)
			}
			saveBuiltinApiKey(command.serverName, String(command.apiKey ?? ""))
			return reloadAllSessions(ctx)
		},
		addMcpServer: async (command, ctx) => {
			const mcpManager = ctx.getActiveSession().mcpManager
			if (!mcpManager) return {}
			const configPath =
				command.scope === "global"
					? mcpManager.getConfigPaths().global
					: mcpManager.getConfigPaths().project
			const existing = (() => {
				try {
					if (fs.existsSync(configPath)) {
						return JSON.parse(fs.readFileSync(configPath, "utf-8"))
					}
				} catch {}
				return {}
			})()
			if (!existing.mcpServers) existing.mcpServers = {}
			existing.mcpServers[command.serverName] = {
				command: command.serverCommand,
				args: command.serverArgs ?? [],
				env: command.serverEnv ?? undefined,
			}
			const dir = path.dirname(configPath)
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(configPath, JSON.stringify(existing, null, 2))
			await mcpManager.reload()
			return mcpManager.getServerStatuses()
		},
		removeMcpServer: async (command, ctx) => {
			const mcpManager = ctx.getActiveSession().mcpManager
			if (!mcpManager) return {}
			for (const configPath of [
				mcpManager.getConfigPaths().project,
				mcpManager.getConfigPaths().global,
			]) {
				try {
					if (!fs.existsSync(configPath)) continue
					const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"))
					if (cfg.mcpServers?.[command.serverName]) {
						delete cfg.mcpServers[command.serverName]
						fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2))
					}
				} catch {}
			}
			await mcpManager.reload()
			return mcpManager.getServerStatuses()
		},
	}
}
