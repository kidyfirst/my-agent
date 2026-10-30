import type { IpcCommandHandler } from "./types.js"

const BUILTIN_COMMANDS = [
	{ name: "new", description: "Start a new thread", builtin: true },
	{ name: "clear", description: "Clear current conversation", builtin: true },
	{ name: "react", description: "Switch to ReAct mode", builtin: true },
	{ name: "fast", description: "Switch to Fast mode", builtin: true },
	{ name: "plan", description: "Switch to Plan & Solve mode", builtin: true },
	{ name: "graph", description: "View execution graph", builtin: true },
	{ name: "settings", description: "Open settings", builtin: true },
	{
		name: "record",
		description: "Start or stop session recording",
		builtin: true,
	},
	{
		name: "replay",
		description: "Upload and replay a recorded session",
		builtin: true,
	},
	{
		name: "help",
		description: "Show keyboard shortcuts & tips",
		builtin: true,
	},
]

export function getSlashCommandHandlers(): Record<string, IpcCommandHandler> {
	return {
		getSlashCommands: async (_command, ctx) => {
			const { loadCustomCommands } =
				await import("../../utils/slash-command-loader.js")
			const custom = await loadCustomCommands(
				ctx.getActiveSession().projectRoot,
			)
			return [...BUILTIN_COMMANDS, ...custom]
		},
		processSlashCommand: async (command, ctx) => {
			const { loadCustomCommands } =
				await import("../../utils/slash-command-loader.js")
			const { processSlashCommand } =
				await import("../../utils/slash-command-processor.js")
			const projectRoot = ctx.getActiveSession().projectRoot
			const commands = await loadCustomCommands(projectRoot)
			const cmd = commands.find(
				(c: { name: string }) => c.name === command.commandName,
			)
			if (!cmd) throw new Error(`Unknown command: /${command.commandName}`)
			return await processSlashCommand(cmd, command.args ?? [], projectRoot)
		},
	}
}
