import type { IpcCommandHandler, WorktreeSession } from "./types.js"
import type { MyAgentHarness } from "../../harness/index.js"
import {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	setRuntimeYolo,
	setRuntimeCategoryPolicy,
	type ToolCategory,
	type PermissionPolicy,
} from "../../permissions.js"

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

export function getPermissionHandlers(): Record<string, IpcCommandHandler> {
	return {
		approveToolCall: async (command, ctx) => {
			activeHarness(ctx)?.respondToToolApproval({
				decision: "approve",
				toolCallId: command.toolCallId,
			})
		},
		declineToolCall: async (command, ctx) => {
			activeHarness(ctx)?.respondToToolApproval({
				decision: "decline",
				toolCallId: command.toolCallId,
				...(command.reason
					? { declineContext: { reason: command.reason } }
					: {}),
			})
		},
		approveToolCallAlwaysCategory: async (command, ctx) => {
			activeHarness(ctx)?.respondToToolApproval({
				decision: "always_allow_category",
				toolCallId: command.toolCallId,
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
		},
	}
}
