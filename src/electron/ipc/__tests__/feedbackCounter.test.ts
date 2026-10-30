import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The like / bad-response counters live in the main process for the same reason
 * the star count does: the renderer window has no CORS allowance for
 * third-party hosts. Every failure path must resolve to `{ value: null }` so a
 * blocked network degrades the button instead of breaking the message.
 */
type Reply = { value: number | null; cached?: boolean }

async function loadHandler() {
	vi.resetModules()
	const { getFeedbackHandlers } = await import("../feedback-handlers.js")
	return getFeedbackHandlers().feedbackCounter as (
		command: unknown,
		ctx: unknown,
	) => Promise<Reply>
}

const jsonResponse = (body: unknown, ok = true) =>
	({ ok, json: async () => body }) as unknown as Response

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("feedbackCounter", () => {
	it("bumps the like counter and returns the new total", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ value: 128 }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		expect(await handler({ kind: "like", action: "hit" })).toEqual({
			value: 128,
		})
		expect(String(fetchMock.mock.calls[0][0])).toBe(
			"https://abacus.jasoncameron.dev/hit/kidyfirst/my-agent-likes",
		)
	})

	it("bumps the bad-response counter instead", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ value: 3 }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		await handler({ kind: "dislike", action: "hit" })
		expect(String(fetchMock.mock.calls[0][0])).toContain(
			"/hit/kidyfirst/my-agent-bad",
		)
	})

	it("serves a repeated read from the cache", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ value: 42 }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		expect(await handler({ kind: "like", action: "get" })).toEqual({
			value: 42,
		})
		expect(await handler({ kind: "like", action: "get" })).toEqual({
			value: 42,
			cached: true,
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it("never caches a hit, because a hit must move the number", async () => {
		let total = 10
		const fetchMock = vi.fn(async () => jsonResponse({ value: ++total }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		await handler({ kind: "like", action: "hit" })
		expect(await handler({ kind: "like", action: "hit" })).toEqual({
			value: 12,
		})
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it("defaults to a hit when no action is given", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ value: 1 }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		await handler({ kind: "like" })
		expect(String(fetchMock.mock.calls[0][0])).toContain("/hit/")
	})

	it("refuses an unknown kind without touching the network", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ value: 1 }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		expect(await handler({ kind: "star" })).toEqual({ value: null })
		expect(await handler({})).toEqual({ value: null })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("reports no total when the counter answers with an error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ message: "not found" }, false)),
		)
		const handler = await loadHandler()
		expect(await handler({ kind: "like", action: "hit" })).toEqual({
			value: null,
		})
	})

	it("survives a network failure instead of throwing at the renderer", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("ENOTFOUND")
			}),
		)
		const handler = await loadHandler()
		await expect(handler({ kind: "like", action: "hit" })).resolves.toEqual({
			value: null,
		})
	})

	it("ignores a payload without a numeric value", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ value: "12" })),
		)
		const handler = await loadHandler()
		expect(await handler({ kind: "like", action: "hit" })).toEqual({
			value: null,
		})
	})

	it("re-reads once the cache window lapses, keeping the total if that fails", async () => {
		vi.useFakeTimers()
		try {
			const handler = await loadHandler()
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse({ value: 7 })),
			)
			await handler({ kind: "dislike", action: "get" })

			// Past the 60 s window the cache no longer answers, so a real request
			// goes out — and its failure falls back to the number we already know.
			vi.advanceTimersByTime(61_000)
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					throw new Error("offline")
				}),
			)
			expect(await handler({ kind: "dislike", action: "get" })).toEqual({
				value: 7,
			})
		} finally {
			vi.useRealTimers()
		}
	})
})
