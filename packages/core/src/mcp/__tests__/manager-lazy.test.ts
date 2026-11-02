import { afterEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { MCPManager } from "../manager.js"
import { startMockServer } from "./mockServer.js"

/**
 * `getTools()` is the only thing the harness calls, and only the first session
 * and project switches ever call `init()`. A session that neither path covers
 * used to run its whole life with an empty MCP toolset — no error, no status,
 * just a model that insists it has no web access. These tests pin the lazy
 * connect that closes that gap.
 */

const servers: Array<{ close: () => void }> = []
const dirs: string[] = []

afterEach(() => {
	for (const server of servers.splice(0)) server.close()
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

function projectWithMcp(url: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-mcp-lazy-"))
	fs.mkdirSync(path.join(dir, ".myagent"), { recursive: true })
	fs.writeFileSync(
		path.join(dir, ".myagent", "mcp.json"),
		JSON.stringify({ mcpServers: { mock: { url } } }),
	)
	dirs.push(dir)
	return dir
}

describe("MCPManager.getTools", () => {
	it("connects on first use when nobody called init()", async () => {
		const mock = await startMockServer()
		servers.push(mock.server)

		// No API keys injected: the built-in LangSearch stays unconfigured and is
		// never dialed, so only the mock server is in play.
		const manager = new MCPManager(projectWithMcp(mock.url), { apiKeys: {} })

		// First read is what triggers the connection; it cannot be synchronous.
		expect(Object.keys(manager.getTools())).toEqual([])

		const deadline = Date.now() + 5000
		while (
			Object.keys(manager.getTools()).length === 0 &&
			Date.now() < deadline
		) {
			await new Promise((resolve) => setTimeout(resolve, 25))
		}

		expect(Object.keys(manager.getTools())).toEqual(["mock_web_search"])
		expect(
			manager.getServerStatuses().find((s) => s.name === "mock"),
		).toMatchObject({ connected: true, toolCount: 1 })
	})

	it("does not dial the same server twice on repeated reads", async () => {
		const mock = await startMockServer()
		servers.push(mock.server)

		const manager = new MCPManager(projectWithMcp(mock.url), { apiKeys: {} })
		for (let i = 0; i < 5; i++) manager.getTools()

		const deadline = Date.now() + 5000
		while (
			Object.keys(manager.getTools()).length === 0 &&
			Date.now() < deadline
		) {
			await new Promise((resolve) => setTimeout(resolve, 25))
		}

		const initializes = mock.requests.filter(
			(r) => r.body?.method === "initialize",
		)
		expect(initializes).toHaveLength(1)
	})
})
