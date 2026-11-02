/**
 * request_sandbox_access tool — requests permission to access a directory outside the project root.
 * The user can approve or deny the request via TUI dialog.
 */

import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import * as path from "path"
import type { HarnessRequestContext } from "../harness/index.js"
import { isPathAllowed, getAllowedPathsFromContext } from "./utils.js"

let requestCounter = 0

export const requestSandboxAccessTool = createTool({
	id: "request_sandbox_access",
	description: `Request permission to access a directory outside the current project. Use this when you need to read or write files in a directory that is not within the project root. The user will be prompted to approve or deny the request.`,
	inputSchema: z.object({
		path: z
			.string()
			.min(1)
			.describe("The absolute path to the directory you need access to."),
		reason: z
			.string()
			.min(1)
			.describe("Brief explanation of why you need access to this directory."),
	}),
	execute: async ({ path: requestedPath, reason }, context) => {
		try {
			const harnessCtx = ((context as any)?.requestContext?.get?.("harness") ||
				(context as any)?.requestContext?.get?.("controller")) as any

			// Resolve to absolute path
			const absolutePath = path.isAbsolute(requestedPath)
				? requestedPath
				: path.resolve(process.cwd(), requestedPath)

			// Check if already allowed
			const projectRoot = process.cwd()
			const allowedPaths = getAllowedPathsFromContext(context)
			if (isPathAllowed(absolutePath, projectRoot, allowedPaths)) {
				return {
					content: `Access already granted: "${absolutePath}" is within the project root or allowed paths.`,
					isError: false,
				}
			}

			if (!harnessCtx?.emitEvent || !harnessCtx?.registerQuestion) {
				return {
					content: `Cannot request sandbox access for "${absolutePath}": approval UI context not available. Files outside the project root cannot be accessed.`,
					isError: true,
				}
			}

			const questionId = `sandbox_${++requestCounter}_${Date.now()}`

			// Create a promise that resolves when the user answers in the TUI
			const answer = await new Promise<string>((resolve) => {
				// Register the resolver so respondToQuestion() can resolve it
				harnessCtx.registerQuestion!({ questionId, resolve })

				// Emit event — UI will show the dialog
				harnessCtx.emitEvent!({
					type: "ask_question" as any,
					questionId,
					question: `Grant access to "${absolutePath}"?\nReason: ${reason}`,
					options: [
						{ label: "Approve", description: "Allow access to this directory" },
						{ label: "Deny", description: "Reject access to this directory" },
					],
				})
			})

			const approved =
				answer.toLowerCase().startsWith("y") ||
				answer.toLowerCase() === "approve"

			if (approved) {
				// Add to allowed paths
				const currentAllowed = harnessCtx.getState()?.sandboxAllowedPaths ?? []
				if (!currentAllowed.includes(absolutePath)) {
					await harnessCtx.setState({
						sandboxAllowedPaths: [...currentAllowed, absolutePath],
					})
				}
				return {
					content: `Access granted: "${absolutePath}" has been added to allowed paths. You can now access files in this directory.`,
					isError: false,
				}
			} else {
				return {
					content: `Access denied: The user declined access to "${absolutePath}".`,
					isError: false,
				}
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error"
			return {
				content: `Failed to request sandbox access: ${msg}`,
				isError: true,
			}
		}
	},
})
