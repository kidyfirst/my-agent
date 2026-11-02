import { afterEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { MCPManager } from "../manager.js"
import { BUILTIN_MCP_SERVERS } from "../builtin.js"
import { startMockServer } from "./mockServer.js"

/**
 * A key saved in Settings has to reach a manager that was created before it.
 *
 * The merged config is a snapshot taken in the constructor; without a refresh the
 * entry stays headerless, `needsApiKey` stays true, and the server is never
 * dialed. That is exactly how a configured LangSearch kept reporting "no API key
 * saved" in a session that had been open since before the key was pasted in.
 */

const servers: Array<{ close: () => void }> = []
const dirs: string[] = []
const builtinUrl = BUILTIN_MCP_SERVERS[0].url

afterEach(() => {
	BUILTIN_MCP_SERVERS[0].url = builtinUrl
	for (const server of servers.splice(0)) server.close()
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

function emptyProject(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-mcp-refresh-"))
	dirs.push(dir)
	return dir
}

describe("MCPManager key refresh", () => {
	it("connects a built-in whose key appears after construction", async () => {
		const mock = await startMockServer()
		servers.push(mock.server)
		BUILTIN_MCP_SERVERS[0].url = mock.url

		// The key map is what the manager reads on every config build, so
		// mutating it is the same thing Settings does to settings.json.
		const keys: Record<string, string> = {}
		const manager = new MCPManager(emptyProject(), { apiKeys: keys })

		// Constructed with no key: entry present, no credential, never dialed.
		expect(manager.getConfig().mcpServers?.langsearch?.headers).toBeUndefined()

		keys.langsearch = "sk-saved-later"

		// First read must rebuild the config, then connect.
		manager.getTools()

		const deadline = Date.now() + 5000
		while (
			Date.now() < deadline &&
			manager.getTools().langsearch_web_search == null
		) {
			await new Promise((resolve) => setTimeout(resolve, 25))
		}

		expect(Object.keys(manager.getTools())).toEqual(["langsearch_web_search"])
		expect(manager.getServerStatuses()[0]).toMatchObject({
			name: "langsearch",
			connected: true,
			hasApiKey: true,
		})
		// The key it connected with is the one saved after construction.
		const initialize = mock.requests.find(
			(r) => r.body?.method === "initialize",
		)
		expect(initialize?.headers.authorization).toBe("Bearer sk-saved-later")
	})

	it("still refuses to dial a built-in with no key", async () => {
		const mock = await startMockServer()
		servers.push(mock.server)
		BUILTIN_MCP_SERVERS[0].url = mock.url

		const manager = new MCPManager(emptyProject(), { apiKeys: {} })
		manager.getTools()
		await new Promise((resolve) => setTimeout(resolve, 150))

		expect(manager.getTools()).toEqual({})
		expect(mock.requests).toHaveLength(0)
		expect(manager.getServerStatuses()[0]).toMatchObject({
			connected: false,
			needsApiKey: true,
			hasApiKey: false,
		})
	})

	it("reports a rejected key as disconnected with an error, not as missing", async () => {
		const mock = await startMockServer({ status: 401 })
		servers.push(mock.server)
		BUILTIN_MCP_SERVERS[0].url = mock.url

		const manager = new MCPManager(emptyProject(), {
			apiKeys: { langsearch: "sk-stale" },
		})
		await manager.init()

		expect(manager.getTools()).toEqual({})
		expect(manager.getServerStatuses()[0]).toMatchObject({
			connected: false,
			hasApiKey: true,
		})
		// `hasApiKey` true with a failure is what the prompt needs to tell the
		// user "the key was rejected" instead of "add a key".
		expect(manager.getServerStatuses()[0].needsApiKey).toBeFalsy()
	})
})
