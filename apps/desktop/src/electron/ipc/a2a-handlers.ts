import type { IpcCommandHandler } from "./types.js"
import { startA2AServer, type A2AServerInstance } from "@my-agent/a2a"
import { getAllHandlers } from "./index.js"
import { safeSend } from "../helpers.js"
import * as path from "path"

let a2aInstance: A2AServerInstance | null = null

export function getA2AServerInstance(): A2AServerInstance | null {
	return a2aInstance
}

export function setA2AServerInstance(inst: A2AServerInstance | null): void {
	a2aInstance = inst
}

export function getA2AHandlers(): Record<string, IpcCommandHandler> {
	return {
		"a2a:status": async (_cmd, _ctx) => {
			return {
				running: !!a2aInstance,
				port: a2aInstance?.port || 3888,
				baseUrl: a2aInstance?.baseUrl || "http://127.0.0.1:3888",
			}
		},

		"a2a:start": async (cmd, ctx) => {
			const activeSession = ctx.getActiveSession()
			if (!activeSession?.harness) {
				return { success: false, error: "No active harness session" }
			}

			if (a2aInstance) {
				await a2aInstance.close()
				a2aInstance = null
			}

			const port = cmd.port || 3888
			try {
				a2aInstance = await startA2AServer({
					harness: activeSession.harness as any,
					port,
					host: "127.0.0.1",
					getHarness: () => ctx.getActiveSession()?.harness,
					onSwitchProject: async (targetPath: string) => {
						const safePath = path.resolve(targetPath)
						const handlers = getAllHandlers()
						const switchHandler = handlers["switchProject"]
						if (switchHandler) {
							await switchHandler(
								{ type: "switchProject", path: safePath },
								ctx,
							)
						}
						if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
							safeSend(ctx.mainWindow, "harness:event", {
								type: "projects_updated",
							})
						}
						return { harness: ctx.getActiveSession()?.harness }
					},
					onProjectListChanged: () => {
						if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
							safeSend(ctx.mainWindow, "harness:event", {
								type: "projects_updated",
							})
						}
					},
				})
				return {
					success: true,
					port: a2aInstance.port,
					baseUrl: a2aInstance.baseUrl,
				}
			} catch (err: any) {
				return { success: false, error: err.message }
			}
		},

		"a2a:stop": async () => {
			if (a2aInstance) {
				await a2aInstance.close()
				a2aInstance = null
			}
			return { success: true }
		},
	}
}
