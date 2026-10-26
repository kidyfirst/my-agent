import * as pty from "node-pty"
import type { IpcCommandHandler } from "./types.js"
import { safeSend } from "../helpers.js"

export function getPtyHandlers(): Record<string, IpcCommandHandler> {
	return {
		ptyCreate: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const shellPath = process.env.SHELL || "/bin/zsh"
			const sessionId = `pty-${Date.now()}-${Math.random().toString(36).slice(2)}`
			const ptyProcess = pty.spawn(shellPath, [], {
				name: "xterm-256color",
				cols: (command.cols as number) || 80,
				rows: (command.rows as number) || 24,
				cwd: (command.cwd as string) || s.projectRoot,
				env: { ...process.env, TERM: "xterm-256color" } as Record<
					string,
					string
				>,
			})
			s.ptySessions.set(sessionId, ptyProcess)
			ptyProcess.onData((data: string) => {
				safeSend(ctx.mainWindow, "harness:event", {
					type: "pty_output",
					sessionId,
					data,
				})
			})
			ptyProcess.onExit(
				({ exitCode, signal }: { exitCode: number; signal?: number }) => {
					safeSend(ctx.mainWindow, "harness:event", {
						type: "pty_exit",
						sessionId,
						exitCode,
						signal,
					})
					s.ptySessions.delete(sessionId)
				},
			)
			return { sessionId }
		},
		ptyWrite: async (command, ctx) => {
			const ptySession = ctx
				.getActiveSession()
				.ptySessions.get(command.sessionId as string)
			if (ptySession) {
				try {
					ptySession.write(command.data as string)
				} catch {}
			}
		},
		ptyResize: async (command, ctx) => {
			const ptySession = ctx
				.getActiveSession()
				.ptySessions.get(command.sessionId as string)
			if (ptySession) {
				try {
					ptySession.resize(command.cols as number, command.rows as number)
				} catch {}
			}
		},
		ptyDestroy: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const ptySession = s.ptySessions.get(command.sessionId as string)
			if (ptySession) {
				try {
					ptySession.kill()
				} catch {}
				s.ptySessions.delete(command.sessionId as string)
			}
		},
	}
}
