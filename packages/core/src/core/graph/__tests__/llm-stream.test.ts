import { describe, expect, it, vi, beforeEach } from "vitest"

// streamText is fed per-test chunks; wrapLanguageModel must stay a passthrough.
let testChunks: any[] = []
vi.mock("ai", () => ({
	streamText: () => ({
		fullStream: (async function* () {
			for (const c of testChunks) yield c
		})(),
	}),
	wrapLanguageModel: (_: unknown, model: unknown) => model,
}))

import {
	executeStreamLLM,
	buildMessageParts,
	stallWatchdog,
} from "../llm-stream.js"

/** Turns an array of [delayMs, chunk] pairs into an async iterable. */
async function* timedStream(chunks: Array<[number, any]>): AsyncGenerator<any> {
	for (const [delay, chunk] of chunks) {
		await new Promise((r) => setTimeout(r, delay))
		if (chunk === Symbol.for("done")) return
		yield chunk
	}
}

const collect = async (stream: AsyncIterable<any>) => {
	const out: any[] = []
	for await (const chunk of stream) out.push(chunk)
	return out
}

describe("stallWatchdog", () => {
	it("passes chunks through when the stream keeps producing", async () => {
		const chunks = await collect(
			stallWatchdog(
				timedStream([
					[1, { type: "text-delta", text: "a" }],
					[1, { type: "text-delta", text: "b" }],
				]),
				50,
			),
		)
		expect(chunks.map((c) => c.text)).toEqual(["a", "b"])
	})

	it("fails the stream when the provider goes silent", async () => {
		await expect(
			collect(
				stallWatchdog(
					timedStream([
						[1, { type: "text-delta", text: "The" }],
						// Far beyond the 20ms watchdog: this is the "service is too
						// busy and never responds" hang.
						[500, { type: "text-delta", text: "rest" }],
					]),
					20,
				),
			),
		).rejects.toThrow(/stalled/)
	})

	it("does not fire while a tool call is executing", async () => {
		// A subagent can legitimately run minutes without emitting chunks; the
		// gap between tool-call and tool-result must not trip the watchdog.
		const chunks = await collect(
			stallWatchdog(
				timedStream([
					[1, { type: "tool-call", toolName: "subagent" }],
					// 200ms of tool execution with a 20ms watchdog: survives.
					[200, { type: "tool-result", toolName: "subagent" }],
					[1, { type: "text-delta", text: "done" }],
				]),
				20,
			),
		)
		expect(chunks.map((c) => c.type)).toEqual([
			"tool-call",
			"tool-result",
			"text-delta",
		])
	})

	it("arms again after the tool result lands", async () => {
		await expect(
			collect(
				stallWatchdog(
					timedStream([
						[1, { type: "tool-call", toolName: "subagent" }],
						[1, { type: "tool-result", toolName: "subagent" }],
						// Back to generation: silence now trips the watchdog.
						[500, { type: "text-delta", text: "never" }],
					]),
					20,
				),
			),
		).rejects.toThrow(/stalled/)
	})
})

describe("executeStreamLLM - persisted tool state", () => {
	beforeEach(() => {
		testChunks = []
	})

	const run = (emit: (ev: any) => void) =>
		executeStreamLLM({
			model: {} as any,
			modelIdStr: "test-model",
			instructions: "",
			messages: [],
			abortSignal: new AbortController().signal,
			assistantMessageId: "a1",
			emit,
		})

	it("persists v5-shaped tool input and output (input/output, not args/result)", async () => {
		testChunks = [
			{
				type: "tool-call",
				toolCallId: "call_1",
				toolName: "subagent",
				input: { task: "create demo file" },
			},
			{
				type: "tool-result",
				toolCallId: "call_1",
				toolName: "subagent",
				output: 'done <subagent-meta durationMs="4200" tools="view:ok" />',
			},
			{ type: "text-delta", text: "ok" },
			{ type: "finish", finishReason: "stop" },
		]
		const result = await run(() => {})
		expect(result.executedTools).toHaveLength(1)
		expect(result.executedTools[0].args).toEqual({ task: "create demo file" })
		expect(result.executedTools[0].result).toContain("subagent-meta")
		expect(result.executedTools[0].isError).toBeFalsy()

		// The persisted parts must carry args and a tool-result part — the
		// renderer rebuilds Agent cards from exactly these after a reload.
		const { parts } = buildMessageParts(
			result.assistantText,
			result.reasoningText,
			result.executedTools,
		)
		const call = parts.find((p: any) => p.type === "tool-call") as any
		const res = parts.find((p: any) => p.type === "tool-result") as any
		expect(call.args).toEqual({ task: "create demo file" })
		expect(res.result).toContain("subagent-meta")
	})

	it("marks tools failed on the v5 tool-error chunk", async () => {
		testChunks = [
			{
				type: "tool-call",
				toolCallId: "call_2",
				toolName: "subagent",
				input: { task: "boom" },
			},
			{
				type: "tool-error",
				toolCallId: "call_2",
				toolName: "subagent",
				error: "Service is too busy",
			},
			{ type: "finish", finishReason: "stop" },
		]
		const result = await run(() => {})
		expect(result.executedTools[0].isError).toBe(true)
		expect(result.executedTools[0].result).toBe("Service is too busy")
	})
})
