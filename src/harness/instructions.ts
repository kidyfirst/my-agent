import { execSync } from "node:child_process"
import type { RequestContext } from "../core/index.js"
import { DEFAULT_EXECUTION_MODE } from "../core/index.js"
import { buildFullPrompt } from "../prompts/index.js"
import { describeToolNames } from "./tools.js"
import { builtinServersNeedingSetup } from "../mcp/builtin.js"
import type { McpServerStatus } from "../mcp/types.js"

function getCurrentGitBranch(cwd: string): string | undefined {
	try {
		return execSync("git rev-parse --abbrev-ref HEAD", {
			cwd,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim()
	} catch {
		return undefined
	}
}

export function getDynamicInstructions({
	requestContext,
}: {
	requestContext: RequestContext
}): string {
	const harnessContext = (requestContext.get("controller") ||
		requestContext.get("harness")) as any
	if (harnessContext && !requestContext.get("harness")) {
		try {
			requestContext.set("harness", harnessContext)
		} catch {}
	}
	const session = requestContext.get("session") as any
	const state =
		session?.state?.get?.() ??
		harnessContext?.state ??
		harnessContext?.getState?.() ??
		{}
	const modeId =
		session?.mode?.get?.() ?? harnessContext?.modeId ?? DEFAULT_EXECUTION_MODE
	const projectPath = state?.projectPath ?? process.cwd()

	const promptCtx = {
		projectPath,
		projectName: state?.projectName ?? "",
		gitBranch: getCurrentGitBranch(projectPath) ?? state?.gitBranch,
		platform: process.platform,
		date: new Date().toISOString().split("T")[0],
		mode: modeId,
		modelId:
			(typeof harnessContext?.session?.modelId === "object"
				? harnessContext.session.modelId?.modelId
				: harnessContext?.session?.modelId) ||
			(typeof state?.currentModelId === "object"
				? state.currentModelId?.modelId
				: state?.currentModelId) ||
			undefined,
		activePlan: state?.activePlan ?? null,
		modeId,
		currentDate: new Date().toISOString().split("T")[0],
		workingDir: projectPath,
		state,
		toolNames: describeToolNames(modeId),
		// Tools the connected MCP servers actually registered. Read from the live
		// manager so a key saved in Settings shows up on the very next turn.
		mcpToolNames:
			(harnessContext?.getMcpToolNames?.() as string[] | undefined) ?? [],
		// Read from disk so a key saved in Settings lands in the very next turn.
		mcpSetup: builtinServersNeedingSetup().map((server) => ({
			name: server.name,
			title: server.title,
			description: server.description,
			apiKeyUrl: server.apiKeyUrl,
		})),
		// A saved key that the server rejected is a different story from a
		// missing key, and the model cannot tell them apart on its own.
		mcpFailures: (
			(harnessContext?.getMcpServerStatuses?.() ?? []) as McpServerStatus[]
		)
			.filter(
				(status) => status.builtin && status.hasApiKey && !status.connected,
			)
			.map((status) => ({
				title: status.title ?? status.name,
				error: status.error,
			})),
	}

	return buildFullPrompt(promptCtx)
}
