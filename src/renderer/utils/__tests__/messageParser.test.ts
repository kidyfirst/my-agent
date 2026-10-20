import { describe, it, expect } from "vitest"
import {
	extractThinkingFromText,
	normalizeMessageContent,
	extractMessageDetails,
} from "../messageParser"

describe("messageParser", () => {
	describe("extractThinkingFromText", () => {
		it("returns empty thinking and clean text for regular markdown", () => {
			const text = "Hello world! Here is some **markdown** code."
			const res = extractThinkingFromText(text)
			expect(res.extractedThinking).toBe("")
			expect(res.cleanText).toBe(text)
			expect(res.isStreamingThinking).toBe(false)
		})

		it("extracts closed <think>...</think> tags", () => {
			const text =
				"<think>\nThinking step 1.\nThinking step 2.\n</think>\nHere is the answer."
			const res = extractThinkingFromText(text)
			expect(res.extractedThinking).toBe("Thinking step 1.\nThinking step 2.")
			expect(res.cleanText).toBe("Here is the answer.")
			expect(res.isStreamingThinking).toBe(false)
		})

		it("extracts unclosed <think> tag during streaming", () => {
			const text = "<think>\nI am currently reasoning about this problem..."
			const res = extractThinkingFromText(text)
			expect(res.extractedThinking).toBe(
				"I am currently reasoning about this problem...",
			)
			expect(res.cleanText).toBe("")
			expect(res.isStreamingThinking).toBe(true)
		})

		it("handles multiple thinking tags", () => {
			const text =
				"<think>Part 1</think>Some intermediate text<thought>Part 2</thought>Final answer"
			const res = extractThinkingFromText(text)
			expect(res.extractedThinking).toBe("Part 1\n\nPart 2")
			expect(res.cleanText).toBe("Some intermediate textFinal answer")
			expect(res.isStreamingThinking).toBe(false)
		})

		it("handles pre-text before an unclosed streaming think tag", () => {
			const text = "Prefix text.<think>Streaming thinking"
			const res = extractThinkingFromText(text)
			expect(res.cleanText).toBe("Prefix text.")
			expect(res.extractedThinking).toBe("Streaming thinking")
			expect(res.isStreamingThinking).toBe(true)
		})
	})

	describe("normalizeMessageContent", () => {
		it("normalizes string content", () => {
			const res = normalizeMessageContent("test string")
			expect(res).toEqual([{ type: "text", text: "test string" }])
		})

		it("normalizes array of strings", () => {
			const res = normalizeMessageContent(["hello", "world"])
			expect(res).toEqual([
				{ type: "text", text: "hello" },
				{ type: "text", text: "world" },
			])
		})

		it("normalizes object with parts", () => {
			const res = normalizeMessageContent({
				parts: [{ type: "text", text: "part text" }],
			})
			expect(res).toEqual([{ type: "text", text: "part text" }])
		})

		it("normalizes object with text property", () => {
			const res = normalizeMessageContent({ text: "obj text" })
			expect(res).toEqual([{ type: "text", text: "obj text" }])
		})

		it("uses fallback text if content is empty", () => {
			const res = normalizeMessageContent([], "fallback text")
			expect(res).toEqual([{ type: "text", text: "fallback text" }])
		})

		it("normalizes JSON string containing format 2 parts array", () => {
			const jsonStr = JSON.stringify({
				format: 2,
				parts: [{ type: "text", text: "test" }],
				metadata: { signal: { type: "user" } },
			})
			const res = normalizeMessageContent(jsonStr)
			expect(res).toEqual([{ type: "text", text: "test" }])
		})

		it("normalizes data-user-message signal object", () => {
			const part = {
				type: "data-user-message",
				data: { contents: "hello from signal" },
			}
			const res = normalizeMessageContent([part])
			expect(res).toEqual([{ type: "text", text: "hello from signal" }])
		})
	})

	describe("extractMessageDetails", () => {
		it("extracts structured thinking blocks and text", () => {
			const content = [
				{ type: "thinking", thinking: "Structured thought" },
				{ type: "text", text: "Main text" },
			]
			const res = extractMessageDetails(content)
			expect(res.thinking).toBe("Structured thought")
			expect(res.text).toBe("Main text")
			expect(res.isStreamingThinking).toBe(false)
		})

		it("extracts reasoning blocks with .text", () => {
			const content = [
				{ type: "reasoning", text: "Reasoning in text field" },
				{ type: "text", text: "Solution" },
			]
			const res = extractMessageDetails(content)
			expect(res.thinking).toBe("Reasoning in text field")
			expect(res.text).toBe("Solution")
		})

		it("combines structured thinking and embedded <think> tags", () => {
			const content = [
				{ type: "thinking", thinking: "Thought part 1" },
				{ type: "text", text: "<think>Thought part 2</think>Clean message" },
			]
			const res = extractMessageDetails(content)
			expect(res.thinking).toBe("Thought part 1\n\nThought part 2")
			expect(res.text).toBe("Clean message")
		})

		it("flags redacted thinking", () => {
			const content = [
				{ type: "redacted_thinking", data: "hidden" },
				{ type: "text", text: "Hello" },
			]
			const res = extractMessageDetails(content)
			expect(res.hasRedactedThinking).toBe(true)
			expect(res.text).toBe("Hello")
		})
	})
})
