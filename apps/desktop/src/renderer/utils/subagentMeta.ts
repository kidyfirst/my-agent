/**
 * Parses the `<subagent-meta … />` tag that the core subagent tool appends
 * to its result text (see packages/core/src/tools/subagent.ts →
 * buildSubagentMeta).
 *
 * Live runs rebuild the Agent card from harness events, but once the app
 * restarts those events are gone — the meta tag inside the persisted tool
 * result is the only durable record of the subagent's tool-call history.
 */

export interface SubagentToolRecord {
	name: string
	args?: unknown
	result?: unknown
	isError: boolean
	status: "complete"
}

export interface SubagentMetaInfo {
	/** Result text with the meta tag stripped (safe to display). */
	cleanResult: string
	modelId: string | null
	durationMs: number | null
	/** Ordered tool-call log rebuilt from the meta tag; empty when absent. */
	tools: SubagentToolRecord[]
}

const META_TAG_RE = /<subagent-meta\s+([^>]*?)\s*\/>/i

function attr(source: string, name: string): string | null {
	const match = source.match(new RegExp(`${name}="([^"]*)"`, "i"))
	return match ? match[1] : null
}

/** Parses `"view:ok,search_content:err"` into ordered tool records. */
export function parseSubagentToolLog(toolsAttr: string): SubagentToolRecord[] {
	return toolsAttr
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			// Tool ids use underscores, never colons — split on the last one.
			const colon = entry.lastIndexOf(":")
			const name = colon === -1 ? entry : entry.slice(0, colon)
			const status = colon === -1 ? "ok" : entry.slice(colon + 1)
			return {
				name,
				isError: status !== "ok",
				status: "complete" as const,
			}
		})
		.filter((tool) => tool.name.length > 0)
}

/**
 * Extracts the subagent meta tag from a persisted tool result.
 * Non-string input (or a result without the tag) yields an empty record with
 * the original text preserved.
 */
export function parseSubagentMeta(rawResult: unknown): SubagentMetaInfo {
	const text =
		typeof rawResult === "string"
			? rawResult
			: typeof (rawResult as any)?.content === "string"
				? (rawResult as any).content
				: ""

	const info: SubagentMetaInfo = {
		cleanResult: text,
		modelId: null,
		durationMs: null,
		tools: [],
	}
	if (!text) return info

	const tag = text.match(META_TAG_RE)
	if (!tag) return info

	const attrs = tag[1]
	const toolsAttr = attr(attrs, "tools")
	const durationAttr = attr(attrs, "durationMs")

	info.cleanResult = text.replace(tag[0], "").trim()
	info.modelId = attr(attrs, "modelId")
	info.durationMs = durationAttr !== null ? Number(durationAttr) : null
	if (Number.isNaN(info.durationMs)) info.durationMs = null
	if (toolsAttr) info.tools = parseSubagentToolLog(toolsAttr)

	return info
}
