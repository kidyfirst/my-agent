import path from "node:path"
import {
	Workspace,
	LocalFilesystem,
	LocalSandbox,
	WORKSPACE_TOOLS,
	ExecutionMode,
	DEFAULT_EXECUTION_MODE,
	type RequestContext,
} from "../core/index.js"

const WORKSPACE_ID_PREFIX = "myagent-code"

export const MC_TOOLS = {
	VIEW: "view",
	WRITE_FILE: "write_file",
	STRING_REPLACE_LSP: "string_replace_lsp",
	FIND_FILES: "find_files",
	DELETE_FILE: "delete_file",
	FILE_STAT: "file_stat",
	MKDIR: "mkdir",
	SEARCH_CONTENT: "search_content",
	AST_SMART_EDIT: "ast_smart_edit",
	EXECUTE_COMMAND: "execute_command",
	GET_PROCESS_OUTPUT: "get_process_output",
	KILL_PROCESS: "kill_process",
} as const

export const TOOL_NAME_OVERRIDES = {
	[WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: MC_TOOLS.VIEW },
	[WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: MC_TOOLS.WRITE_FILE },
	[WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { name: MC_TOOLS.STRING_REPLACE_LSP },
	[WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: MC_TOOLS.FIND_FILES },
	[WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { name: MC_TOOLS.DELETE_FILE },
	[WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { name: MC_TOOLS.FILE_STAT },
	[WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { name: MC_TOOLS.MKDIR },
	[WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: MC_TOOLS.SEARCH_CONTENT },
	[WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { name: MC_TOOLS.AST_SMART_EDIT },
	[WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: MC_TOOLS.EXECUTE_COMMAND },
	[WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
		name: MC_TOOLS.GET_PROCESS_OUTPUT,
	},
	[WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: MC_TOOLS.KILL_PROCESS },
}

export function getDynamicWorkspace({
	requestContext,
	myagent,
}: {
	requestContext: RequestContext
	myagent?: any
}): Workspace {
	const ctx = (requestContext?.get?.("controller") ||
		requestContext?.get?.("harness")) as any
	if (ctx && requestContext && !requestContext.get("harness")) {
		try {
			requestContext.set("harness", ctx)
		} catch {}
	}
	const state = ctx?.state ?? ctx?.getState?.()
	const modeId = ctx?.session?.modeId ?? ctx?.modeId ?? DEFAULT_EXECUTION_MODE
	const rawProjectPath = state?.projectPath || process.cwd()
	const projectPath = path.resolve(rawProjectPath)
	const workspaceId = `${WORKSPACE_ID_PREFIX}-${projectPath}`
	const sandboxPaths = (state?.sandboxAllowedPaths ?? []) as string[]
	const allowedPaths = sandboxPaths.map((p) => path.resolve(p))
	const isPlanMode = modeId === ExecutionMode.PLAN

	const planModeTools = {
		[WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
			...TOOL_NAME_OVERRIDES[WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE],
			enabled: false,
		},
		[WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: {
			...TOOL_NAME_OVERRIDES[WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT],
			enabled: false,
		},
	}

	const toolsConfig = isPlanMode
		? { ...TOOL_NAME_OVERRIDES, ...planModeTools }
		: TOOL_NAME_OVERRIDES

	let existing: Workspace | undefined
	try {
		existing = myagent?.getWorkspaceById?.(workspaceId)
	} catch {}

	if (existing) {
		;(existing.filesystem as any)?.setAllowedPaths?.(allowedPaths)
		;(existing as any)?.setToolsConfig?.(toolsConfig as any)
		return existing
	}

	return new Workspace({
		id: workspaceId,
		name: "MyAgent Workspace",
		filesystem: new LocalFilesystem({
			basePath: projectPath,
			allowedPaths,
		}),
		sandbox: new LocalSandbox({
			workingDirectory: projectPath,
			env: {
				...process.env,
				FORCE_COLOR: "1",
				CLICOLOR_FORCE: "1",
				TERM: process.env.TERM || "xterm-256color",
				CI: "true",
				NONINTERACTIVE: "1",
				DEBIAN_FRONTEND: "noninteractive",
			},
		}),
		tools: toolsConfig as any,
	})
}
