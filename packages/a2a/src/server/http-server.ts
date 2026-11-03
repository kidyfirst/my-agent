import http, { type IncomingMessage, type ServerResponse } from "node:http"
import type { MyAgentHarness } from "@my-agent/core"
import { A2ARouter } from "./router.js"
import { handleSSEStream } from "./sse.js"
import { getLoopbackOrigin } from "./cors.js"
import { createAgentCard } from "../card.js"

export interface StartA2AServerOptions {
	harness: MyAgentHarness
	port?: number
	host?: string
	version?: string
	getHarness?: () =>
		| Promise<MyAgentHarness | undefined>
		| MyAgentHarness
		| undefined
	onSwitchProject?: (
		projectPath: string,
	) => Promise<void | { harness?: MyAgentHarness }>
	onProjectListChanged?: () => void
}

export interface A2AServerInstance {
	server: http.Server
	port: number
	host: string
	baseUrl: string
	close: () => Promise<void>
}

export function createA2ARequestHandler(
	options: StartA2AServerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
	const {
		harness,
		port = 3888,
		host = "127.0.0.1",
		version = "0.1.3",
		getHarness,
		onSwitchProject,
		onProjectListChanged,
	} = options

	const router = new A2ARouter({
		harness,
		getHarness,
		onSwitchProject,
		onProjectListChanged,
	})
	return async (req: IncomingMessage, res: ServerResponse) => {
		// CORS is limited to the loopback origins the desktop UI itself runs on.
		// A wildcard here would let any web page reach this server, which can
		// execute tools and rewrite the workspace.
		const origin = getLoopbackOrigin(req.headers.origin)
		if (origin) {
			res.setHeader("Access-Control-Allow-Origin", origin)
			res.setHeader("Vary", "Origin")
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
			res.setHeader(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, X-Requested-With",
			)
		}

		if (req.method === "OPTIONS") {
			res.writeHead(204)
			res.end()
			return
		}

		const parsedUrl = new URL(req.url || "/", `http://${host}:${port}`)
		const pathname = parsedUrl.pathname

		// 1. Agent Card Discovery Endpoint
		if (
			req.method === "GET" &&
			(pathname === "/.well-known/agent-card.json" ||
				pathname === "/agent-card.json")
		) {
			const baseUrl = `http://${host}:${port}`
			const card = createAgentCard({ baseUrl, version })
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify(card, null, 2))
			return
		}

		// 2. Health check
		if (req.method === "GET" && pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(
				JSON.stringify({
					status: "ok",
					agent: "My Agent",
					version,
					timestamp: new Date().toISOString(),
				}),
			)
			return
		}

		// 3. SSE Stream Endpoint
		if (pathname === "/a2a/stream") {
			const prompt =
				parsedUrl.searchParams.get("prompt") ||
				parsedUrl.searchParams.get("message") ||
				""
			const contextId = parsedUrl.searchParams.get("contextId") || undefined
			const projectPath = parsedUrl.searchParams.get("projectPath") || undefined
			const mode = parsedUrl.searchParams.get("mode") || undefined

			if (!prompt) {
				res.writeHead(400, { "Content-Type": "application/json" })
				res.end(
					JSON.stringify({
						error: "Missing required query parameter: prompt",
					}),
				)
				return
			}

			await handleSSEStream(req, res, harness, {
				prompt,
				contextId,
				projectPath,
				mode,
			})
			return
		}

		// 4. JSON-RPC A2A Core Endpoint
		if (pathname === "/a2a" || pathname === "/") {
			if (req.method !== "POST") {
				res.writeHead(405, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Method not allowed. Use POST." }))
				return
			}

			let bodyText = ""
			try {
				bodyText = await readRequestBody(req)
			} catch (err: any) {
				res.writeHead(400, { "Content-Type": "application/json" })
				res.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: {
							code: -32700,
							message: "Parse error: Unable to read request body",
						},
					}),
				)
				return
			}

			let rpcRequest: any
			try {
				rpcRequest = JSON.parse(bodyText)
			} catch (err) {
				res.writeHead(400, { "Content-Type": "application/json" })
				res.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: null,
						error: {
							code: -32700,
							message: "Parse error: Invalid JSON payload",
						},
					}),
				)
				return
			}

			const rpcResponse = await router.handle(rpcRequest)
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify(rpcResponse))
			return
		}

		// 404
		res.writeHead(404, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ error: `Not found: ${pathname}` }))
	}
}

export async function startA2AServer(
	options: StartA2AServerOptions,
): Promise<A2AServerInstance> {
	const { port = 3888, host = "127.0.0.1" } = options

	const handler = createA2ARequestHandler(options)
	const server = http.createServer(handler)

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(port, host, () => {
			server.removeListener("error", reject)
			resolve()
		})
	})

	const actualPort = (server.address() as any)?.port || port
	const baseUrl = `http://${host}:${actualPort}`

	return {
		server,
		port: actualPort,
		host,
		baseUrl,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve())
			}),
	}
}

export class A2AServer {
	private instance: A2AServerInstance | null = null
	private options: StartA2AServerOptions

	constructor(options: StartA2AServerOptions) {
		this.options = options
	}

	async start(): Promise<A2AServerInstance> {
		this.instance = await startA2AServer(this.options)
		return this.instance
	}

	async stop(): Promise<void> {
		if (this.instance) {
			await this.instance.close()
			this.instance = null
		}
	}

	get baseUrl(): string {
		return this.instance?.baseUrl || ""
	}

	get port(): number {
		return this.instance?.port || 0
	}
}

function readRequestBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = ""
		req.setEncoding("utf8")
		req.on("data", (chunk) => {
			data += chunk
		})
		req.on("end", () => resolve(data))
		req.on("error", reject)
	})
}
