/**
 * MCP server configuration loading from filesystem.
 * Loads from:
 *   0. Built-in servers shipped with the app  (defaults — lowest priority)
 *   1. .claude/settings.local.json  (Claude Code compat)
 *   2. ~/.myagent/mcp.json          (global)
 *   3. .myagent/mcp.json            (project — highest priority)
 *
 * Project overrides global by server name. Claude Code config is lowest user
 * priority; a built-in is only a fallback, so declaring the same name in any
 * user file replaces it outright.
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { McpConfig, McpServerConfig } from "./types.js"
import { buildBuiltinServerConfigs, loadBuiltinApiKeys } from "./builtin.js"

export function loadMcpConfig(
	projectDir: string,
	apiKeys: Record<string, string> = loadBuiltinApiKeys(),
): McpConfig {
	const builtinConfig: McpConfig = {
		mcpServers: buildBuiltinServerConfigs(apiKeys),
	}
	const claudeConfig = loadClaudeSettings(projectDir)
	const globalConfig = loadSingleConfig(getGlobalMcpPath())
	const projectConfig = loadSingleConfig(getProjectMcpPath(projectDir))

	return mergeConfigs(builtinConfig, claudeConfig, globalConfig, projectConfig)
}

/** Server names the user declared in a config file (i.e. not the built-in default). */
export function getUserDeclaredServerNames(projectDir: string): Set<string> {
	const names = new Set<string>()
	for (const config of [
		loadClaudeSettings(projectDir),
		loadSingleConfig(getGlobalMcpPath()),
		loadSingleConfig(getProjectMcpPath(projectDir)),
	]) {
		for (const name of Object.keys(config.mcpServers ?? {})) {
			names.add(name)
		}
	}
	return names
}

export function getProjectMcpPath(projectDir: string): string {
	return path.join(projectDir, ".myagent", "mcp.json")
}

export function getGlobalMcpPath(): string {
	return path.join(os.homedir(), ".myagent", "mcp.json")
}

export function getClaudeSettingsPath(projectDir: string): string {
	return path.join(projectDir, ".claude", "settings.local.json")
}

function loadSingleConfig(filePath: string): McpConfig {
	try {
		if (!fs.existsSync(filePath)) return {}
		const raw = fs.readFileSync(filePath, "utf-8")
		return validateConfig(JSON.parse(raw))
	} catch {
		return {}
	}
}

function loadClaudeSettings(projectDir: string): McpConfig {
	try {
		const filePath = getClaudeSettingsPath(projectDir)
		if (!fs.existsSync(filePath)) return {}
		const raw = fs.readFileSync(filePath, "utf-8")
		const parsed = JSON.parse(raw)
		// Claude Code stores mcpServers at the top level of settings
		if (parsed?.mcpServers && typeof parsed.mcpServers === "object") {
			return validateConfig({ mcpServers: parsed.mcpServers })
		}
		return {}
	} catch {
		return {}
	}
}

function validateConfig(raw: unknown): McpConfig {
	if (!raw || typeof raw !== "object") return {}
	const obj = raw as Record<string, unknown>

	if (!obj.mcpServers || typeof obj.mcpServers !== "object") return {}

	const servers: Record<string, McpServerConfig> = {}
	const rawServers = obj.mcpServers as Record<string, unknown>

	for (const [name, entry] of Object.entries(rawServers)) {
		if (isValidServerConfig(entry)) {
			const cfg = entry as Record<string, unknown>
			servers[name] = {
				command: typeof cfg.command === "string" ? cfg.command : undefined,
				args: Array.isArray(cfg.args) ? (cfg.args as string[]) : undefined,
				env:
					typeof cfg.env === "object" && cfg.env !== null
						? (cfg.env as Record<string, string>)
						: undefined,
				cwd: typeof cfg.cwd === "string" ? cfg.cwd : undefined,
				// Remote servers: the endpoint plus whatever header carries the
				// credential (LangSearch and friends use Authorization: Bearer).
				url: typeof cfg.url === "string" ? cfg.url : undefined,
				headers:
					typeof cfg.headers === "object" && cfg.headers !== null
						? (cfg.headers as Record<string, string>)
						: undefined,
			}
		}
	}

	if (Object.keys(servers).length === 0) return {}
	return { mcpServers: servers }
}

function isValidServerConfig(raw: unknown): boolean {
	if (!raw || typeof raw !== "object") return false
	const obj = raw as Record<string, unknown>
	// Either a local process to spawn or a remote endpoint to POST to.
	return typeof obj.command === "string" || typeof obj.url === "string"
}

/**
 * Merge configs: builtin (lowest) < claude < global < project (highest).
 * Later configs override earlier by server name.
 */
function mergeConfigs(...configs: McpConfig[]): McpConfig {
	const merged: Record<string, McpServerConfig> = {}

	for (const config of configs) {
		if (config.mcpServers) {
			for (const [name, server] of Object.entries(config.mcpServers)) {
				merged[name] = server
			}
		}
	}

	if (Object.keys(merged).length === 0) return {}
	return { mcpServers: merged }
}
