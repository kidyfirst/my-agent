import { execSync } from "node:child_process"
import type { RequestContext } from "@mastra/core/request-context"
import { buildFullPrompt } from "../prompts/index.js"

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
	const state = harnessContext?.state ?? harnessContext?.getState?.() ?? {}
	const modeId =
		harnessContext?.session?.modeId ?? harnessContext?.modeId ?? "build"
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
	}

	return buildFullPrompt(promptCtx)
}
