import { describe, it, expect, afterEach } from "vitest"
import { MCPClient } from "../client.js"
import { startMockServer } from "./mockServer.js"

let closer: (() => void) | undefined
afterEach(() => {
	closer?.()
	closer = undefined
})

describe("Streamable HTTP MCP transport", () => {
	it("negotiates a session, reads SSE answers and calls tools", async () => {
		const mock = await startMockServer()
		closer = () => mock.server.close()

		const client = new MCPClient({
			servers: {
				mock: {
					url: mock.url,
					headers: { Authorization: "Bearer test-key" },
				},
			},
			timeout: 3000,
		})

		const tools = await client.listTools()
		expect(tools.mock_web_search).toBeDefined()
		expect(tools.mock_web_search.description).toBe("Search the web")

		const result = await tools.mock_web_search.execute({ query: "深圳天气" })
		expect(result.content?.[0]?.text).toBe("found: 深圳天气")

		const init = mock.requests[0]
		expect(init.body.method).toBe("initialize")
		// Hosted MCP endpoints reject a request that only accepts JSON.
		expect(String(init.headers.accept)).toContain("application/json")
		expect(String(init.headers.accept)).toContain("text/event-stream")
		expect(init.headers.authorization).toBe("Bearer test-key")

		const list = mock.requests.find((r) => r.body?.method === "tools/list")
		// The session id handed back by initialize has to come along.
		expect(list?.headers["mcp-session-id"]).toBe("session-abc")
		// ...and so does the version the server negotiated, not the one we offered.
		expect(list?.headers["mcp-protocol-version"]).toBe("2025-06-18")

		await client.disconnect()
	})

	it("surfaces an unauthorized endpoint as a readable error", async () => {
		const mock = await startMockServer({ status: 401 })
		closer = () => mock.server.close()

		const client = new MCPClient({
			servers: { mock: { url: mock.url, headers: {} } },
			timeout: 3000,
		})

		const { tools, errors } = await client.listToolsWithErrors()
		expect(tools).toEqual({})
		expect(errors.mock).toMatch(/HTTP 401/)
		await client.disconnect()
	})
})
