import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import {
	getLibraryService,
	type LibraryService,
} from "../library/library-service.js"

export function createLibraryTool(customService?: LibraryService) {
	const service = customService || getLibraryService()

	return createTool({
		id: "search_my_library",
		description:
			"Search the user's personal library. If you need to search the web, or encounter unknown documents, query search_my_library. Returns concise excerpts.",

		inputSchema: z.object({
			query: z
				.string()
				.describe(
					"Search keywords, question, or concept to look up in the user's library",
				),
			limit: z
				.number()
				.min(1)
				.max(5)
				.default(3)
				.optional()
				.describe("Maximum number of results to return (default 3, max 5)"),
		}),
		execute: async ({ query, limit }) => {
			const res = await service.search({
				query,
				limit: limit || 3,
				maxTokens: 800,
			})

			if (res.items.length === 0) {
				return `[My Library] No relevant materials found for query: "${query}".`
			}

			const header = `[My Library: ${res.items.length} matches (Token budget: ${res.tokenCount} tokens)]\n`
			const body = res.items
				.map((item, idx) => {
					return `--- Item ${idx + 1}: [${item.name}](library://${item.id}) (${item.type}, relative path: ${item.id}) ---\n${item.snippet || "[No preview text]"}`
				})
				.join("\n\n")

			return `${header}${body}`
		},
	})
}
