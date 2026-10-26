import { describe, it, expect } from "vitest"
import { MCPClient } from "../client.js"
import { MCPManager } from "../manager.js"

describe("Native MCP Client & Manager", () => {
	it("initializes an MCPClient instance with empty servers", async () => {
		const client = new MCPClient({
			servers: {},
		})
		const tools = await client.listTools()
		expect(tools).toEqual({})
		await client.disconnect()
	})

	it("initializes an MCPManager instance with no servers configured", async () => {
		const manager = new MCPManager("/tmp")
		expect(manager.hasServers()).toBe(false)
		await manager.init()
		expect(manager.getTools()).toEqual({})
		expect(manager.getServerStatuses()).toEqual([])
		await manager.disconnect()
	})

	it("handles an invalid server command gracefully without throwing", async () => {
		const client = new MCPClient({
			servers: {
				nonexistent: {
					command: "non_existent_command_123456",
					args: [],
				},
			},
			timeout: 500,
		})

		const { tools, errors } = await client.listToolsWithErrors()
		expect(Object.keys(tools).length).toBe(0)
		expect(errors.nonexistent).toBeDefined()
		await client.disconnect()
	})

	it("connects to a mock stdio server and discovers namespaced tools", async () => {
		// A mock Node stdio server that responds to initialize, notifications/initialized, and tools/list
		const mockServerCode = `
			const readline = require("readline");
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

			rl.on("line", (line) => {
				try {
					const msg = JSON.parse(line);
					if (msg.method === "initialize") {
						process.stdout.write(JSON.stringify({
							jsonrpc: "2.0",
							id: msg.id,
							result: {
								protocolVersion: "2024-11-05",
								capabilities: { tools: {} },
								serverInfo: { name: "mock-server", version: "1.0.0" }
							}
						}) + "\\n");
					} else if (msg.method === "tools/list") {
						process.stdout.write(JSON.stringify({
							jsonrpc: "2.0",
							id: msg.id,
							result: {
								tools: [
									{
										name: "echo",
										description: "Echoes input text",
										inputSchema: {
											type: "object",
											properties: { message: { type: "string" } },
											required: ["message"]
										}
									}
								]
							}
						}) + "\\n");
					} else if (msg.method === "tools/call") {
						process.stdout.write(JSON.stringify({
							jsonrpc: "2.0",
							id: msg.id,
							result: {
								content: [{ type: "text", text: "Echo: " + msg.params.arguments.message }]
							}
						}) + "\\n");
					}
				} catch {}
			});
		`

		const client = new MCPClient({
			servers: {
				mock: {
					command: process.execPath,
					args: ["-e", mockServerCode],
				},
			},
			timeout: 3000,
		})

		const tools = await client.listTools()
		expect(tools["mock_echo"]).toBeDefined()
		expect(tools["mock_echo"].description).toBe("Echoes input text")

		const res = await tools["mock_echo"].execute({ message: "Hello MCP!" })
		expect(res.content?.[0]?.text).toBe("Echo: Hello MCP!")

		await client.disconnect()
	})
})
