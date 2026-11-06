import { describe, it, expect, afterEach } from "vitest"
import { Logger, formatLogLine } from "../../logger/index.js"
import { currentTrace, withTrace, withSpan, traceStorage } from "../context.js"

/**
 * The point of the trace context is that one run's log lines never pick up
 * another run's id, even when both are in flight at once. A shared mutable
 * field would pass a single-run test and fail exactly here.
 */

function enabledLogger(): Logger {
	const logger = new Logger()
	logger.configure({ enabled: true, level: "trace" })
	return logger
}

describe("trace context", () => {
	afterEach(() => {
		// enterWith leaks into the surrounding async context; reset between tests.
		traceStorage.enterWith(undefined as any)
	})

	it("is undefined outside a traced run", () => {
		expect(currentTrace()).toBeUndefined()
	})

	it("stamps traceId on entries written inside withTrace", () => {
		const logger = enabledLogger()
		const entry = withTrace({ traceId: "run-1", threadId: "t1" }, () =>
			logger.info("scope", "inside"),
		)
		expect(entry?.traceId).toBe("run-1")
		expect(entry?.spanId).toBeUndefined()
	})

	it("leaves traceId off entries written outside a run", () => {
		const logger = enabledLogger()
		const entry = logger.info("boot", "startup")
		expect(entry?.traceId).toBeUndefined()
	})

	it("carries the current span and its parent", () => {
		const inner = withTrace({ traceId: "run-2", threadId: "t2" }, () =>
			withSpan("span-outer", () =>
				withSpan("span-inner", () => currentTrace()),
			),
		)
		expect(inner?.traceId).toBe("run-2")
		expect(inner?.spanId).toBe("span-inner")
		expect(inner?.parentSpanId).toBe("span-outer")
	})

	it("keeps concurrent runs from bleeding into each other", async () => {
		const logger = enabledLogger()

		const run = (traceId: string, delays: number[]) =>
			withTrace({ traceId, threadId: traceId }, async () => {
				for (const ms of delays) {
					await new Promise((r) => setTimeout(r, ms))
					logger.info("work", `step of ${traceId}`)
				}
			})

		// Interleaved delays: every wait crosses at least one from the other run.
		await Promise.all([
			run("trace-A", [5, 10, 15]),
			run("trace-B", [15, 10, 5]),
		])

		const entries = logger.getEntries()
		expect(entries).toHaveLength(6)
		for (const e of entries) {
			const owner = e.message.includes("trace-A") ? "trace-A" : "trace-B"
			expect(e.traceId).toBe(owner)
		}
	})

	it("writes the trace id into the log line so it is greppable", () => {
		const logger = enabledLogger()
		const entry = withTrace({ traceId: "grep-me", threadId: "t" }, () =>
			logger.info("scope", "message"),
		)!
		expect(formatLogLine(entry)).toContain("[trace=grep-me]")
	})
})
