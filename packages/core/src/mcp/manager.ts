/**
 * MCPManager — high-level orchestration for MCP server connections.
 * Created once at startup, provides tools from connected MCP servers.
 *
 * Uses the native MCPClient (./client.ts) which handles per-server
 * connections and namespaces tools as serverName_toolName automatically.
 *
 * Built-in servers (builtin.ts) are part of the merged config, so they are
 * listed in Settings even before the user has a key. One without a key is never
 * dialed — a 401 from the endpoint says nothing the user can act on, while
 * "needs API key" tells them exactly what to do.
 */

import { MCPClient } from "./client.js"
import type { McpConfig, McpServerConfig, McpServerStatus } from "./types.js"
import {
	loadMcpConfig,
	getProjectMcpPath,
	getGlobalMcpPath,
	getClaudeSettingsPath,
	getUserDeclaredServerNames,
} from "./config.js"
import {
	BUILTIN_MCP_SERVERS,
	getBuiltinServer,
	loadBuiltinApiKeys,
} from "./builtin.js"

export class MCPManager {
	private config: McpConfig
	private projectDir: string
	private client: MCPClient | null = null
	private tools: Record<string, any> = {}
	private serverStatuses: Map<string, McpServerStatus> = new Map()
	private initialized = false
	/** Guards the lazy connect kicked off from `getTools()`. */
	private connecting = false
	/** Server names that came from the built-in list rather than a user file. */
	private builtinNames = new Set<string>()
	/** Injected keys (tests); otherwise read from settings on every load. */
	private apiKeysOverride?: Record<string, string>

	constructor(
		projectDir: string,
		options: { apiKeys?: Record<string, string> } = {},
	) {
		this.projectDir = projectDir
		this.apiKeysOverride = options.apiKeys
		this.config = this.readConfig()
		this.builtinNames = this.resolveBuiltinNames()
	}

	/** The merged config as it is on disk right now. */
	private readConfig(): McpConfig {
		return loadMcpConfig(this.projectDir, this.apiKeys())
	}

	/**
	 * Re-read the merged config — and the credentials it is generated from — off
	 * disk.
	 *
	 * The config is a snapshot: a key saved in Settings after this manager was
	 * created would otherwise be invisible to it, leaving the entry headerless,
	 * `needsApiKey` true and the server never dialed. That is what made a
	 * configured LangSearch still report "no API key" in a session that started
	 * before the key was saved.
	 */
	private refreshConfig(): void {
		this.config = this.readConfig()
		this.builtinNames = this.resolveBuiltinNames()
	}

	private apiKeys(): Record<string, string> {
		return this.apiKeysOverride ?? loadBuiltinApiKeys()
	}

	private resolveBuiltinNames(): Set<string> {
		let declared: Set<string>
		try {
			declared = getUserDeclaredServerNames(this.projectDir)
		} catch {
			declared = new Set()
		}
		return new Set(
			BUILTIN_MCP_SERVERS.map((s) => s.name).filter(
				(name) => !declared.has(name),
			),
		)
	}

	/**
	 * Connect to all configured MCP servers and collect their tools.
	 * Errors on individual servers are caught and logged, not thrown.
	 */
	async init(): Promise<void> {
		if (this.initialized) return

		const servers = this.config.mcpServers
		if (!servers || Object.keys(servers).length === 0) {
			this.initialized = true
			return
		}

		// Build server definitions for MCPClient. Pass the entries through as-is
		// so the native client can pick the right transport (command → stdio,
		// url → http).
		const serverDefs: Record<string, McpServerConfig> = {}
		for (const [name, cfg] of Object.entries(servers)) {
			// A built-in with no credential is listed but not usable; dialing it
			// would only produce an opaque 401.
			if (this.needsApiKey(name, cfg)) continue
			serverDefs[name] = {
				command: cfg.command,
				args: cfg.args,
				env: cfg.env,
				cwd: cfg.cwd,
				url: cfg.url,
				headers: cfg.headers,
			}
		}

		if (Object.keys(serverDefs).length === 0) {
			for (const [name, cfg] of Object.entries(servers)) {
				this.serverStatuses.set(name, this.waitingStatus(name, cfg))
			}
			this.initialized = true
			return
		}

		try {
			this.client = new MCPClient({
				id: "my-agent-mcp",
				servers: serverDefs,
			})

			// Connects to every server and returns namespaced tools
			// (serverName_toolName) alongside a per-server error map, so one
			// broken server does not hide the healthy ones.
			const { tools, errors } = await this.client.listToolsWithErrors()
			this.tools = tools

			// Derive per-server status from tool names
			for (const [name, cfg] of Object.entries(servers)) {
				if (this.needsApiKey(name, cfg)) {
					this.serverStatuses.set(name, this.waitingStatus(name, cfg))
					continue
				}
				const prefix = `${name}_`
				const serverToolNames = Object.keys(this.tools).filter((t) =>
					t.startsWith(prefix),
				)
				const error = errors[name]
				this.serverStatuses.set(name, {
					name,
					connected: !error,
					toolCount: serverToolNames.length,
					toolNames: serverToolNames,
					...this.describe(name, cfg),
					...(error ? { error } : {}),
				})
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)

			// If MCPClient throws at top level, mark all servers as failed
			for (const [name, cfg] of Object.entries(servers)) {
				this.serverStatuses.set(name, {
					name,
					connected: false,
					toolCount: 0,
					toolNames: [],
					...this.describe(name, cfg),
					error: this.needsApiKey(name, cfg) ? undefined : errMsg,
					...(this.needsApiKey(name, cfg) ? { needsApiKey: true } : {}),
				})
			}
		}

		this.initialized = true
	}

