export const WORKSPACE_TOOLS = {
	FILESYSTEM: {
		READ_FILE: "myagent_workspace_read_file",
		WRITE_FILE: "myagent_workspace_write_file",
		EDIT_FILE: "myagent_workspace_edit_file",
		LIST_FILES: "myagent_workspace_list_files",
		DELETE: "myagent_workspace_delete",
		FILE_STAT: "myagent_workspace_file_stat",
		MKDIR: "myagent_workspace_mkdir",
		GREP: "myagent_workspace_grep",
		AST_EDIT: "myagent_workspace_ast_edit",
	},
	SANDBOX: {
		EXECUTE_COMMAND: "myagent_workspace_execute_command",
		GET_PROCESS_OUTPUT: "myagent_workspace_get_process_output",
		KILL_PROCESS: "myagent_workspace_kill_process",
	},
	COMPUTER: {
		SCREENSHOT: "myagent_workspace_computer_screenshot",
		CLICK: "myagent_workspace_computer_click",
		DOUBLE_CLICK: "myagent_workspace_computer_double_click",
		RIGHT_CLICK: "myagent_workspace_computer_right_click",
		MOVE_MOUSE: "myagent_workspace_computer_move_mouse",
		DRAG: "myagent_workspace_computer_drag",
		TYPE: "myagent_workspace_computer_type",
		PRESS_KEY: "myagent_workspace_computer_press_key",
		SCROLL: "myagent_workspace_computer_scroll",
		GET_SCREEN_INFO: "myagent_workspace_computer_get_screen_info",
		WAIT: "myagent_workspace_computer_wait",
	},
	SEARCH: {
		SEARCH: "myagent_workspace_search",
		INDEX: "myagent_workspace_index",
	},
	LSP: {
		LSP_INSPECT: "myagent_workspace_lsp_inspect",
	},
} as const

export type WorkspaceToolName =
	| (typeof WORKSPACE_TOOLS.FILESYSTEM)[keyof typeof WORKSPACE_TOOLS.FILESYSTEM]
	| (typeof WORKSPACE_TOOLS.SANDBOX)[keyof typeof WORKSPACE_TOOLS.SANDBOX]
	| (typeof WORKSPACE_TOOLS.COMPUTER)[keyof typeof WORKSPACE_TOOLS.COMPUTER]
	| (typeof WORKSPACE_TOOLS.SEARCH)[keyof typeof WORKSPACE_TOOLS.SEARCH]
	| (typeof WORKSPACE_TOOLS.LSP)[keyof typeof WORKSPACE_TOOLS.LSP]
