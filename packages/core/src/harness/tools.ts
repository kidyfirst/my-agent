import path from "node:path"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import {
	type RequestContext,
	ExecutionMode,
	DEFAULT_EXECUTION_MODE,
	taskWriteTool,
	taskCheckTool,
} from "../core/index.js"
import { requestSandboxAccessTool } from "../tools/request-sandbox-access.js"
import { createViewTool } from "../tools/file-view.js"
import { createGrepTool } from "../tools/grep.js"
import { createGlobTool } from "../tools/glob.js"
import { createWriteFileTool } from "../tools/write.js"
import { createExecuteCommandTool } from "../tools/shell.js"
import { createSubmitPlanTool } from "../tools/submit-plan.js"
import { createAssetsFetchTool } from "../tools/assets-fetch.js"
import { stringReplaceLspTool } from "../tools/string-replace-lsp.js"
import { astSmartEditTool } from "../tools/ast-smart-edit.js"
import { createSubagentTool } from "../tools/subagent.js"
import {
	createWebSearchTool,
	createWebExtractTool,
	hasTavilyKey,
} from "../tools/web-search.js"
import { BROWSER_TOOL_NAMES } from "../tools/computer-use.js"
import type { MCPManager } from "../mcp/manager.js"

/**
 * Names of the tools this harness registers itself. The system prompt reads them
 * through `describeToolNames` so it can never advertise a tool that isn't there
 * (or hide one that is).
 */
export const READ_TOOL_NAMES = [
	"view",
	"search_content",
	"find_files",
	"execute_command",
	"request_sandbox_access",
	"assets_fetch",
] as const

export const WRITE_TOOL_NAMES = [
	"write_file",
	"string_replace_lsp",
	"ast_smart_edit",
	"subagent",
] as const

export const PLAN_TOOL_NAMES = [
	...READ_TOOL_NAMES,
	"write_file",
	"submit_plan",
] as const

/**
 * Fast mode is read-only: it may inspect the workspace, but `execute_command`
 * is deliberately absent because an arbitrary shell can write as well.
 */
export const FAST_TOOL_NAMES = [
	"view",
	"search_content",
	"find_files",
	"request_sandbox_access",
] as const

/**
 * Tool names registered for a given mode, in the order they are described.
 *
 * Browser tools are opt-in: only hosts that actually inject a browser manager
 * (the desktop app) may advertise them. Plan and Fast modes stay read-only and
 * never get them, since clicking a webpage is a side effect outside the
 * workspace.
 */
export function describeToolNames(
	modeId?: string,
	options?: { browserTools?: boolean },
): string[] {
	if (modeId === ExecutionMode.PLAN) {
		return [...PLAN_TOOL_NAMES]
	}
	if (modeId === ExecutionMode.FAST) {
		return [...FAST_TOOL_NAMES]
	}
	const names = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES, "submit_plan"]
	if (options?.browserTools) names.push(...BROWSER_TOOL_NAMES)
	return names
}

/** Hosts that ship a Playwright browser manager set this to true. */
export interface BrowserToolOptions {
	browserToolsAvailable?: boolean
}

