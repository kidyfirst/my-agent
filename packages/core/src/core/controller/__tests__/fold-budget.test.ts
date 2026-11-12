import { describe, it, expect } from "vitest"
import { MockLanguageModelV3 } from "ai/test"
import { SQLiteStore } from "../../../store/index.js"
import { AgentController } from "../controller.js"
import { Agent } from "../../agent/index.js"
import { computeMaxHistoryTokens } from "../../llm/context-window.js"

/**
 * The folding loop walks history backwards, adding messages to a running
 * budget and stopping as soon as the next message would push the request
 * over the limit. These tests pin that behaviour: it must fold just enough
 * to fit, not everything it is allowed to fold. A regression here is silent
 * -- the request still succeeds, it just arrives with far less history than
 * it needed to discard.
 */

function streamOf(chunks: any[]): ReadableStream {
	let index = 0
	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) controller.enqueue(chunks[index++])
			else controller.close()
		},
	})
}

function reply(text: string) {
	return {
		stream: streamOf([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "0" },
			{ type: "text-delta", id: "0", delta: text },
			{ type: "text-end", id: "0" },
			{
				type: "finish",
				finishReason: "stop",
				usage: {
					inputTokens: { total: 10, prompt: 10 },
					outputTokens: { total: 10, completion: 10 },
				},
			},
		]),
		warnings: [],
	}
}

/** Reads the "N messages folded" count out of the note the folding step prepends. */
function foldedCount(prompt: any[]): number | null {
	const note = prompt.find((p: any) => {
		const str =
			typeof p.content === "string" ? p.content : JSON.stringify(p.content)
		return str.includes("[System Note:") && str.includes("messages folded")
	})
	if (!note) return null
	const str =
		typeof note.content === "string"
			? note.content
			: JSON.stringify(note.content)
	const match = str.match(/\((\d+) messages folded\)/)
	return match ? Number(match[1]) : null
}

/**
 * Seeds a thread with `count` messages of `chars` characters each, sends one
 * turn, and reports how many of the seeded messages the folding step removed.
 *
 * The model window is pinned to 64k so the budget is stable at
 * computeMaxHistoryTokens(64_000) = 48,000.
 */
async function foldScenario(count: number, chars: number) {
	let receivedPrompt: any[] | null = null

	const model = new MockLanguageModelV3({
		modelId: "deepseek/deepseek-chat",
		doStream: async (options) => {
			receivedPrompt = options.prompt as any[]
			return reply("Ack") as any
		},
	})

	const storage = new SQLiteStore({ url: ":memory:" })
	const agent = new Agent({
		id: "agent",
		name: "Agent",
		instructions: "Test instructions",
		model: () => model,
	})
	const controller = new AgentController({ storage, agent })
	await controller.init()
	const session = await controller.createSession({ resourceId: "res-fold" })
	await session.thread.create({ title: "Fold budget thread" })
	const threadId = session.thread.getId()

	const store = await (controller.storage as SQLiteStore).getStore("memory")
	const seeded: any[] = []
	for (let i = 0; i < count; i++) {
		const text = `Turn ${i}: ${"A".repeat(chars)}`
		seeded.push({
			id: `seed_${i}`,
			role: i % 2 === 0 ? "user" : "assistant",
			content: { format: 2, parts: [{ type: "text", text }], content: text },
			threadId,
			resourceId: "res-fold",
			createdAt: new Date(Date.now() - (count - i) * 1000),
		})
	}
	await store.saveMessages({ messages: seeded })

	const budget = computeMaxHistoryTokens(64_000)

	await session.sendMessage({ content: "Latest prompt" })

	return { prompt: receivedPrompt!, budget, seeded }
}

describe("Context folding folds only enough to fit the budget", () => {
	it("drops a single message when one message is all that overflows", async () => {
		// 10 x 20,000 chars ~ 5,000 tokens each, 50,000 total. The budget is
		// 48,000, so discarding the oldest message alone brings it to 45,000.
		const { prompt, budget, seeded } = await foldScenario(10, 20_000)
		expect(budget).toBe(48_000)

		const totalPerMessage = Math.ceil(20_000 / 4)
		const total = totalPerMessage * 10
		expect(total).toBeGreaterThan(budget)

		// Folding one message is sufficient; folding nine would also fit and is
		// exactly the over-aggressive outcome this test exists to catch.
		expect(foldedCount(prompt)).toBe(1)

		// The nine survivors are all still present.
		const body = JSON.stringify(prompt)
		for (let i = 1; i < seeded.length; i++) {
			expect(body).toContain(`Turn ${i}:`)
		}
		expect(body).not.toContain("Turn 0:")
	})

	it("folds more when the history is further past the budget", async () => {
		// 15 x 25,000 chars ~ 6,250 tokens each, 93,750 total. Roughly 45,750
		// tokens have to go, which is eight messages.
		const { prompt, budget } = await foldScenario(15, 25_000)
		expect(budget).toBe(48_000)

		const totalPerMessage = Math.ceil(25_000 / 4)
		const total = totalPerMessage * 15
		expect(total).toBeGreaterThan(budget)

		expect(foldedCount(prompt)).toBe(8)
	})

	it("leaves the most recent four messages immune from folding", async () => {
		// 20 x 40,000 chars is 200,000 tokens against a 48,000 budget, so the
		// budget alone would fold every message. What stops it short is the
		// tail guard: startIndex is capped at length - 4. Asserting the exact
		// count matters -- a looser bound still passes if the guard is widened.
		const { prompt } = await foldScenario(20, 40_000)

		expect(foldedCount(prompt)).toBe(16)

		// The last four seeded turns survive verbatim.
		const body = JSON.stringify(prompt)
		for (const i of [16, 17, 18, 19]) {
			expect(body).toContain(`Turn ${i}:`)
		}
	})

	it("does not fold anything while the history fits", async () => {
		// 12 x 8,000 chars ~ 2,000 tokens each, 24,000 total, well under 48,000.
		const { prompt } = await foldScenario(12, 8_000)

		expect(foldedCount(prompt)).toBeNull()

		// Every seeded turn is still in the request.
		const body = JSON.stringify(prompt)
		for (let i = 0; i < 12; i++) {
			expect(body).toContain(`Turn ${i}:`)
		}
	})
})
