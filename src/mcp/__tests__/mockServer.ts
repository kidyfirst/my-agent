/**
 * Minimal Streamable-HTTP MCP server for tests: session id, SSE answers, JSON
 * answers, and an optional failure status. Shared by the transport test and the
 * manager test so both speak to the same endpoint behaviour.
 */
import http from "node:http"

export type RecordedRequest = {
	method?: string
	headers: http.IncomingHttpHeaders
	body: any
}

/** Minimal Streamable-HTTP MCP server: session id, SSE answers, JSON answers. */
export async function startMockServer(options: { status?: number } = {}) {
	const requests: RecordedRequest[] = []
	const server = http.createServer((req, res) => {
		let raw = ""
		req.on("data", (chunk) => (raw += chunk))
		req.on("end", () => {
			const body = raw ? JSON.parse(raw) : undefined
			requests.push({ method: req.method, headers: req.headers, body })

			if (options.status) {
				res.writeHead(options.status, { "Content-Type": "text/plain" })
				res.end("Unauthorized: invalid API key")
				return
			}
			if (req.method === "DELETE") {
				res.writeHead(200)
				res.end()
				return
			}
			if (body?.method === "initialize") {
				res.writeHead(200, {
					"Content-Type": "application/json",
					"Mcp-Session-Id": "session-abc",
				})
				res.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: body.id,
						result: {
							protocolVersion: "2025-06-18",
							capabilities: { tools: {} },
							serverInfo: { name: "mock-remote", version: "1.0.0" },
						},
					}),
				)
				return
			}
			if (body?.method === "notifications/initialized") {
				res.writeHead(202)
				res.end()
				return
			}
			if (body?.method === "tools/list") {
				res.writeHead(200, { "Content-Type": "text/event-stream" })
				// A server notification first: it must not be mistaken for the answer.
				res.write(
					`event: message\ndata: ${JSON.stringify({
						jsonrpc: "2.0",
						method: "notifications/message",
						params: { level: "info" },
					})}\n\n`,
				)
				res.write(
					`event: message\ndata: ${JSON.stringify({
						jsonrpc: "2.0",
						id: body.id,
						result: {
							tools: [
								{
									name: "web_search",
									description: "Search the web",
									inputSchema: {
										type: "object",
										properties: { query: { type: "string" } },
										required: ["query"],
									},
								},
							],
						},
					})}\n\n`,
				)
				res.end()
				return
			}
			if (body?.method === "tools/call") {
				res.writeHead(200, { "Content-Type": "application/json" })
				res.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: body.id,
						result: {
							content: [
								{ type: "text", text: `found: ${body.params.arguments.query}` },
							],
						},
					}),
				)
				return
			}
			res.writeHead(400)
			res.end()
		})
	})

	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	)
	const { port } = server.address() as { port: number }
	return { server, url: `http://127.0.0.1:${port}/mcp`, requests }
}