export function createDynamicTools(
	mcpManager?: MCPManager,
	extraTools?:
		| Record<string, any>
		| ((ctx: { requestContext: RequestContext }) => Record<string, any>),
	resolveModel?: (modelId: string) => any,
	options?: BrowserToolOptions,
) {
	let lastSignature = ""
	return function getDynamicTools({
		requestContext,
	}: {
		requestContext: RequestContext
	}) {
		const ctx = (requestContext.get("controller") ||
			requestContext.get("harness")) as any
		if (ctx && !requestContext.get("harness")) {
			try {
				requestContext.set("harness", ctx)
			} catch {}
		}
		const session = requestContext.get("session") as any
		const state = session?.state?.get?.() ?? ctx?.state ?? ctx?.getState?.()
		const rawModel =
			ctx?.session?.modelId || (state?.currentModelId as string | undefined)
		const modelId =
			typeof rawModel === "object" && rawModel !== null && "modelId" in rawModel
				? (rawModel as any).modelId
				: typeof rawModel === "string"
					? rawModel
					: ""
		const isAnthropicModel = Boolean(
			modelId && modelId.startsWith("anthropic/"),
		)
		const isOpenAIModel = Boolean(modelId && modelId.startsWith("openai/"))

		// The workspace toolset used to be injected by the framework. Now that the
		// harness runtime is native, build it here — otherwise the agent only gets
		// the extras below and has no filesystem or terminal access at all.
		const projectRoot = path.resolve(
			(state?.projectPath as string | undefined) || process.cwd(),
		)
		const modeId =
			session?.mode?.get?.() ??
			(ctx?.modeId as string) ??
			DEFAULT_EXECUTION_MODE

		const projectTools: Record<string, any> = {}
		const tools: Record<string, any> = {}

		const subagentRegistry = new Proxy(tools, {
			get(target, prop: string) {
				if (prop === "task_write") return taskWriteTool
				if (prop === "task_check") return taskCheckTool
				if (prop in target) return target[prop]
				if (prop in projectTools) return projectTools[prop]
				return undefined
			},
			has(target, prop: string) {
				if (prop === "task_write" || prop === "task_check") return true
				return prop in target || prop in projectTools
			},
		})

		const factories: Record<string, () => any> = {
			view: () => createViewTool(projectRoot),
			search_content: () => createGrepTool(projectRoot),
			find_files: () => createGlobTool(projectRoot),
			execute_command: () => createExecuteCommandTool(projectRoot),
			write_file: () => createWriteFileTool(projectRoot),
			string_replace_lsp: () => stringReplaceLspTool,
			ast_smart_edit: () => astSmartEditTool,
			submit_plan: () => createSubmitPlanTool(projectRoot),
			request_sandbox_access: () => requestSandboxAccessTool,
			assets_fetch: () => createAssetsFetchTool(projectRoot),
			subagent: () => {
				const effectiveResolver =
					resolveModel ??
					((id: string) => {
						const harness = (requestContext.get("harness") ||
							requestContext.get("controller")) as any
						if (typeof harness?.resolveModel === "function") {
							return harness.resolveModel(id)
						}
						return { id }
					})
				return createSubagentTool({
					tools: subagentRegistry,
					resolveModel: effectiveResolver,
					defaultModelId: modelId || undefined,
				})
			},
		}

		// Plan mode is read-only: writes and edits stay disabled. The name list and
		// the prompt both come from `describeToolNames`, so they cannot drift.
		for (const name of describeToolNames(modeId)) {
			const make = factories[name]
			if (make) projectTools[name] = make()
		}

		Object.assign(tools, {
			...projectTools,
			request_sandbox_access: requestSandboxAccessTool,
		})

		if (hasTavilyKey()) {
			tools.web_search = createWebSearchTool()
			tools.web_extract = createWebExtractTool()
		} else if (isAnthropicModel) {
			try {
				const anthropic = createAnthropic({})
				tools.web_search = (anthropic.tools as any).webSearch_20250305()
			} catch {}
		} else if (isOpenAIModel) {
			try {
				const openai = createOpenAI({})
				tools.web_search = (openai.tools as any).webSearch()
			} catch {}
		}

		if (mcpManager) {
			const mcpTools = mcpManager.getTools()
			Object.assign(tools, mcpTools)
		}

		const browserEnabled =
			options?.browserToolsAvailable === true &&
			state?.browserToolsEnabled !== false &&
			modeId !== ExecutionMode.PLAN &&
			modeId !== ExecutionMode.FAST

		if (extraTools) {
			const resolved =
				typeof extraTools === "function"
					? extraTools({ requestContext })
					: extraTools
			for (const [name, tool] of Object.entries(resolved)) {
				if (
					!browserEnabled &&
					(BROWSER_TOOL_NAMES as readonly string[]).includes(name)
				) {
					continue
				}
				if (!(name in tools)) {
					tools[name] = tool
				}
			}
		}

		// Filter out tools denied by permission rules
		const permissionRules = state?.permissionRules
		if (permissionRules?.tools) {
			for (const [name, policy] of Object.entries(permissionRules.tools)) {
				if (policy === "deny") {
					delete tools[name]
				}
			}
		}

		// Log only when the set changes — this is the one line that tells us what
		// the model actually received, and it survives into debug.log.
		const signature = Object.keys(tools).sort().join(",")
		if (signature !== lastSignature) {
			lastSignature = signature
			console.warn(
				`[tools] mode=${modeId} root=${projectRoot} (${Object.keys(tools).length}): ${signature}`,
			)
		}

		return tools
	}
}
