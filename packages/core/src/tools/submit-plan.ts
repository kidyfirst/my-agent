/**
 * submit_plan tool — submits the completed implementation plan for user review and approval.
 * Also persists the plan markdown under .myagent/plans/<title-slug>.md.
 */

import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import * as path from "node:path"
import * as fs from "node:fs"

export interface SubmitPlanArgs {
	title: string
	plan: string
}

export function createSubmitPlanTool(projectRoot?: string) {
	return createTool({
		id: "submit_plan",
		description: `Submit your completed implementation plan for user review and approval.
This tool:
1. Automatically saves your plan to .myagent/plans/<title>.md
2. Displays an approval dialog to the user with Approve / Reject / Request changes options
3. If approved by the user, automatically switches the workspace mode to Build/ReAct mode for implementation.

Call this tool when you have thoroughly explored the codebase and have a concrete, complete plan ready.`,
		inputSchema: z.object({
			title: z
				.string()
				.min(1)
				.describe(
					"Short descriptive title of the plan (e.g. 'Refactor auth service')",
				),
			plan: z
				.string()
				.min(1)
				.describe(
					"The full implementation plan in markdown format, following the required structure (Overview, Complexity, Steps, Verification)",
				),
		}),
		execute: async ({ title, plan }: SubmitPlanArgs, toolContext?: any) => {
			try {
				const root = projectRoot || process.cwd()
				const plansDir = path.resolve(root, ".myagent/plans")
				if (!fs.existsSync(plansDir)) {
					fs.mkdirSync(plansDir, { recursive: true })
				}

				// Generate clean slug from title
				const safeSlug =
					title
						.toLowerCase()
						.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
						.replace(/^-+|-+$/g, "") || "plan"
				const fileName = `${safeSlug}.md`
				const fullFilePath = path.join(plansDir, fileName)
				const relFilePath = path.relative(root, fullFilePath)

				// Persist plan file
				const fileContent = `# ${title}\n\n${plan}\n`
				fs.writeFileSync(fullFilePath, fileContent, "utf-8")

				const harnessCtx = (toolContext?.requestContext?.get?.("controller") ||
					toolContext?.requestContext?.get?.("harness")) as any

				const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

				// Update active plan in state if available
				try {
					await harnessCtx?.setState?.({
						activePlan: {
							id: planId,
							title,
							plan,
							filePath: relFilePath,
							submittedAt: new Date().toISOString(),
						},
					})
				} catch {}

				// If approval hook is available, prompt user and await response
				if (harnessCtx?.registerPlanApproval && harnessCtx?.emitEvent) {
					const abortSignal = toolContext?.abortSignal
					const response = await new Promise<{
						action: "approved" | "rejected"
						feedback?: string
					}>((resolve) => {
						if (abortSignal?.aborted) {
							resolve({ action: "rejected", feedback: "Operation aborted" })
							return
						}

						const onAbort = () => {
							resolve({ action: "rejected", feedback: "Operation aborted" })
						}
						abortSignal?.addEventListener?.("abort", onAbort, { once: true })

						harnessCtx.registerPlanApproval({
							planId,
							resolve: (res: {
								action: "approved" | "rejected"
								feedback?: string
							}) => {
								abortSignal?.removeEventListener?.("abort", onAbort)
								resolve(res)
							},
						})

						harnessCtx.emitEvent({
							type: "plan_approval_required",
							planId,
							title,
							plan,
							filePath: relFilePath,
						})
					})

					if (response.action === "approved") {
						try {
							harnessCtx.emitEvent?.({ type: "plan_approved", planId })
						} catch {}

						return {
							content: `Plan "${title}" has been APPROVED by the user.\nSaved at: ${relFilePath}\nWorkspace mode has been automatically switched to Build/ReAct mode for implementation.\nYou may now begin executing the steps.`,
							isError: false,
						}
					} else {
						return {
							content: `Plan "${title}" was REJECTED by the user.\nFeedback: ${response.feedback || "None"}.\nPlease revise your plan according to the feedback and call submit_plan again when ready.`,
							isError: false,
						}
					}
				}

				// Fallback when UI/approval context is not present (CLI/tests)
				return {
					content: `Plan "${title}" submitted and saved to ${relFilePath} successfully.`,
					isError: false,
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error"
				return {
					content: `Failed to submit plan: ${msg}`,
					isError: true,
				}
			}
		},
	})
}
