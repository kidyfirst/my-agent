/**
 * Which MCP tool names are known to only read.
 *
 * MCP says nothing about side effects, so every MCP tool defaults to the `mcp`
 * category. A hosted search server is the common exception: it takes a query and
 * returns text. Treating it as a write risk hurt in both directions — every
 * lookup needed an approval click, and read-only modes (Fast) dropped it from the
 * toolset entirely, which made Fast mode answer "I have no web access" while
 * LangSearch was configured and connected.
 *
 * Matched on the namespaced name (`<server>_web_search`), and on the `web`
 * segment specifically, so `search_content` — a file grep — never counts as web
 * access.
 */
export function isReadOnlyMcpToolName(name: string): boolean {
	return /(^|_)web[_-]?(search|extract|fetch)$/i.test(name)
}
