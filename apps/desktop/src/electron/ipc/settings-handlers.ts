import { getLibraryService } from "@my-agent/core"
import { showNotificationDirect } from "../notifications.js"
import type { IpcCommandHandler } from "./types.js"

export function getSettingsHandlers(): Record<string, IpcCommandHandler> {
	return {
		setThinkingLevel: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await s.harness.setState({ thinkingLevel: command.level })
			const threadId =
				(command.threadId as string) || s.harness.getCurrentThreadId()
			if (threadId) {
				const ctrl = (s.harness as any).controller
				await ctrl?.writeThreadMetadataValue?.({
					threadId,
					key: "thinkingLevel",
					value: command.level,
				})
			}
		},
		setNotifications: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.setState({ notifications: command.mode })
		},
		previewNotification: async (command) => {
			const title = (command.title as string) || "Mastra Notification"
			const body = (command.body as string) || "Notification preview"
			showNotificationDirect(title, body)
			return { success: true }
		},
		setSmartEditing: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.setState({ smartEditing: command.enabled })
		},
		setObserverModel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchObserverModel({ modelId: command.modelId })
		},
		setReflectorModel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchReflectorModel({ modelId: command.modelId })
		},
		setLibraryJudgeModel: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await (s.harness as any).switchLibraryJudgeModel?.({
				modelId: command.modelId,
			})
			await s.harness.setState({ libraryJudgeModelId: command.modelId })
			getLibraryService().setConfig({
				libraryJudgeModelId: command.modelId as string,
			})
		},
		setImageProcessModel: async (command, ctx) => {
			const s = ctx.getActiveSession()
			await (s.harness as any).switchImageProcessModel?.({
				modelId: command.modelId,
			})
			await s.harness.setState({ imageProcessModelId: command.modelId })
			getLibraryService().setConfig({
				imageProcessModelId: command.modelId as string,
			})
		},
		setState: async (command, ctx) => {
			const session = ctx.getActiveSession()
			const patch = command.patch as Record<string, unknown>

			// Split: electron-specific fields go to electronState, rest to harness
			const electronKeys = new Set([
				"linearApiKey",
				"linearTeamId",
				"linkedLinearIssueId",
				"linkedLinearIssueIdentifier",
				"linkedLinearDoneStateId",
				"githubToken",
				"githubOwner",
				"githubRepo",
				"githubUsername",
				"linkedGithubIssueNumber",
				"linkedGithubIssueTitle",
				"prInstructions",
				"defaultClonePath",
			])

			const electronPatch: Record<string, unknown> = {}
			const harnessPatch: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(patch)) {
				if (electronKeys.has(key)) {
					electronPatch[key] = value
				} else {
					harnessPatch[key] = value
				}
			}

			if (Object.keys(electronPatch).length > 0) {
				session.electronState.setState(electronPatch as any)
			}
			if (Object.keys(harnessPatch).length > 0) {
				await session.harness.setState(harnessPatch)
			}
		},
	}
}
