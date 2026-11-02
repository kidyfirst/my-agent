import { describe, expect, it, vi } from "vitest"

vi.mock("ai", () => ({
	wrapLanguageModel: ({ model, middleware }: any) => ({ model, middleware }),
}))

import { withThinkingOptions } from "../thinking"

/** Runs the middleware's `transformParams` and returns the provider options it injected. */
async function optionsFor(
	provider: "deepseek" | "openai" | "anthropic",
	level: string | undefined,
): Promise<Record<string, any>> {
	const wrapped = withThinkingOptions({} as any, provider, level) as any
	const params = await wrapped.middleware.transformParams({ params: {} })
	return params.providerOptions
}

/** Runs the middleware over a prompt and returns the messages that would be sent. */
async function messagesFor(
	provider: "deepseek" | "openai" | "anthropic",
	prompt: any[],
): Promise<any[]> {
	const wrapped = withThinkingOptions({} as any, provider, "high") as any
	const params = await wrapped.middleware.transformParams({
		params: { prompt },
	})
	return params.prompt
}

describe("withThinkingOptions / deepseek", () => {
	// Mapping source: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
	it("declares thinking enabled alongside the mapped effort", async () => {
		const expected: Record<string, string> = {
			low: "low",
			medium: "high",
			high: "high",
			xhigh: "high",
		}

		for (const [level, effort] of Object.entries(expected)) {
			const options = await optionsFor("deepseek", level)
			// Request-level options are read from the provider name given to
			// createOpenAICompatible, not the `openai` key the OpenAI provider uses.
			expect(options.deepseek.reasoningEffort).toBe(effort)
			expect(options.deepseek.thinking).toEqual({ type: "enabled" })
		}
	})

	it("disables thinking through the flag instead of a 'none' effort", async () => {
		const options = await optionsFor("deepseek", "off")
		expect(options.deepseek.thinking).toEqual({ type: "disabled" })
		// `none` is not a valid reasoning_effort for DeepSeek.
		expect(options.deepseek.reasoningEffort).toBeUndefined()
	})

	it("never sends 'max', which no UI level maps to", async () => {
		for (const level of ["low", "medium", "high", "xhigh"]) {
			const options = await optionsFor("deepseek", level)
			expect(options.deepseek.reasoningEffort).not.toBe("max")
		}
	})

	it("round-trips reasoning_content on assistant messages", async () => {
		// DeepSeek 400s a follow-up tool call whose chain of thought was not echoed.
		const [messages] = await messagesFor("deepseek", [
			{
				role: "assistant",
				content: [
					{ type: "reasoning", text: "look at the file" },
					{ type: "tool-call", toolCallId: "c1", toolName: "view", input: {} },
				],
			},
		])
		expect(messages.providerOptions.openaiCompatible.reasoning_content).toBe(
			"look at the file",
		)
	})

	it("keeps an empty reasoning_content, which is what the empty case needs", async () => {
		// A truthiness check inside the provider drops empty text; an empty string is
		// still meaningful to DeepSeek and must reach the request. Source: the docs
		// and the provider's own truthiness guard.
		const [messages] = await messagesFor("deepseek", [
			{
				role: "assistant",
				content: [
					{ type: "reasoning", text: "" },
					{ type: "tool-call", toolCallId: "c2", toolName: "view", input: {} },
				],
			},
		])
		expect(messages.providerOptions.openaiCompatible.reasoning_content).toBe("")
	})

	it("leaves messages without reasoning untouched", async () => {
		const [messages] = await messagesFor("deepseek", [
			{ role: "assistant", content: [{ type: "text", text: "hi" }] },
		])
		expect(messages.providerOptions).toBeUndefined()
	})

	it("wraps bare-string user content into a text part", async () => {
		// createOpenAICompatible throws "content.map is not a function" on a string.
		const [messages] = await messagesFor("deepseek", [
			{ role: "user", content: "hello" },
		])
		expect(messages.content).toEqual([{ type: "text", text: "hello" }])
	})

	it("preserves flat string on file parts for DeepSeek without wrapping into an object", async () => {
		const [messages] = await messagesFor("deepseek", [
			{
				role: "user",
				content: [{ type: "file", mediaType: "image/png", data: "base64data" }],
			},
		])
		expect(messages.content[0].data).toBe("base64data")
	})

	it("unwraps accidental { type: 'data', data } on file parts for DeepSeek back to flat base64 string", async () => {
		const [messages] = await messagesFor("deepseek", [
			{
				role: "user",
				content: [
					{
						type: "file",
						mediaType: "image/png",
						data: { type: "data", data: "base64data" },
					},
				],
			},
		])
		expect(messages.content[0].data).toBe("base64data")
	})
})

describe("withThinkingOptions / openai", () => {
	it("passes effort through verbatim", async () => {
		const options = await optionsFor("openai", "medium")
		expect(options.openai.reasoningEffort).toBe("medium")
		// The thinking flag is DeepSeek-only; OpenAI rejects unknown options.
		expect(options.openai.thinking).toBeUndefined()
	})

	it("sends no options when thinking is off", async () => {
		const wrapped = withThinkingOptions({} as any, "openai", "off") as any
		const params = await wrapped.middleware.transformParams({ params: {} })
		// OpenAI still needs the wrapper for prompt compatibility, but with no options.
		expect(params.providerOptions).toEqual({})
	})

	it("does not rewrite the prompt", async () => {
		const [messages] = await messagesFor("openai", [
			{ role: "user", content: "hello" },
		])
		expect(messages.content).toBe("hello")
	})
})

describe("withThinkingOptions / anthropic", () => {
	it("maps the level to a token budget", async () => {
		const options = await optionsFor("anthropic", "high")
		expect(options.anthropic.thinking).toEqual({
			type: "enabled",
			budgetTokens: 16384,
		})
	})

	it("returns the model untouched when thinking is off", async () => {
		const model = { marker: true }
		expect(withThinkingOptions(model as any, "anthropic", "off")).toBe(model)
	})

	it("wraps string file parts into { type: 'data', data } for Anthropic", async () => {
		const [messages] = await messagesFor("anthropic", [
			{
				role: "user",
				content: [{ type: "file", mediaType: "image/png", data: "base64data" }],
			},
		])
		expect(messages.content[0].data).toEqual({
			type: "data",
			data: "base64data",
		})
	})
})
