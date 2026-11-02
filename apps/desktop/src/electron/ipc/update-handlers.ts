import type { IpcCommandHandler } from "./types.js"
import {
	checkForUpdates,
	downloadAndInstallUpdate,
} from "../updater/updater.js"

export function getUpdateHandlers(): Record<string, IpcCommandHandler> {
	return {
		checkForUpdates: async (_command, _ctx) => {
			return await checkForUpdates()
		},
		downloadAndInstallUpdate: async (command, ctx) => {
			return await downloadAndInstallUpdate(
				command.downloadUrl,
				command.fileName,
				ctx.mainWindow,
			)
		},
	}
}
