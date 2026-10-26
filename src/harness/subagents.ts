import { taskWriteTool, taskCheckTool } from "../core/index.js"
import type { HarnessSubagent } from "./index.js"
import { exploreSubagent } from "../agents/explore.js"
import { planSubagent } from "../agents/plan.js"
import { executeSubagent } from "../agents/execute.js"
import { createViewTool } from "../tools/file-view.js"
import { createGrepTool } from "../tools/grep.js"
import { createGlobTool } from "../tools/glob.js"
import { createExecuteCommandTool } from "../tools/shell.js"
import { createWriteFileTool } from "../tools/write.js"
import { stringReplaceLspTool } from "../tools/string-replace-lsp.js"

export function createDefaultSubagents(projectRoot: string): HarnessSubagent[] {
	const viewTool = createViewTool(projectRoot)
	const grepTool = createGrepTool(projectRoot)
	const globTool = createGlobTool(projectRoot)
	const executeCommandTool = createExecuteCommandTool(projectRoot)
	const writeFileTool = createWriteFileTool(projectRoot)

	const readOnlyTools = {
		view: viewTool,
		search_content: grepTool,
		find_files: globTool,
	}

	return [
		{
			id: exploreSubagent.id,
			name: exploreSubagent.name,
			description:
				"Read-only codebase exploration. Use for questions like 'find all usages of X', 'how does module Y work'.",
			instructions: exploreSubagent.instructions,
			tools: readOnlyTools,
		},
		{
			id: planSubagent.id,
			name: planSubagent.name,
			description:
				"Read-only analysis and planning. Use for 'create an implementation plan for X', 'analyze the architecture of Y'.",
			instructions: planSubagent.instructions,
			tools: readOnlyTools,
		},
		{
			id: executeSubagent.id,
			name: executeSubagent.name,
			description:
				"Task execution with write capabilities. Use for 'implement feature X', 'fix bug Y', 'refactor module Z'.",
			instructions: executeSubagent.instructions,
			tools: {
				...readOnlyTools,
				string_replace_lsp: stringReplaceLspTool,
				write_file: writeFileTool,
				execute_command: executeCommandTool,
				task_write: taskWriteTool,
				task_check: taskCheckTool,
			},
		},
	]
}
