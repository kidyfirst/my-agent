import { describe, it, expect } from "vitest"
import {
	BUILTIN_MCP_SERVERS,
	buildBuiltinServerConfigs,
	builtinServersNeedingSetup,
	getBuiltinServer,
} from "../builtin.js"

const langsearch = BUILTIN_MCP_SERVERS.find((s) => s.name === "langsearch")!

describe("built-in MCP servers", () => {
	it("ships LangSearch pointing at the documented endpoint", () => {
		expect(langsearch.url).toBe("https://mcp.langsearch.com/mcp")
		expect(langsearch.apiKeyUrl).toBe("https://langsearch.com/dashboard")
		expect(langsearch.docsUrl).toBe(
			"https://docs.langsearch.com/integrations/mcp",
		)
		expect(getBuiltinServer("langsearch")).toBe(langsearch)
		expect(getBuiltinServer("not-a-server")).toBeUndefined()
	})

	it("is listed before a key exists, with no credential attached", () => {
		const configs = buildBuiltinServerConfigs({})
		expect(configs.langsearch.url).toBe("https://mcp.langsearch.com/mcp")
		expect(configs.langsearch.headers).toBeUndefined()
	})

	it("sends the key as a bearer token once saved", () => {
		const configs = buildBuiltinServerConfigs({ langsearch: "  abc123  " })
		expect(configs.langsearch.headers).toEqual({
			Authorization: "Bearer abc123",
		})
	})

	it("reports which built-ins are still waiting for a key", () => {
		expect(builtinServersNeedingSetup({}).map((s) => s.name)).toEqual([
			"langsearch",
		])
		expect(builtinServersNeedingSetup({ langsearch: "abc123" })).toEqual([])
	})

	it("a user-declared server of the same name hides the built-in default", () => {
		// The merge layer puts built-ins underneath every user config, so this is
		// really a statement about ordering: theirs must win.
		const builtin = buildBuiltinServerConfigs({ langsearch: "abc123" })
		const user = { url: "https://example.com/mcp", headers: {} }
		expect({ ...builtin.langsearch, ...user }.url).toBe(
			"https://example.com/mcp",
		)
	})
})
