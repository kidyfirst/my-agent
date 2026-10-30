/**
 * Type definitions for the MCP (Model Context Protocol) client system.
 * Connects to external tool providers over Stdio or HTTP transports.
 */

export interface McpServerConfig {
	/** The command to launch the MCP server process */
	command?: string
	/** Arguments for the command */
	args?: string[]
	/** Environment variables to set for the server process */
	env?: Record<string, string>
	/** Working directory for the server process */
	cwd?: string
	/** URL for remote MCP server (HTTP / SSE) */
	url?: string
	/** Custom HTTP headers */
	headers?: Record<string, string>
}

export interface McpConfig {
	mcpServers?: Record<string, McpServerConfig>
}

export interface McpServerStatus {
	/** Server name (from config key) */
	name: string
	/** Whether the server is currently connected */
	connected: boolean
	/** Number of tools provided by this server */
	toolCount: number
	/** List of tool names provided */
	toolNames: string[]
	/** Error message if connection failed */
	error?: string
	/** Shipped with the app rather than declared in a config file */
	builtin?: boolean
	/** Display name for a built-in server */
	title?: string
	/** Remote endpoint, when the server is HTTP-based */
	url?: string
	/** One line for the settings row */
	description?: string
	/** Where the user creates a key */
	apiKeyUrl?: string
	docsUrl?: string
	/** Credential is already stored */
	hasApiKey?: boolean
	/**
	 * Built-in server that is listed but cannot connect yet because no API key
	 * was saved. Distinct from `error`: it is a to-do for the user, not a fault.
	 */
	needsApiKey?: boolean
}

export interface MCPClientOptions {
	id?: string
	servers: Record<string, McpServerConfig>
	timeout?: number
}

export interface MCPToolDefinition {
	name: string
	description?: string
	inputSchema?: Record<string, any>
	outputSchema?: Record<string, any>
	[key: string]: any
}

export interface CallToolResult {
	content?: Array<{
		type: string
		text?: string
		data?: string
		mimeType?: string
		[key: string]: any
	}>
	isError?: boolean
	structuredContent?: any
	[key: string]: any
}
