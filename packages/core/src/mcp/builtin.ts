/**
 * MCP servers that ship with MyAgent.
 *
 * These are not written into any config file: the manager layers them under the
 * user's own `mcp.json` entries and the settings store holds only the credential.
 * A user who wants a different endpoint (or no LangSearch at all) can declare a
 * `langsearch` entry themselves — their config wins and the built-in default is
 * dropped.
 *
 * Every built-in is a hosted HTTP endpoint, so "configured" means one API key,
 * and "not configured" means the server is listed but never dialed.
 */

import { loadSettings, saveSettings } from "../harness/settings.js"
import type { McpServerConfig } from "./types.js"

export interface BuiltinMcpServer {
	/** Key in the `mcpServers` map. */
	name: string
	/** Human label used in Settings and in the system prompt. */
	title: string
	/** Remote MCP endpoint (streamable HTTP). */
	url: string
	/** Where the user creates a key. */
	apiKeyUrl: string
	docsUrl: string
	/** One line describing what the server gives the agent. */
	description: string
	/** Header the key is sent in. */
	authHeader: (apiKey: string) => Record<string, string>
}

export const BUILTIN_MCP_SERVERS: BuiltinMcpServer[] = [
	{
		name: "langsearch",
		title: "LangSearch",
		url: "https://mcp.langsearch.com/mcp",
		apiKeyUrl: "https://langsearch.com/dashboard",
		docsUrl: "https://docs.langsearch.com/integrations/mcp",
		description:
			"Web search and page extraction, so the agent can answer from current sources instead of guessing.",
		authHeader: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
	},
]

export function getBuiltinServer(name: string): BuiltinMcpServer | undefined {
	return BUILTIN_MCP_SERVERS.find((server) => server.name === name)
}

/**
 * Stored keys, read fresh from disk.
 *
 * Deliberately not cached: a key saved in Settings must reach the next MCP
 * reload (and the next system prompt) without a restart.
 */
export function loadBuiltinApiKeys(): Record<string, string> {
	try {
		const keys = loadSettings().mcp?.apiKeys
		if (!keys || typeof keys !== "object") return {}
		const cleaned: Record<string, string> = {}
		for (const [name, value] of Object.entries(keys)) {
			if (typeof value === "string" && value.trim()) {
				cleaned[name] = value.trim()
			}
		}
		return cleaned
	} catch {
		return {}
	}
}

/** Save (or, with an empty value, clear) the key for one built-in server. */
export function saveBuiltinApiKey(name: string, apiKey: string): void {
	const settings = loadSettings()
	const keys = { ...(settings.mcp?.apiKeys ?? {}) }
	const trimmed = apiKey.trim()
	if (trimmed) {
		keys[name] = trimmed
	} else {
		delete keys[name]
	}
	settings.mcp = { ...settings.mcp, apiKeys: keys }
	saveSettings(settings)
}

/**
 * Config entries for the built-ins, keyed by server name.
 *
 * A server without a key still gets an entry — with no Authorization header — so
 * it shows up in Settings as "needs API key" instead of silently not existing.
 */
export function buildBuiltinServerConfigs(
	apiKeys: Record<string, string> = loadBuiltinApiKeys(),
): Record<string, McpServerConfig> {
	const configs: Record<string, McpServerConfig> = {}
	for (const server of BUILTIN_MCP_SERVERS) {
		// A pasted key often carries a stray space; it would break the header.
		const key = apiKeys[server.name]?.trim()
		configs[server.name] = {
			url: server.url,
			...(key ? { headers: server.authHeader(key) } : {}),
		}
	}
	return configs
}

/**
 * Built-ins that are listed but unusable because the user never supplied a key.
 * The system prompt uses this to tell the model how to point the user at them.
 */
export function builtinServersNeedingSetup(
	apiKeys: Record<string, string> = loadBuiltinApiKeys(),
): BuiltinMcpServer[] {
	return BUILTIN_MCP_SERVERS.filter((server) => !apiKeys[server.name])
}
