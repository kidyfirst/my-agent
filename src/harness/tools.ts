import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import type { RequestContext } from "@mastra/core/request-context"
import { requestSandboxAccessTool } from "../tools/request-sandbox-access.js"
import {
	createWebSearchTool,
	createWebExtractTool,
	hasTavilyKey,
} from "../tools/web-search.js"
import type { MCPManager } from "../mcp/manager.js"

export function createDynamicTools(
	mcpManager?: MCPManager,
	extraTools?:
		| Record<string, any>
		| ((ctx: { requestContext: RequestContext }) => Record<string, any>),
) {
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
		const state = ctx?.state ?? ctx?.getState?.()
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

		const tools: Record<string, any> = {
			request_sandbox_access: requestSandboxAccessTool,
		}

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

		if (extraTools) {
			const resolved =
				typeof extraTools === "function"
					? extraTools({ requestContext })
					: extraTools
			for (const [name, tool] of Object.entries(resolved)) {
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

		return tools
	}
}
