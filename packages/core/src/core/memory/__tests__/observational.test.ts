import { describe, expect, it, vi } from "vitest"
import {
	formatObservationalMemory,
	formatTranscript,
	resolveBlockAfter,
	runObservationStep,
	selectRecentMessages,
	splitByTokenBudget,
} from "../observational.js"
import { TokenCounter } from "../../../memory/token-counter.js"

const counter = new TokenCounter()

function fakeModel(text: string) {
	return { generate: vi.fn(async () => ({ text })) }
}

describe("resolveBlockAfter", () => {
	it("treats a small number as a multiplier of the base threshold", () => {
		expect(resolveBlockAfter(2, 30_000, 1.1)).toBe(60_000)
	})

	it("treats a number >= 100 as an absolute token count", () => {
		expect(resolveBlockAfter(120, 30_000, 1.1)).toBe(120)
	})

	it("falls back to the default ratio when unset", () => {
		expect(resolveBlockAfter(undefined, 40_000, 1.1)).toBe(44_000)
	})
})

describe("selectRecentMessages", () => {
	it("keeps the newest messages that fit the budget", () => {
		const messages = [
			{ id: "1", role: "user", content: "a".repeat(400) },
			{ id: "2", role: "assistant", content: "b".repeat(400) },
			{ id: "3", role: "user", content: "c".repeat(40) },
		]
		const { recent, folded } = selectRecentMessages(messages, 20, counter)
		expect(recent.map((m) => m.id)).toEqual(["3"])
		expect(folded.map((m) => m.id)).toEqual(["1", "2"])
	})

	it("skips a leading tool result so the window never orphans a tool call", () => {
		const messages = [
			{ id: "1", role: "assistant", content: "x".repeat(400) },
			{ id: "2", role: "tool", content: "y".repeat(40) },
			{ id: "3", role: "user", content: "z".repeat(40) },
		]
		// Budget sized to admit the tool result and the user message but not the
		// assistant turn before them, so the window genuinely starts on a tool
		// result. A tighter budget would break before reaching it and the skip
		// would never run; a looser one would pull in a non-tool message.
		const { recent, folded } = selectRecentMessages(messages, 40, counter)
		expect(recent.map((m) => m.id)).toEqual(["3"])
		expect(folded.map((m) => m.id)).toEqual(["1", "2"])
	})
})

describe("formatTranscript", () => {
	it("prefers array text parts and ignores non-text parts", () => {
		const out = formatTranscript([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "hello" },
					{ type: "tool-call", toolName: "grep" },
				],
			},
		])
		expect(out).toBe("assistant: hello")
	})
})

describe("runObservationStep", () => {
	const config = {
		observation: {
			messageTokens: 1000,
			bufferTokens: 1 / 5,
			blockAfter: 2,
			model: fakeModel("- auth lives in src/auth.ts"),
		},
		reflection: {
			observationTokens: 4000,
			blockAfter: 1.1,
		},
	}

	it("does nothing below the buffering threshold and does not call the model", async () => {
		const model = fakeModel("- should not run")
		const step = await runObservationStep({
			config: { observation: { ...config.observation, model } },
			record: null,
			messages: [{ id: "1", role: "user", content: "hi" }],
			pendingTokens: 100,
		})
		expect(step.kind).toBe("none")
		expect(model.generate).not.toHaveBeenCalled()
	})

	it("observes once the buffering threshold is crossed", async () => {
		const step = await runObservationStep({
			config,
			record: null,
			messages: [{ id: "1", role: "user", content: "where is auth?" }],
			pendingTokens: 250,
		})
		expect(step.kind).toBe("observed")
		expect(step.activeObservations).toContain("src/auth.ts")
		expect(step.observedMessageIds).toEqual(["1"])
	})

	it("only folds messages not already observed", async () => {
		const model = { generate: vi.fn(async () => ({ text: "- new fact" })) }
		const step = await runObservationStep({
			config: { observation: { ...config.observation, model } },
			record: { activeObservations: "- old fact", observedMessageIds: ["1"] },
			messages: [{ id: "2", role: "user", content: "next question" }],
			pendingTokens: 250,
		})
		const prompt = (model.generate.mock.calls[0] as any[])[0].prompt as string
		expect(prompt).toContain("next question")
		expect(prompt).toContain("- old fact")
		expect(step.activeObservations).toContain("- old fact")
		expect(step.activeObservations).toContain("- new fact")
		expect(step.observedMessageIds).toEqual(["1", "2"])
	})

	it("reports blocking only once past the synchronous threshold", async () => {
		const below = await runObservationStep({
			config,
			record: null,
			messages: [{ id: "1", role: "user", content: "x" }],
			pendingTokens: 500,
		})
		const above = await runObservationStep({
			config,
			record: null,
			messages: [{ id: "1", role: "user", content: "x" }],
			pendingTokens: 2500,
		})
		expect(below.blocked).toBe(false)
		expect(above.blocked).toBe(true)
	})

	it("reflects instead of observing when the log itself is oversized", async () => {
		const reflector = { generate: vi.fn(async () => ({ text: "- merged" })) }
		const longLog = Array.from({ length: 900 }, (_, i) => `- fact ${i}`).join(
			"\n",
		)
		const step = await runObservationStep({
			config: {
				observation: config.observation,
				reflection: { ...config.reflection, model: reflector },
			},
			record: { activeObservations: longLog, observationTokenCount: 5000 },
			messages: [{ id: "1", role: "user", content: "more" }],
			pendingTokens: 250,
		})
		expect(step.kind).toBe("reflected")
		expect(step.activeObservations).toBe("- merged")
		expect(reflector.generate).toHaveBeenCalled()
	})
})

