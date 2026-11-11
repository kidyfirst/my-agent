import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import { truncateStringForTokenEstimate } from "../utils/token-estimator.js"

const MAX_RETRIEVE_TOKENS = 3_000

export interface FoldedRange {
	rangeId: string
	threadId: string
	messageCount: number
	startIndex: number
	firstMessageId?: string
	lastMessageId?: string
	userGoal?: string
	createdAt: number
	messages?: any[]
}

/**
 * Creates the retrieve_folded_messages tool, enabling on-demand, reversible
 * inspection of conversation history that was compacted or folded by the sliding window.
 */
export function createRetrieveFoldedMessagesTool() {
	return createTool({
		id: "retrieve_folded_messages",
		description: `Retrieve or search messages from earlier conversation history that was compacted/folded into a folded range.

Use this tool when:
- You need to look back at earlier compiler errors, test outputs, or shell execution logs from folded history.
- You need to inspect previous code snippets, diffs, or file contents that were discussed earlier in the session.
- You see a [System Note: Earlier conversation history was folded into range "fold_XXX"] in your context and require exact details from that folded range.

If 'rangeId' is omitted, returns a table of all available folded ranges for the current thread.`,
		inputSchema: z.object({
			rangeId: z
				.string()
				.optional()
				.describe(
					"The ID of the folded range to inspect (e.g. 'fold_001'). If omitted, lists all available folded ranges.",
				),
			filter: z
				.enum(["tool_outputs", "user_messages", "all"])
				.optional()
				.default("tool_outputs")
				.describe(
					"Filter which messages to return: 'tool_outputs' (default, returns tool calls & execution results such as errors, diffs, logs), 'user_messages' (user requests), or 'all' (complete transcript).",
				),
			query: z
				.string()
				.optional()
				.describe(
					"Optional keyword or regex to filter messages containing specific terms (e.g. 'error', 'failed', function name).",
				),
			maxTokens: z
				.number()
				.optional()
				.default(MAX_RETRIEVE_TOKENS)
				.describe(
					"Maximum token budget for the returned content (defaults to 3000 to prevent re-overflowing the context window).",
				),
		}),
		execute: async (context, toolContext) => {
			try {
				const {
					rangeId,
					filter = "tool_outputs",
					query,
					maxTokens = MAX_RETRIEVE_TOKENS,
				} = context
				const reqCtx = (toolContext as any)?.requestContext
				const controller =
					reqCtx?.get?.("controller") ||
					reqCtx?.get?.("harness") ||
					(toolContext as any)?.controller
				const session = reqCtx?.get?.("session") as any
				const threadId =
					reqCtx?.get?.("threadId") ||
					session?.threadId ||
					controller?.activeThreadId ||
					controller?.getActiveThreadId?.()

				if (!controller) {
					return {
						content:
							"No active controller found to query folded history ranges.",
						isError: true,
					}
				}

				const getFoldedRanges =
					typeof controller.getFoldedRanges === "function"
						? controller.getFoldedRanges.bind(controller)
						: () => []

				const ranges: FoldedRange[] = threadId ? getFoldedRanges(threadId) : []

				if (ranges.length === 0) {
					return {
						content:
							"No folded history ranges exist for this thread yet. All conversation history is currently visible in the active context.",
						isError: false,
					}
				}

				// If no rangeId specified, return directory of available ranges
				if (!rangeId) {
					const rangeList = ranges
						.map((r) => {
							const date = new Date(r.createdAt).toLocaleTimeString()
							const goal = r.userGoal
								? ` - Task: "${r.userGoal.slice(0, 80)}${r.userGoal.length > 80 ? "..." : ""}"`
								: ""
							return `- [${r.rangeId}] (${r.messageCount} messages, folded at ${date})${goal}`
						})
						.join("\n")

					return {
						content: `Available folded history ranges in this session:\n\n${rangeList}\n\nCall \`retrieve_folded_messages\` with rangeId (e.g. { rangeId: "${ranges[0].rangeId}" }) to inspect specific details.`,
						isError: false,
					}
				}

				// Look up requested range
				const targetRange = ranges.find((r) => r.rangeId === rangeId)
				if (!targetRange) {
					const available = ranges.map((r) => r.rangeId).join(", ")
					return {
						content: `Folded range '${rangeId}' not found. Available ranges: ${available}`,
						isError: true,
					}
				}

				const rawMessages: any[] = targetRange.messages || []
				if (rawMessages.length === 0) {
					return {
						content: `Folded range '${rangeId}' exists but has no cached messages available.`,
						isError: false,
					}
				}

				// Apply filter
				let filtered = rawMessages
				if (filter === "tool_outputs") {
					filtered = rawMessages.filter(
						(m) =>
							m.role === "tool" ||
							(Array.isArray(m.content) &&
								m.content.some(
									(p: any) =>
										p.type === "tool-result" || p.type === "tool-call",
								)),
					)
				} else if (filter === "user_messages") {
					filtered = rawMessages.filter((m) => m.role === "user")
				}

				// Apply optional search query
				if (query) {
					const qLower = query.toLowerCase()
					filtered = filtered.filter((m) => {
						const text =
							typeof m.content === "string"
								? m.content
								: JSON.stringify(m.content || "")
						return text.toLowerCase().includes(qLower)
					})
				}

				if (filtered.length === 0) {
					return {
						content: `Folded range '${rangeId}' contains ${rawMessages.length} messages, but none matched filter='${filter}'${query ? ` and query='${query}'` : ""}.`,
						isError: false,
					}
				}

				// Format retrieved messages for LLM inspection
				const formatted = filtered
					.map((m, idx) => {
						const role = (m.role || "unknown").toUpperCase()
						let body = ""
						if (typeof m.content === "string") {
							body = m.content
						} else if (Array.isArray(m.content)) {
							body = m.content
								.map((p: any) => {
									if (p.type === "text") return p.text || ""
									if (p.type === "tool-call") {
										return `[Tool Call: ${p.toolName}(${JSON.stringify(p.args || {})})]`
									}
									if (p.type === "tool-result") {
										return `[Tool Result: ${JSON.stringify(p.result || "")}]`
									}
									return JSON.stringify(p)
								})
								.join("\n")
						} else {
							body = JSON.stringify(m.content)
						}
						return `### Message ${idx + 1} [${role}]\n${body}`
					})
					.join("\n\n---\n\n")

				const header = `# Retrieved Folded History [${rangeId}] (${filtered.length} matched / ${targetRange.messageCount} total messages in range)\n\n`
				const output = truncateStringForTokenEstimate(
					header + formatted,
					maxTokens,
					false,
				)

				return {
					content: output,
					isError: false,
				}
			} catch (err: any) {
				return {
					content: `Failed to retrieve folded messages: ${err.message || String(err)}`,
					isError: true,
				}
			}
		},
	})
}
