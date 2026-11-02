/**
 * Native MCP (Model Context Protocol) Client implementation.
 *
 * Provides connection management and tool discovery/execution for:
 *   - Stdio transport: Local processes spawned via child_process.spawn
 *   - HTTP transport: Remote MCP endpoints via HTTP POST JSON-RPC
 *
 * Implements the standard MCP JSON-RPC 2.0 lifecycle:
 *   1. initialize handshake
 *   2. notifications/initialized
 *   3. tools/list discovery
 *   4. tools/call execution
 */

import { spawn, type ChildProcess } from "node:child_process"
import { jsonSchema } from "ai"
import { z } from "zod"
import { createTool, type Tool } from "../core/tools/index.js"
import type {
	McpServerConfig,
	MCPClientOptions,
	MCPToolDefinition,
	CallToolResult,
} from "./types.js"

const DEFAULT_TIMEOUT_MS = 60_000
const PROTOCOL_VERSION = "2024-11-05"

/**
 * Returns safe environment variables for child processes.
 */
function getDefaultEnvironment(): Record<string, string> {
	const isWindows = process.platform === "win32"
	const defaultKeys = isWindows
		? [
				"APPDATA",
				"HOMEDRIVE",
				"HOMEPATH",
				"LOCALAPPDATA",
				"PATH",
				"PROCESSOR_ARCHITECTURE",
				"SYSTEMDRIVE",
				"SYSTEMROOT",
				"TEMP",
				"USERNAME",
				"USERPROFILE",
				"PROGRAMFILES",
			]
		: ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"]

	const env: Record<string, string> = {}
	for (const key of defaultKeys) {
		const val = process.env[key]
		if (val !== undefined && !val.startsWith("()")) {
			env[key] = val
		}
	}
	if (process.env.NODE_ENV) env.NODE_ENV = process.env.NODE_ENV
	if (process.env.LANG) env.LANG = process.env.LANG
	return env
}

/**
 * Converts a raw MCP JSON Schema into an object compatible with
 * AI SDK, Zod, and StandardSchema.
 */
function convertInputSchema(inputSchema: any): any {
	if (!inputSchema || typeof inputSchema !== "object") {
		return z.object({}).passthrough()
	}
	const schemaObj =
		"jsonSchema" in inputSchema ? inputSchema.jsonSchema : inputSchema

	try {
		const aiSchema = jsonSchema(schemaObj)
		return {
			...aiSchema,
			"~standard": {
				version: 1,
				vendor: "myagent",
				validate: (val: any) => ({ value: val }),
			},
			parse: (val: any) => val,
			jsonSchema: schemaObj,
		}
	} catch {
		return z.object({}).passthrough()
	}
}

interface PendingRequest {
	resolve: (value: any) => void
	reject: (error: Error) => void
	timer: NodeJS.Timeout
}

/**
 * Represents a live connection to a single MCP server.
 */
interface IMCPConnection {
	connect(): Promise<void>
	listTools(): Promise<MCPToolDefinition[]>
	callTool(name: string, args: any): Promise<CallToolResult>
	disconnect(): Promise<void>
	isConnected(): boolean
}

/**
 * Stdio-based MCP server connection (local subprocess).
 */
class StdioConnection implements IMCPConnection {
	private name: string
	private config: McpServerConfig
	private timeout: number
	private process?: ChildProcess
	private nextId = 1
	private pendingRequests = new Map<string | number, PendingRequest>()
	private buffer = ""
	private connected = false
	private closed = false
	private stderrBuffer = ""

	constructor(name: string, config: McpServerConfig, timeout: number) {
		this.name = name
		this.config = config
		this.timeout = timeout
	}

	isConnected(): boolean {
		return this.connected && !this.closed
	}

	async connect(): Promise<void> {
		if (this.connected) return
		if (!this.config.command) {
			throw new Error(`MCP server "${this.name}" missing command`)
		}

		const mergedEnv = {
			...getDefaultEnvironment(),
			...process.env,
			...this.config.env,
		}

		const child = spawn(this.config.command, this.config.args || [], {
			stdio: ["pipe", "pipe", "pipe"],
			cwd: this.config.cwd || process.cwd(),
			env: mergedEnv,
		})

		this.process = child

		child.stdout?.on("data", (chunk: Buffer) => {
			this.buffer += chunk.toString("utf-8")
			let newlineIndex: number
			while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
				const line = this.buffer.slice(0, newlineIndex).trim()
				this.buffer = this.buffer.slice(newlineIndex + 1)
				if (!line) continue

				try {
					const msg = JSON.parse(line)
					this.handleMessage(msg)
				} catch {
					// Ignore non-JSON output from child process
				}
			}
		})