	/** Built-in server whose credential is missing. */
	private needsApiKey(name: string, cfg: McpServerConfig): boolean {
		if (!this.builtinNames.has(name)) return false
		const meta = getBuiltinServer(name)
		if (!meta) return false
		// A user-supplied header (in their own config) counts as configured.
		return !cfg.headers?.Authorization
	}

	/** Settings-facing metadata for a server entry. */
	private describe(
		name: string,
		cfg: McpServerConfig,
	): Partial<McpServerStatus> {
		const meta = getBuiltinServer(name)
		if (meta && this.builtinNames.has(name)) {
			return {
				builtin: true,
				title: meta.title,
				url: meta.url,
				description: meta.description,
				apiKeyUrl: meta.apiKeyUrl,
				docsUrl: meta.docsUrl,
				hasApiKey: Boolean(cfg.headers?.Authorization),
			}
		}
		return cfg.url ? { url: cfg.url } : {}
	}

	private waitingStatus(name: string, cfg: McpServerConfig): McpServerStatus {
		return {
			name,
			connected: false,
			toolCount: 0,
			toolNames: [],
			needsApiKey: true,
			...this.describe(name, cfg),
		}
	}

	/**
	 * Disconnect all servers, reload config from disk, reconnect.
	 */
	async reload(): Promise<void> {
		await this.disconnect()
		this.refreshConfig()
		this.tools = {}
		this.serverStatuses.clear()
		this.initialized = false
		await this.init()
	}

	/**
	 * Disconnect from all MCP servers and clean up.
	 */
	async disconnect(): Promise<void> {
		if (this.client) {
			try {
				await this.client.disconnect()
			} catch {
				// Ignore disconnect errors
			}
			this.client = null
		}
	}

	/**
	 * Get all tools from connected MCP servers.
	 * Returns a Record<string, ToolAction> compatible with MyAgent's agent tools.
	 * Tool names are serverName_toolName (namespaced by MCPClient).
	 */
	getTools(): Record<string, any> {
		// Not every session gets an explicit `init()` (only the first one and the
		// project switches do). Kicking the connection off here means such a
		// session still grows its MCP tools by the next turn instead of running
		// without them for its whole life.
		if (!this.initialized && !this.connecting) {
			this.connecting = true
			// Rebuild the config from disk before deciding what to dial: a key
			// saved since construction belongs in this very connection attempt.
			try {
				this.refreshConfig()
			} catch {
				// A broken config file must not break the turn; init() reports it.
			}
			void this.init().finally(() => {
				this.connecting = false
			})
		}
		return { ...this.tools }
	}

	/**
	 * Check if any MCP servers are configured.
	 */
	hasServers(): boolean {
		return (
			this.config.mcpServers !== undefined &&
			Object.keys(this.config.mcpServers).length > 0
		)
	}

	/**
	 * Get status of all servers.
	 */
	getServerStatuses(): McpServerStatus[] {
		return Array.from(this.serverStatuses.values())
	}

	/**
	 * Get config file paths for display.
	 */
	getConfigPaths(): { project: string; global: string; claude: string } {
		return {
			project: getProjectMcpPath(this.projectDir),
			global: getGlobalMcpPath(),
			claude: getClaudeSettingsPath(this.projectDir),
		}
	}

	/**
	 * Get the merged config.
	 */
	getConfig(): McpConfig {
		return this.config
	}
}
