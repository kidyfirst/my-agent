/**
 * Read-only tool selection shared by every mode that may inspect but not modify.
 *
 * A mode is "read-only" when its tool set must never mutate the workspace. The
 * permission categories are the source of truth: `read` covers file inspection,
 * code search and web lookups, while `edit` (file writes), `execute` (arbitrary
 * shell) and `mcp` (unknown side effects) are all excluded.
 *
 * MCP lookups reach this list only because `getToolCategory` classifies a
 * `<server>_web_search` style tool as `read`: the category alone cannot tell a
 * search endpoint from a write endpoint, so that judgement lives in one place
 * instead of being duplicated here.
 */
import { getToolCategory } from "../../permissions.js"

export function selectReadOnlyTools<T>(
	tools: Record<string, T> | undefined | null,
): Record<string, T> {
	const selected: Record<string, T> = {}
	for (const [name, tool] of Object.entries(tools ?? {})) {
		if (!tool) continue
		if (getToolCategory(name) === "read") selected[name] = tool
	}
	return selected
}
