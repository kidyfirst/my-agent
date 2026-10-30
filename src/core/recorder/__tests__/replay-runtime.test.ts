import { describe, expect, it, beforeEach } from "vitest"
import {
	beginSessionReplay,
	endSessionReplay,
	isReplayRunActive,
	runtimeMetadata,
	type ReplayRuntimeHost,
} from "../replay-runtime.js"
import { SessionRecordingManager } from "../recording-manager.js"
import type { RecordedRuntime } from "../types.js"

const manager = SessionRecordingManager.getInstance()

/** Minimal stand-in for a live Session: records every runtime it is given. */
function makeHost(initial: RecordedRuntime) {
	let current = initial
	const applied: RecordedRuntime[] = []
	const host: ReplayRuntimeHost & { current: () => RecordedRuntime } = {
		current: () => current,
		snapshotRuntime: () => ({ ...current }),
		applyRuntime: (runtime: RecordedRuntime) => {
			applied.push(runtime)
			current = runtime
		},
	}
	return { host, applied }
}

const USER_RUNTIME: RecordedRuntime = {
	modelId: "deepseek/deepseek-flash",
	modeId: "react",
	permissionMode: "default",
	thinkingLevel: "medium",
	permissionRules: { categories: { edit: "ask" }, tools: {} },
	grants: { categories: [], tools: [] },
}

const RECORDED_RUNTIME: RecordedRuntime = {
	modelId: "anthropic/claude-sonnet",
	modeId: "plan",
	permissionMode: "auto-approve",
	thinkingLevel: "high",
}

describe("replay runtime handoff", () => {
	beforeEach(() => {
		// The manager is a singleton; make sure no replay state leaks between tests.
		manager.takeReplayRuntime("thread-1")
		manager.takeReplayRuntime("thread-2")
		manager.clearReplayModel("thread-1")
		manager.clearReplayModel("thread-2")
	})

	it("switches the session to the recorded runtime and remembers the user's own", () => {
		const { host, applied } = makeHost(USER_RUNTIME)

		const result = beginSessionReplay(host, "thread-1", RECORDED_RUNTIME)

		expect(result.applied).toBe(true)
		expect(result.previous).toEqual(USER_RUNTIME)
		expect(applied).toEqual([RECORDED_RUNTIME])
		expect(host.current().modeId).toBe("plan")
	})

	it("hands the user's model / mode / permission back when the replay ends", () => {
		const { host } = makeHost(USER_RUNTIME)
		beginSessionReplay(host, "thread-1", RECORDED_RUNTIME)
		manager.setReplayModel("thread-1", {} as any)

		const { restored, applied } = endSessionReplay(host, "thread-1")

		expect(applied).toBe(true)
		expect(restored).toEqual(USER_RUNTIME)
		expect(host.current()).toEqual(USER_RUNTIME)
		// The offline replay model must not survive the replay: a stale script
		// would otherwise answer the next real message.
		expect(manager.getReplayModel("thread-1")).toBeNull()
	})

	it("keeps the first snapshot when a replay starts inside another replay", () => {
		const { host } = makeHost(USER_RUNTIME)
		beginSessionReplay(host, "thread-1", RECORDED_RUNTIME)
		// Second start happens while the session already holds the recorded runtime.
		beginSessionReplay(host, "thread-1", {
			modeId: "fast",
			modelId: "other/model",
		})

		const { restored } = endSessionReplay(host, "thread-1")

		expect(restored).toEqual(USER_RUNTIME)
		expect(host.current()).toEqual(USER_RUNTIME)
	})

	it("can snapshot without switching, for a replay that never runs", () => {
		const { host, applied } = makeHost(USER_RUNTIME)

		const result = beginSessionReplay(host, "thread-1", RECORDED_RUNTIME, {
			apply: false,
		})

		expect(result.applied).toBe(false)
		expect(result.previous).toEqual(USER_RUNTIME)
		// The recorded mode must never leak into the composer for a replay that
		// only reconstructs the transcript.
		expect(applied).toEqual([])
		expect(host.current()).toEqual(USER_RUNTIME)
	})

	it("does nothing when the recording carried no runtime (old files)", () => {
		const { host, applied } = makeHost(USER_RUNTIME)

		const result = beginSessionReplay(host, "thread-2", undefined)

		expect(result.applied).toBe(false)
		expect(applied).toEqual([])
		expect(host.current()).toEqual(USER_RUNTIME)
	})

	it("is idempotent — stopping twice still leaves the user's runtime in place", () => {
		const { host, applied } = makeHost(USER_RUNTIME)
		beginSessionReplay(host, "thread-1", RECORDED_RUNTIME)
		endSessionReplay(host, "thread-1")

		const second = endSessionReplay(host, "thread-1")

		expect(second.applied).toBe(false)
		expect(applied).toHaveLength(2)
		expect(host.current()).toEqual(USER_RUNTIME)
	})

	it("reports whether a replay run is still streaming", () => {
		expect(isReplayRunActive(null)).toBe(false)
		expect(isReplayRunActive({ run: { isRunning: () => true } })).toBe(true)
		expect(isReplayRunActive({ run: { isRunning: () => false } })).toBe(false)
	})
})

describe("runtimeMetadata", () => {
	it("drops empty fields so they cannot overwrite a good thread value", () => {
		expect(
			runtimeMetadata({
				modelId: "",
				modeId: "plan",
				permissionMode: undefined,
				thinkingLevel: "high",
			}),
		).toEqual([
			["modeId", "plan"],
			["thinkingLevel", "high"],
		])
	})

	it("returns nothing for a missing runtime", () => {
		expect(runtimeMetadata(undefined)).toEqual([])
		expect(runtimeMetadata(null)).toEqual([])
	})
})
