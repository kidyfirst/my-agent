import { describe, expect, it } from "vitest"
import { streamText } from "ai"
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test"
import { toModelTool } from "../ai-tool.js"
import { requestSandboxAccessTool } from "../../../tools/request-sandbox-access.js"
import { stringReplaceLspTool } from "../../../tools/string-replace-lsp.js"
import { astSmartEditTool } from "../../../tools/ast-smart-edit.js"
import { createGlobTool } from "../../../tools/glob.js"
import { createGrepTool } from "../../../tools/grep.js"
import { createViewTool } from "../../../tools/file-view.js"
import { createWriteFileTool } from "../../../tools/write.js"
import { createExecuteCommandTool } from "../../../tools/shell.js"
import { createNavigateBrowserTool } from "../../../tools/navigate-browser.js"

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
}

const root = process.cwd()

/**
 * Providers reject any tool whose `parameters` is not a JSON Schema of
 * `type: "object"` (DeepSeek reports it as `got 'type: null'`). This guards the
 * whole built-in tool set, not just one tool.
 */
describe("built-in tool schemas", () => {
	it("are all object-typed in the request sent to the model", async () => {
		const registry: Record<string, any> = {
			request_sandbox_access: requestSandboxAccessTool,
			string_replace_lsp: stringReplaceLspTool,
			ast_smart_edit: astSmartEditTool,
			glob: createGlobTool(root),
			grep: createGrepTool(root),
			view: createViewTool(root),
			write_file: createWriteFileTool(root),
			execute_command: createExecuteCommandTool(root),
			navigate_browser: createNavigateBrowserTool(root),
		}

		let captured: any
		const model = new MockLanguageModelV3({
			doStream: async (opts: any) => {
				captured = opts
				return {
					stream: convertArrayToReadableStream([
						{ type: "stream-start", warnings: [] },
						{ type: "finish", finishReason: "stop", usage },
					]),
				}
			},
		})

		const tools: Record<string, any> = {}
		for (const [name, tool] of Object.entries(registry)) {
			if (!tool) continue
			tools[name] = toModelTool(tool, async () => "ok")
		}
		expect(Object.keys(tools).length).toBeGreaterThan(0)

		const result = streamText({
			model,
			messages: [{ role: "user", content: "hi" }],
			tools,
		})
		for await (const _ of result.fullStream) {
			// drain the stream
		}

		const invalid = captured.tools
			.filter((tool: any) => tool.inputSchema?.type !== "object")
			.map((tool: any) => `${tool.name}: ${JSON.stringify(tool.inputSchema)}`)
		expect(invalid).toEqual([])
	})
})
