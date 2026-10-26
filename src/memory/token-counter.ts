import type { MyAgentDBMessage } from "../core/index.js"

export class TokenCounter {
	estimateTokens(text: string): number {
		if (!text) return 0
		// Standard heuristic: ~4 characters per token on average for code and English prose
		return Math.max(1, Math.ceil(text.length / 4))
	}

	countMessage(message: MyAgentDBMessage): number {
		const c = (message as any)?.content
		const text =
			typeof c === "string"
				? c
				: (c as any)?.content || (message as any)?.text || ""
		return this.estimateTokens(text)
	}
}
