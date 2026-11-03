/**
 * Granular tool permission system.
 *
 * Tools are classified into categories by risk level.
 * Each category has a configurable policy: "allow", "ask", or "deny".
 * Session-scoped grants let the user approve a category once per session.
 */

import { isReadOnlyMcpToolName } from "./mcp/tool-names.js"

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type ToolCategory = "read" | "edit" | "execute" | "mcp"

export const TOOL_CATEGORIES: Record<
	ToolCategory,
	{ label: string; description: string }
> = {
	read: {
		label: "Read",
		description: "Read files, search, list directories",
	},
	edit: {
		label: "Edit",
		description: "Create, modify, or delete files",
	},
	execute: {
		label: "Execute",
		description: "Run shell commands",
	},
	mcp: {
		label: "MCP",
		description: "External MCP server tools",
	},
}

// ---------------------------------------------------------------------------
// Tool → Category mapping
// ---------------------------------------------------------------------------

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
	// Read-only tools — always safe
	view: "read",
	search_content: "read",
	find_files: "read",
	web_search: "read",
	"web-search": "read",
	web_extract: "read",
	"web-extract": "read",
	// Edit tools — modify files
	string_replace_lsp: "edit",
	ast_smart_edit: "edit",
	write_file: "edit",
	subagent: "edit",

	// Execute tools — run arbitrary commands
	execute_command: "execute",

	// Browser automation tools
	computer: "execute",
	navigate_browser: "execute",
	"navigate-browser": "execute",

	// Anthropic provider-defined tools
	web_fetch: "read",
	code_execution: "execute",

	// Interactive / planning tools — always allowed (no category needed)
	// ask_user, task_write, task_check, submit_plan, request_sandbox_access
}

// Tools that never need approval regardless of policy
const ALWAYS_ALLOW_TOOLS = new Set([
	"ask_user",
	"task_write",
	"task_check",
	"submit_plan",
	"request_sandbox_access",
])

/**
 * Get the category for a tool.
 *
 * Always-allowed tools resolve to "read" so the approval gate auto-allows them
 * in every mode ("read" is "allow" in all built-in policies) instead of falling
 * through to the gate's "ask" default.
 *
 * An MCP tool that only looks something up (`<server>_web_search`) resolves to
 * "read" for the same reason: it cannot change the workspace, so gating it
 * behind an approval click — and hiding it from read-only modes — is wrong.
 */
export function getToolCategory(toolName: string): ToolCategory {
	if (ALWAYS_ALLOW_TOOLS.has(toolName)) return "read"
	const mapped = TOOL_CATEGORY_MAP[toolName]
	if (mapped) return mapped
	if (isReadOnlyMcpToolName(toolName)) return "read"
	return "mcp"
}
// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type PermissionPolicy = "allow" | "ask" | "deny"

interface PermissionRules {
	/** Policy per category. Missing categories default to their DEFAULT_POLICIES value. */
	categories: Partial<Record<ToolCategory, PermissionPolicy>>
	/** Per-tool overrides. Tool name → policy. Takes precedence over category. */
	tools: Record<string, PermissionPolicy>
}

/** Default policies when no rules are configured (YOLO=false equivalent). */
export const DEFAULT_POLICIES: Record<ToolCategory, PermissionPolicy> = {
	read: "allow",
	edit: "ask",
	execute: "ask",
	mcp: "ask",
}

/** YOLO-mode policies — everything auto-allowed. */
export const YOLO_POLICIES: Record<ToolCategory, PermissionPolicy> = {
	read: "allow",
	edit: "allow",
	execute: "allow",
	mcp: "allow",
}

// ---------------------------------------------------------------------------
// Runtime permission state
// ---------------------------------------------------------------------------
//
// The permission mode is chosen in the composer and applies process-wide until
// it changes again. Keeping it here (instead of only on a live Session) means a
// session created later — a new worktree, or the very first session at startup,
// before the renderer has sent any IPC — still inherits the selected mode.

let runtimeYolo = false
const runtimeCategoryPolicies: Partial<Record<ToolCategory, PermissionPolicy>> =
	{}

export function getRuntimeYolo(): boolean {
	return runtimeYolo
}

export function setRuntimeYolo(enabled: boolean): void {
	runtimeYolo = enabled
	const policies = enabled ? YOLO_POLICIES : DEFAULT_POLICIES
	for (const [category, policy] of Object.entries(policies)) {
		runtimeCategoryPolicies[category as ToolCategory] = policy
	}
}

export function getRuntimeCategoryPolicies(): Record<string, PermissionPolicy> {
	return { ...runtimeCategoryPolicies }
}

export function setRuntimeCategoryPolicy(
	category: ToolCategory,
	policy: PermissionPolicy,
): void {
	runtimeCategoryPolicies[category] = policy
}