describe("splitByTokenBudget", () => {
	it("splits on line boundaries and never severs a fact", () => {
		const text = "- alpha fact\n- beta fact\n- gamma fact"
		const { admitted, deferred } = splitByTokenBudget(text, 12, counter)
		// Every admitted line must be one of the original lines, not a fragment.
		for (const line of admitted.split("\n")) {
			expect(text.split("\n")).toContain(line)
		}
		expect(admitted.length + deferred.length).toBeGreaterThan(0)
		expect(`${admitted}\n${deferred}`).toContain("- gamma fact")
	})

	it("defers everything when even the first line exceeds the budget", () => {
		const { admitted, deferred } = splitByTokenBudget(
			"- a very long single fact that will not fit",
			1,
			counter,
		)
		expect(admitted).toBe("")
		expect(deferred).toContain("very long single fact")
	})

	it("admits everything when the budget is unbounded", () => {
		const { admitted, deferred } = splitByTokenBudget(
			"- x\n- y",
			Infinity,
			counter,
		)
		expect(admitted).toBe("- x\n- y")
		expect(deferred).toBe("")
	})
})

describe("bufferActivation deferral", () => {
	const config = {
		observation: {
			messageTokens: 1000,
			bufferTokens: 1 / 5,
			blockAfter: 2,
			bufferActivation: 10,
			model: {
				generate: async () => ({
					text: "- first fact here\n- second fact here\n- third fact here\n- fourth fact here",
				}),
			},
		},
	}

	it("defers the overflow instead of dropping it", async () => {
		const step = await runObservationStep({
			config,
			record: null,
			messages: [{ id: "1", role: "user", content: "go" }],
			pendingTokens: 250,
		})
		expect(step.kind).toBe("observed")
		// Nothing may be lost: every line lands in either the log or the buffer.
		const combined = `${step.activeObservations}\n${step.bufferedObservations ?? ""}`
		for (const fact of ["first", "second", "third", "fourth"]) {
			expect(combined).toContain(`${fact} fact`)
		}
		// With a 10-token budget the active log cannot hold all four lines.
		expect(step.bufferedObservations).toBeTruthy()
		expect(step.bufferedObservationTokens).toBeGreaterThan(0)
	})

	it("re-admits previously buffered text on the next crossing", async () => {
		const step = await runObservationStep({
			config,
			record: {
				activeObservations: "- existing",
				observedMessageIds: ["0"],
				bufferedObservations: "- carried over from before",
			},
			messages: [{ id: "2", role: "user", content: "more" }],
			pendingTokens: 250,
		})
		const combined = `${step.activeObservations}\n${step.bufferedObservations ?? ""}`
		expect(combined).toContain("carried over from before")
	})

	it("admits everything when bufferActivation is unset", async () => {
		const step = await runObservationStep({
			config: {
				observation: {
					messageTokens: 1000,
					bufferTokens: 1 / 5,
					model: {
						generate: async () => ({ text: "- a\n- b\n- c" }),
					},
				},
			},
			record: null,
			messages: [{ id: "1", role: "user", content: "go" }],
			pendingTokens: 250,
		})
		expect(step.activeObservations).toContain("- c")
		expect(step.bufferedObservations ?? null).toBeNull()
	})
})

describe("formatObservationalMemory", () => {
	it("returns null for an empty log", () => {
		expect(formatObservationalMemory(null)).toBeNull()
		expect(formatObservationalMemory("   ")).toBeNull()
	})

	it("marks the log as a summary so the model re-reads instead of trusting it", () => {
		const out = formatObservationalMemory("- thing")!
		expect(out).toContain("# Observational Memory")
		expect(out).toContain("summary, not a verbatim transcript")
		expect(out).toContain("- thing")
	})
})
