import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The banner's star count is fetched in the main process (the renderer window is
 * not allowed to reach api.github.com), cached for ten minutes and never allowed
 * to throw — a rate limit or an offline machine must leave the button usable.
 */
async function loadHandler() {
	vi.resetModules()
	const { getRepoHandlers } = await import("../repo-handlers.js")
	return getRepoHandlers().getRepoStars as (
		command: unknown,
		ctx: unknown,
	) => Promise<{ stars: number | null; cached?: boolean }>
}

const jsonResponse = (body: unknown, ok = true) =>
	({ ok, json: async () => body }) as unknown as Response

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("getRepoStars", () => {
	it("returns the repository's stargazer count", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ stargazers_count: 1234 }),
		)
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		expect(await handler({}, {})).toEqual({ stars: 1234 })
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(String(fetchMock.mock.calls[0][0])).toBe(
			"https://api.github.com/repos/kidyfirst/my-agent",
		)
	})

	it("serves a second read from the cache", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ stargazers_count: 42 }))
		vi.stubGlobal("fetch", fetchMock)

		const handler = await loadHandler()
		await handler({}, {})
		expect(await handler({}, {})).toEqual({ stars: 42, cached: true })
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it("reports no count when GitHub answers with an error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ message: "rate limited" }, false)),
		)
		const handler = await loadHandler()
		expect(await handler({}, {})).toEqual({ stars: null })
	})

	it("survives a network failure instead of throwing at the renderer", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("ENOTFOUND")
			}),
		)
		const handler = await loadHandler()
		await expect(handler({}, {})).resolves.toEqual({ stars: null })
	})

	it("ignores a payload without a numeric count", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({})),
		)
		const handler = await loadHandler()
		expect(await handler({}, {})).toEqual({ stars: null })
	})
})
