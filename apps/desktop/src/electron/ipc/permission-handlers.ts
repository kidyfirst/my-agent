import type { IpcCommandHandler, WorktreeSession } from "./types.js"
import {
	type MyAgentHarness,
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	setRuntimeYolo,
	setRuntimeCategoryPolicy,
	type ToolCategory,
	type PermissionPolicy,
} from "@my-agent/core"

/**
 * The active worktree session's harness, or null when no project session exists
 * yet (early startup, or every project closed). Permission state still has to be
 * recorded in that case so the first session inherits it.
 */
function activeHarness(ctx: {
	getActiveSession: () => WorktreeSession
}): MyAgentHarness | null {
	try {
		return ctx.getActiveSession()?.harness ?? null
	} catch {
		return null
	}
}

function findHarnessForApproval(
	ctx: {
		getActiveSession: () => WorktreeSession
		sessions?: Map<string, WorktreeSession>
	},
	threadId?: string,
): MyAgentHarness | null {
	if (threadId && ctx.sessions) {
		for (const session of ctx.sessions.values()) {
			if ((session?.harness as any)?.isThreadRunning?.(threadId)) {
				return session.harness as MyAgentHarness
			}
		}
	}
	return activeHarness(ctx)
}

export function getPermissionHandlers(): Record<string, IpcCommandHandler> {
	return {
		respondToToolApproval: async (command, ctx) => {
			findHarnessForApproval(
				ctx as any,
				command.threadId,
			)?.respondToToolApproval({
				decision: command.decision ?? "approve",
				scope: command.scope ?? "once",
				toolCallId: command.toolCallId,
				threadId: command.threadId,
				toolName: command.toolName,
				category: command.category,
				args: command.args,
				...(command.reason
					? { declineContext: { reason: command.reason } }
					: {}),
			})
		},
		approveToolCall: async (command, ctx) => {
			findHarnessForApproval(
				ctx as any,
				command.threadId,
			)?.respondToToolApproval({
				decision: "approve",
				scope: command.scope ?? "once",
				toolCallId: command.toolCallId,
				threadId: command.threadId,
				toolName: command.toolName,
				category: command.category,
				args: command.args,
			})
		},
		declineToolCall: async (command, ctx) => {
			findHarnessForApproval(
				ctx as any,
				command.threadId,
			)?.respondToToolApproval({
				decision: "decline",
				scope: "once",
				toolCallId: command.toolCallId,
				threadId: command.threadId,
				toolName: command.toolName,
				category: command.category,
				args: command.args,
				...(command.reason
					? { declineContext: { reason: command.reason } }
					: {}),
			})
		},
		approveToolCallAlwaysCategory: async (command, ctx) => {
			findHarnessForApproval(
				ctx as any,
				command.threadId,
			)?.respondToToolApproval({
				decision: "always_allow_category",
				toolCallId: command.toolCallId,
				threadId: command.threadId,
			})
		},
		getPermissionRules: async (_command, ctx) => {
			const h = activeHarness(ctx)
			return {
				rules: h?.getPermissionRules() ?? {
					categories: {},
					tools: {},
				},
				sessionGrants: h?.getSessionGrants().categories ?? [],
				categories: TOOL_CATEGORIES,
			}
		},
		setPermissionPolicy: async (command, ctx) => {
			const cat = command.category as ToolCategory
			const policy = command.policy as PermissionPolicy
			// Record process-wide first so a session created later inherits it.
			setRuntimeCategoryPolicy(cat, policy)
			const h = activeHarness(ctx)
			if (!h) return
			h.setPermissionForCategory({ category: cat, policy })
			if (policy === "allow") h.grantSessionCategory({ category: cat })
			const threadId = (command.threadId as string) || h.getCurrentThreadId()
			if (threadId && command.permissionMode) {
				const ctrl = (h as any).controller
				await ctrl?.writeThreadMetadataValue?.({
					threadId,
					key: "permissionMode",
					value: command.permissionMode,
				})
			}
		},
		resetSessionGrants: async () => {
			// No direct reset on Harness — session grants persist until session ends
		},
		respondToQuestion: async (command, ctx) => {
			activeHarness(ctx)?.respondToQuestion({
				questionId: command.questionId,
				answer: command.answer,
			})
		},
		respondToPlanApproval: async (command, ctx) => {
			await activeHarness(ctx)?.respondToPlanApproval({
				planId: command.planId,
				response: command.response,
			})
		},
		setYoloMode: async (command, ctx) => {
			const enabled = command.enabled === true
			// setRuntimeYolo also seeds the default policy for every category, so a
			// later-created session starts from the same mode.
			setRuntimeYolo(enabled)
			const h = activeHarness(ctx)
			if (!h) return
			await h.setState({ yolo: enabled })
			const policies = enabled ? YOLO_POLICIES : DEFAULT_POLICIES
			for (const [cat, policy] of Object.entries(policies)) {
				h.setPermissionForCategory({
					category: cat as ToolCategory,
					policy,
				})
			}
			const threadId = (command.threadId as string) || h.getCurrentThreadId()
			if (threadId) {
				const ctrl = (h as any).controller
				await ctrl?.writeThreadMetadataValue?.({
					threadId,
					key: "permissionMode",
					value: enabled ? "auto-approve" : "default",
				})
			}
		},
	}
}
