import { describe, it, expect } from "vitest"
import {
	addCacheControlToMessage,
	applyPromptCacheBreakpoints,
	promptCacheMiddleware,
	sortToolsByName,
} from "../prompt-cache.js"

describe("Prompt Caching (align with model providers)", () => {
	it("adds cacheControl to string and array content messages", () => {
		const strMsg = { role: "system", content: "You are an assistant" }
		const withCacheStr = addCacheControlToMessage(strMsg)
		expect(withCacheStr.providerOptions.anthropic.cacheControl).toEqual({
			type: "ephemeral",
		})
		expect(withCacheStr.providerOptions.google.cacheControl).toEqual({
			type: "ephemeral",
		})

		const arrayMsg = {
			role: "user",
			content: [
				{ type: "text", text: "Part 1" },
				{ type: "text", text: "Part 2" },
			],
		}
		const withCacheArr = addCacheControlToMessage(arrayMsg)
		// For array content, cacheControl must be on the last part for Anthropic
		expect(
			withCacheArr.content[1].providerOptions.anthropic.cacheControl,
		).toEqual({
			type: "ephemeral",
		})
		expect(withCacheArr.content[0].providerOptions).toBeUndefined()
	})

	it("applies cache breakpoint on last system message in a single-turn request", () => {
		const prompt = [
			{ role: "system", content: "System instructions" },
			{ role: "user", content: "Hello" },
		]
		const cached = applyPromptCacheBreakpoints(prompt)
		expect(cached[0].providerOptions.anthropic.cacheControl).toEqual({
			type: "ephemeral",
		})
		expect(cached[1].providerOptions).toBeUndefined()
	})

	it("applies cache breakpoint on second-to-last user message in multi-turn request", () => {
		const prompt = [
			{ role: "system", content: "System instructions" },
			{ role: "user", content: "Turn 1 user" },
			{ role: "assistant", content: "Turn 1 assistant" },
			{ role: "user", content: "Turn 2 user" },
			{ role: "assistant", content: "Turn 2 assistant" },
			{ role: "user", content: "Turn 3 user (current turn)" },
		]
		const cached = applyPromptCacheBreakpoints(prompt)

		// Breakpoint 1: System prompt
		expect(cached[0].providerOptions.anthropic.cacheControl).toEqual({
			type: "ephemeral",
		})

		// Breakpoint 2: Second-to-last user message (Turn 2 user)
		// Everything up to Turn 2 user + Turn 2 assistant is cached!
		expect(cached[3].content).toBe("Turn 2 user")
		expect(cached[3].providerOptions.anthropic.cacheControl).toEqual({
			type: "ephemeral",
		})

		// Latest turn (Turn 3) is NOT tagged so it executes freshly
		expect(cached[5].providerOptions).toBeUndefined()
	})

	it("sorts tool dictionaries alphabetically to guarantee deterministic tool schema ordering", () => {
		const unsorted = {
			write_file: { description: "Write file" },
			view: { description: "View file" },
			ast_smart_edit: { description: "AST edit" },
			grep: { description: "Grep" },
		}
		const sorted = sortToolsByName(unsorted)
		expect(Object.keys(sorted)).toEqual([
			"ast_smart_edit",
			"grep",
			"view",
			"write_file",
		])
	})

	it("transforms params via promptCacheMiddleware", async () => {
		const params: any = {
			prompt: [
				{ role: "system", content: "System" },
				{ role: "user", content: "Hi" },
			],
		}
		const transformed = await (promptCacheMiddleware as any).transformParams({
			params,
		})
		expect(
			transformed.prompt[0].providerOptions.anthropic.cacheControl,
		).toEqual({
			type: "ephemeral",
		})
	})
})