		child.stderr?.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf-8")
			this.stderrBuffer = (this.stderrBuffer + str).slice(-4096)
		})

		child.on("error", (err) => {
			this.connected = false
			this.rejectAllPending(
				new Error(
					`MCP server "${this.name}" process error: ${err.message}${
						this.stderrBuffer ? `\nStderr: ${this.stderrBuffer}` : ""
					}`,
				),
			)
		})

		child.on("close", (code) => {
			this.connected = false
			this.closed = true
			if (this.pendingRequests.size > 0) {
				this.rejectAllPending(
					new Error(
						`MCP server "${this.name}" exited with code ${code}${
							this.stderrBuffer ? `\nStderr: ${this.stderrBuffer}` : ""
						}`,
					),
				)
			}
		})

		// Perform handshake
		try {
			await this.request("initialize", {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: {
					name: "my-agent",
					version: "1.0.0",
				},
			})

			this.notify("notifications/initialized", {})
			this.connected = true
		} catch (err: any) {
			await this.disconnect()
			throw new Error(
				`MCP server "${this.name}" initialization failed: ${err.message}${
					this.stderrBuffer ? `\nStderr: ${this.stderrBuffer}` : ""
				}`,
			)
		}
	}

	private handleMessage(msg: any): void {
		if (msg && typeof msg === "object" && msg.id !== undefined) {
			const pending = this.pendingRequests.get(msg.id)
			if (pending) {
				this.pendingRequests.delete(msg.id)
				clearTimeout(pending.timer)
				if (msg.error) {
					const message =
						typeof msg.error === "object" && msg.error.message
							? msg.error.message
							: JSON.stringify(msg.error)
					pending.reject(new Error(message))
				} else {
					pending.resolve(msg.result)
				}
			}
		}
	}

	private request(method: string, params: any): Promise<any> {
		if (this.closed) {
			return Promise.reject(
				new Error(`MCP server "${this.name}" connection closed`),
			)
		}

		const id = this.nextId++
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(id)
				reject(
					new Error(
						`MCP server "${this.name}" request '${method}' (id ${id}) timed out after ${this.timeout}ms`,
					),
				)
			}, this.timeout)

			this.pendingRequests.set(id, { resolve, reject, timer })

			const payload = JSON.stringify({
				jsonrpc: "2.0",
				id,
				method,
				params,
			})

			try {
				this.process?.stdin?.write(payload + "\n")
			} catch (err: any) {
				this.pendingRequests.delete(id)
				clearTimeout(timer)
				reject(err)
			}
		})
	}

	private notify(method: string, params?: any): void {
		if (this.closed || !this.process?.stdin?.writable) return
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			method,
			...(params ? { params } : {}),
		})
		try {
			this.process.stdin.write(payload + "\n")
		} catch {}
	}

	private rejectAllPending(err: Error): void {
		for (const [id, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timer)
			pending.reject(err)
		}
		this.pendingRequests.clear()
	}

	async listTools(): Promise<MCPToolDefinition[]> {
		const res = await this.request("tools/list", {})
		return Array.isArray(res?.tools) ? res.tools : []
	}

	async callTool(name: string, args: any): Promise<CallToolResult> {
		const res = await this.request("tools/call", {
			name,
			arguments: args || {},
		})
		return res || {}
	}

	async disconnect(): Promise<void> {
		this.closed = true
		this.connected = false
		this.rejectAllPending(new Error("Connection disconnected"))

		if (this.process) {
			const p = this.process
			this.process = undefined
			try {
				p.stdin?.end()
			} catch {}

			try {
				p.kill("SIGTERM")
			} catch {}

			await new Promise<void>((resolve) => {
				const check = setTimeout(() => {
					try {
						p.kill("SIGKILL")
					} catch {}
					resolve()
				}, 500)
				p.once("close", () => {
					clearTimeout(check)
					resolve()
				})
			})
		}
	}
}

