import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import type { IpcCommandHandler } from "./types.js"
import { buildFullPrompt } from "../../prompts/index.js"
import { DEFAULT_EXECUTION_MODE } from "../../core/index.js"
import { builtinServersNeedingSetup } from "../../mcp/builtin.js"
import { describeToolNames } from "../../harness/tools.js"
import { getToolCategory } from "../../permissions.js"

export function getContextHandlers(): Record<string, IpcCommandHandler> {
	return {
		getActivePrompt: async (_command, ctx) => {
			try {
				const session = ctx.getActiveSession()
				const projectRoot = session.projectRoot
				const state = session.harness.getState?.() ?? {}
				const modeId =
					session.harness.getCurrentModeId?.() ?? DEFAULT_EXECUTION_MODE
				const modelId = session.harness.getCurrentModelId?.()
				const dateStr = new Date().toISOString().split("T")[0]
				const mcpStatuses = session.mcpManager?.getServerStatuses() ?? []
				const mcpToolNames = Object.keys(
					session.mcpManager?.getTools() ?? {},
				).filter(
					(name) => modeId !== "fast" || getToolCategory(name) === "read",
				)
				const prompt = buildFullPrompt({
					projectPath: projectRoot,
					projectName: state.projectName || path.basename(projectRoot),
					gitBranch: state.gitBranch,
					platform: process.platform,
					date: dateStr,
					mode: modeId,
					modeId,
					currentDate: dateStr,
					state: {
						...state,
						currentModelId: modelId,
					},
					workingDir: projectRoot,
					// Mirror the live turn: the preview has to show the same toolset
					// the model receives, MCP tools included (and, in Fast mode, only
					// the ones the read-only filter keeps).
					toolNames: describeToolNames(modeId),
					mcpToolNames,
					mcpSetup: builtinServersNeedingSetup().map((server) => ({
						name: server.name,
						title: server.title,
						description: server.description,
						apiKeyUrl: server.apiKeyUrl,
					})),
					mcpFailures: mcpStatuses
						.filter(
							(status) =>
								status.builtin && status.hasApiKey && !status.connected,
						)
						.map((status) => ({
							title: status.title ?? status.name,
							error: status.error,
						})),
				})
				return { prompt }
			} catch (err: any) {
				return { prompt: "", error: err?.message || String(err) }
			}
		},
		getContextFiles: async (_command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const home = os.homedir()
			const INSTRUCTION_FILES = ["AGENT.md", "CLAUDE.md"]
			const PROJECT_LOCATIONS = ["", ".myagent", ".claude"]
			const GLOBAL_LOCATIONS = [
				".myagent",
				".config/myagent",
				".claude",
				".config/claude",
			]
			const results: Array<{
				path: string
				content: string
				scope: "global" | "project"
				fileName: string
			}> = []

			for (const location of PROJECT_LOCATIONS) {
				const basePath = location
					? path.join(projectRoot, location)
					: projectRoot
				for (const filename of INSTRUCTION_FILES) {
					const fullPath = path.join(basePath, filename)
					if (fs.existsSync(fullPath)) {
						try {
							const content = fs.readFileSync(fullPath, "utf-8")
							results.push({
								path: fullPath,
								content,
								scope: "project",
								fileName: filename,
							})
						} catch {}
					}
				}
			}

			for (const location of GLOBAL_LOCATIONS) {
				const basePath = path.join(home, location)
				for (const filename of INSTRUCTION_FILES) {
					const fullPath = path.join(basePath, filename)
					if (fs.existsSync(fullPath)) {
						try {
							const content = fs.readFileSync(fullPath, "utf-8")
							results.push({
								path: fullPath,
								content,
								scope: "global",
								fileName: filename,
							})
						} catch {}
					}
				}
			}

			return results
		},
		writeContextFile: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const filePath = command.filePath as string
			const home = os.homedir()
			const isProjectFile = filePath.startsWith(projectRoot)
			const isGlobalFile = filePath.startsWith(home)
			const isContextFile =
				path.basename(filePath) === "AGENT.md" ||
				path.basename(filePath) === "CLAUDE.md"
			if (!isContextFile || (!isProjectFile && !isGlobalFile)) {
				throw new Error("Access denied: can only write to context files")
			}
			fs.writeFileSync(filePath, command.content as string, "utf-8")
			return { success: true }
		},
	}
}
