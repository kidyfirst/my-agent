import { describe, expect, it } from "vitest"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { withThinkingOptions } from "../harness/thinking.js"

const PROMPT = [
	{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
]

/** Runs a single request against a fake fetch and returns the captured body. */
async function captureRequest(createModel: (fetch: any) => any) {
	let body: any = null
	const fakeFetch = async (_url: unknown, init: any) => {
		body = JSON.parse(init.body)
		throw new Error("captured")
	}
	try {
		await createModel(fakeFetch).doStream({ prompt: PROMPT })
	} catch {
		// the fake fetch always throws; the body is what matters
	}
	return body
}

function deepseek(fetch: any, model = "deepseek-flash") {
	return createOpenAI({
		apiKey: "test-key",
		baseURL: "https://api.deepseek.com",
		fetch,
	}).chat(model)
}

function openai(fetch: any) {
	return createOpenAI({
		apiKey: "test-key",
		baseURL: "https://api.openai.test/v1",
		fetch,
	}).chat("gpt-5.3-codex")
}

function anthropic(fetch: any) {
	return createAnthropic({
		apiKey: "test-key",
		baseURL: "https://api.anthropic.test",
		fetch,
	})("claude-opus-4-6")
}

describe("thinking options", () => {
	it("disables DeepSeek thinking when the level is off", async () => {
		const body = await captureRequest((fetch) =>
			withThinkingOptions(deepseek(fetch), "deepseek", "off"),
		)
		expect(body.reasoning_effort).toBe("none")
	})

	it("maps DeepSeek levels onto none/low/high/max", async () => {
		const levels = [
			["low", "low"],
			["medium", "high"],
			["high", "high"],
			["xhigh", "max"],
		] as const
		for (const [level, effort] of levels) {
			const body = await captureRequest((fetch) =>
				withThinkingOptions(deepseek(fetch), "deepseek", level),
			)
			expect(body.reasoning_effort, level).toBe(effort)
		}
	})

	it("treats an unset level as off", async () => {
		const body = await captureRequest((fetch) =>
			withThinkingOptions(deepseek(fetch), "deepseek", undefined),
		)
		expect(body.reasoning_effort).toBe("none")
	})

	it("enables Anthropic thinking with a token budget", async () => {
		const body = await captureRequest((fetch) =>
			withThinkingOptions(anthropic(fetch), "anthropic", "high"),
		)
		expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 16384 })
	})

	it("leaves Anthropic and OpenAI requests untouched when thinking is off", async () => {
		const anthropicBody = await captureRequest((fetch) =>
			withThinkingOptions(anthropic(fetch), "anthropic", "off"),
		)
		expect(anthropicBody.thinking).toBeUndefined()

		const openaiBody = await captureRequest((fetch) =>
			withThinkingOptions(openai(fetch), "openai", "off"),
		)
		expect(openaiBody.reasoning_effort).toBeUndefined()

		const openaiHighBody = await captureRequest((fetch) =>
			withThinkingOptions(openai(fetch), "openai", "high"),
		)
		expect(openaiHighBody.reasoning_effort).toBe("high")
	})

	it("surfaces DeepSeek reasoning_content as reasoning parts", async () => {
		const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`
		const body =
			sse({
				id: "1",
				created: 1,
				model: "deepseek-flash",
				choices: [
					{
						index: 0,
						delta: { role: "assistant", reasoning_content: "thinking hard" },
						finish_reason: null,
					},
				],
			}) +
			sse({
				id: "1",
				created: 1,
				model: "deepseek-flash",
				choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }],
			}) +
			sse({
				id: "1",
				created: 1,
				model: "deepseek-flash",
				choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
			}) +
			"data: [DONE]\n\n"

		const fakeFetch = async () =>
			new Response(body, {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			})

		const result = await withThinkingOptions(
			deepseek(fakeFetch),
			"deepseek",
			"high",
		).doStream({ prompt: PROMPT })
		const chunks: any[] = []
		for await (const chunk of result.stream) chunks.push(chunk)

		const types = chunks.map((c) => c.type)
		expect(types).toContain("reasoning-start")
		expect(types).toContain("reasoning-delta")
		expect(types).toContain("reasoning-end")
		expect(types).not.toContain("raw")
		expect(chunks.find((c) => c.type === "reasoning-delta")?.delta).toBe(
			"thinking hard",
		)
		// Reasoning must be closed before the answer text starts streaming.
		expect(types.indexOf("reasoning-end")).toBeLessThan(
			types.indexOf("text-delta"),
		)
	})
})
