import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Execution context that ties everything one run produces together.
 *
 * Without it a bug report is a pile of log lines with timestamps but no
 * identity: you cannot tell which run a line belongs to, and once two threads
 * run at the same time a timestamp ordering means nothing. Every log entry and
 * harness event emitted inside `withTrace` carries `traceId` so a single
 * correlation id walks back from a user-visible error to the exact tool call
 * that caused it.
 *
 * Propagated via `AsyncLocalStorage` rather than a parameter so the hundreds of
 * existing `logger.info(...)` call sites need no change.
 */
export interface TraceContext {
	/** Correlates a run; equals the run id the recorder writes to disk. */
	traceId: string
	threadId: string
	/** Current span, set while inside a step or tool execution. */
	spanId?: string
	/** Enclosing span, giving nested tool calls a causal chain. */
	parentSpanId?: string
}

export const traceStorage = new AsyncLocalStorage<TraceContext>()

/**
 * Run `fn` with `ctx` as the ambient trace context.
 *
 * Nested calls merge onto the enclosing context so a tool can narrow `spanId`
 * without restating `traceId`/`threadId`.
 */
export function withTrace<T>(
	ctx: Partial<TraceContext> & { traceId: string; threadId: string },
	fn: () => T,
): T {
	const parent = traceStorage.getStore()
	const merged: TraceContext = { ...parent, ...ctx }
	return traceStorage.run(merged, fn)
}

/** Ambient trace context, or undefined outside a traced run. */
export function currentTrace(): TraceContext | undefined {
	return traceStorage.getStore()
}

/**
 * Narrow the current span for the duration of `fn`, keeping the trace id.
 *
 * Used to give each tool call its own span so the UI can show a tree rather
 * than a flat list of events.
 */
export function withSpan<T>(spanId: string, fn: () => T): T {
	const parent = traceStorage.getStore()
	if (!parent) return fn()
	const next: TraceContext = {
		...parent,
		parentSpanId: parent.spanId,
		spanId,
	}
	return traceStorage.run(next, fn)
}