/**
 * HTTP-based MCP server connection.
 *
 * Speaks the Streamable HTTP transport, which is what hosted MCP endpoints
 * (LangSearch, and the reference servers behind most vendors) actually require:
 *
 *   - `Accept` must list both `application/json` and `text/event-stream`,
 *     otherwise the endpoint answers 406.
 *   - The server may reply with a single JSON body *or* an SSE stream; both are
 *     valid answers to the same request.
 *   - `initialize` may hand back an `Mcp-Session-Id` header that every later
 *     request has to repeat, and a negotiated protocol version that has to be
 *     sent as `MCP-Protocol-Version`.
 *
 * A plain "POST JSON, read JSON" client works against none of that, which is why
 * this class parses SSE frames and carries the session forward.
 */
class HttpConnection implements IMCPConnection {
	private name: string
	private config: McpServerConfig
	private timeout: number
	private nextId = 1
	private connected = false
	private sessionId?: string
	private protocolVersion = PROTOCOL_VERSION

	constructor(name: string, config: McpServerConfig, timeout: number) {
		this.name = name
		this.config = config
		this.timeout = timeout
	}

	isConnected(): boolean {
		return this.connected
	}

	private headers(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			"MCP-Protocol-Version": this.protocolVersion,
			...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
			...this.config.headers,
		}
	}

	/** Pull the JSON-RPC payload with `id` out of an SSE response. */
	private async readSse(res: Response, id: number): Promise<any> {
		const body = res.body
		if (!body) return undefined

		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		const events: { event?: string; data: string }[] = []

		while (true) {
			const { value, done } = await reader.read()
			if (value) buffer += decoder.decode(value, { stream: true })
			if (done) buffer += decoder.decode()

			// Frames are separated by a blank line; an event can span many data lines.
			let sep: number
			while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
				const rawFrame = buffer.slice(0, sep)
				buffer = buffer.slice(sep + (buffer[sep] === "\r" ? 4 : 2))
				let event: string | undefined
				const dataLines: string[] = []
				for (const line of rawFrame.split(/\r?\n/)) {
					if (line.startsWith("event:")) event = line.slice(6).trim()
					else if (line.startsWith("data:"))
						dataLines.push(line.slice(5).trim())
				}
				if (dataLines.length > 0) {
					events.push({ event, data: dataLines.join("\n") })
				}
			}

			for (const frame of events) {
				let msg: any
				try {
					msg = JSON.parse(frame.data)
				} catch {
					continue
				}
				if (msg?.id !== id) continue // server notification or another request
				await reader.cancel().catch(() => {})
				if (msg.error) throw new Error(this.errorText(msg.error))
				return msg.result
			}
			events.length = 0

			if (done) break
		}

		throw new Error(
			`MCP server "${this.name}" closed the stream without answering`,
		)
	}

	private errorText(error: any): string {
		return typeof error === "object" && error?.message
			? String(error.message)
			: JSON.stringify(error)
	}

	/**
	 * Send one JSON-RPC message. Returns the matching `result` for a request, or
	 * undefined for a notification (no id).
	 */
	private async post(
		method: string,
		params: any,
		options: { notification?: boolean } = {},
	): Promise<any> {
		if (!this.config.url) {
			throw new Error(`MCP server "${this.name}" missing URL`)
		}

		const id = options.notification ? undefined : this.nextId++
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), this.timeout)

		try {
			const res = await fetch(this.config.url, {
				method: "POST",
				headers: this.headers(),
				body: JSON.stringify({
					jsonrpc: "2.0",
					...(id !== undefined ? { id } : {}),
					method,
					params,
				}),
				signal: controller.signal,
			})

			// Session id arrives on the initialize response and must be echoed.
			const sessionId = res.headers.get("mcp-session-id")
			if (sessionId) this.sessionId = sessionId

			if (!res.ok) {
				const detail = await res.text().catch(() => "")
				throw new Error(
					`HTTP ${res.status}: ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
				)
			}

			if (id === undefined) {
				// Notifications are answered with 202 and no body.
				await res.text().catch(() => "")
				return undefined
			}

			const contentType = res.headers.get("content-type") || ""
			if (contentType.includes("text/event-stream")) {
				return this.readSse(res, id)
			}

			const text = await res.text()
			if (!text.trim()) {
				throw new Error(`MCP server "${this.name}" returned an empty response`)
			}
			let json: any
			try {
				json = JSON.parse(text)
			} catch {
				throw new Error(
					`MCP server "${this.name}" returned non-JSON (${contentType || "no content-type"}): ${text.slice(0, 200)}`,
				)
			}
			// A JSON body may still be a batch.
			const message = Array.isArray(json)
				? json.find((m: any) => m?.id === id)
				: json
			if (message?.error) throw new Error(this.errorText(message.error))
			return message?.result
		} finally {
			clearTimeout(timer)
		}
	}

	async connect(): Promise<void> {
		const result = await this.post("initialize", {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: {
				name: "my-agent",
				version: "1.0.0",
			},
		})
		// Use whatever version the server negotiated for the requests that follow.
		const negotiated =
			typeof result?.protocolVersion === "string"
				? result.protocolVersion
				: undefined
		if (negotiated) this.protocolVersion = negotiated
		try {
			await this.post("notifications/initialized", {}, { notification: true })
		} catch {}
		this.connected = true
	}

	async listTools(): Promise<MCPToolDefinition[]> {
		const res = await this.post("tools/list", {})
		return Array.isArray(res?.tools) ? res.tools : []
	}

	async callTool(name: string, args: any): Promise<CallToolResult> {
		const res = await this.post("tools/call", {
			name,
			arguments: args || {},
		})
		return res || {}
	}

	async disconnect(): Promise<void> {
		this.connected = false
		// Best effort: tell the server the session is over so it can free it.
		if (this.config.url && this.sessionId) {
			try {
				await fetch(this.config.url, {
					method: "DELETE",
					headers: this.headers(),
				})
			} catch {}
		}
		this.sessionId = undefined
	}
}

/**
 * MCPClient — High-level client managing connections to multiple MCP servers.
 */
export class MCPClient {
	private serverConfigs: Record<string, McpServerConfig>
	private timeout: number
	private connections = new Map<string, IMCPConnection>()

	constructor(options: MCPClientOptions) {
		this.serverConfigs = options.servers || {}
		this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS
	}

	private getOrCreateConnection(name: string): IMCPConnection {
		const existing = this.connections.get(name)
		if (existing) return existing

		const config = this.serverConfigs[name]
		if (!config) {
			throw new Error(`No server configuration found for "${name}"`)
		}

		let conn: IMCPConnection
		if (config.url) {
			conn = new HttpConnection(name, config, this.timeout)
		} else {
			conn = new StdioConnection(name, config, this.timeout)
		}

		this.connections.set(name, conn)
		return conn
	}

	/**
	 * Lists all tools from all configured servers, prefixed with `serverName_`.
	 */
	async listTools(): Promise<Record<string, Tool>> {
		const { tools } = await this.listToolsWithErrors()
		return tools
	}

	/**
	 * Lists tools across all servers while collecting per-server error messages.
	 */
	async listToolsWithErrors(): Promise<{
		tools: Record<string, Tool>
		errors: Record<string, string>
	}> {
		const tools: Record<string, Tool> = {}
		const errors: Record<string, string> = {}

		for (const [serverName] of Object.entries(this.serverConfigs)) {
			try {
				const conn = this.getOrCreateConnection(serverName)
				await conn.connect()
				const serverTools = await conn.listTools()

				for (const def of serverTools) {
					if (!def.name) continue
					const toolId = `${serverName}_${def.name}`
					const inputSchema = convertInputSchema(def.inputSchema)

					tools[toolId] = createTool({
						id: toolId,
						description: def.description || "",
						inputSchema,
						parameters: inputSchema,
						execute: async (input: any, _context?: any) => {
							const result = await conn.callTool(def.name, input)
							if (result && result.structuredContent !== undefined) {
								return result.structuredContent
							}
							return result
						},
					})
				}
			} catch (err: any) {
				errors[serverName] = err?.message || String(err)
			}
		}

		return { tools, errors }
	}

	/**
	 * Invokes a specific tool on a named server.
	 */
	async callTool(
		serverName: string,
		toolName: string,
		args: any,
	): Promise<CallToolResult> {
		const conn = this.getOrCreateConnection(serverName)
		if (!conn.isConnected()) {
			await conn.connect()
		}
		return conn.callTool(toolName, args)
	}

	/**
	 * Disconnects all active server connections.
	 */
	async disconnect(): Promise<void> {
		const disconnectPromises = Array.from(this.connections.values()).map(
			(conn) =>
				conn.disconnect().catch(() => {
					// Ignore individual disconnect errors
				}),
		)
		await Promise.all(disconnectPromises)
		this.connections.clear()
	}
}
