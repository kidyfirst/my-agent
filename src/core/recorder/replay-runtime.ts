import { sessionRecordingManager } from "./recording-manager.js"
import type { RecordedRuntime } from "./types.js"

/**
 * The slice of a live `Session` a replay needs to borrow. Kept structural so the
 * recorder package does not have to import the controller (and create a cycle).
 */
export interface ReplayRuntimeHost {
	snapshotRuntime?: () => RecordedRuntime
	applyRuntime?: (
		runtime: RecordedRuntime,
		options?: { clearPolicies?: boolean; applyGrants?: boolean },
	) => void
	run?: { isRunning?: () => boolean }
}

export interface BeginReplayResult {
	/** The user's own selection, remembered so the replay can hand it back. */
	previous?: RecordedRuntime
	/** False when nothing was switched (old recording, or a replay with no live run). */
	applied: boolean
}

/**
 * Take the session over for a replay: remember what the user had selected, then
 * switch to the model/mode/permission the recording was made with.
 *
 * `apply: false` keeps the snapshot but leaves the session alone. A replay that
 * only reconstructs the recorded transcript never runs under those settings, so
 * switching and immediately switching back would just make the composer's
 * pickers flicker.
 */
export function beginSessionReplay(
	host: ReplayRuntimeHost | null | undefined,
	threadId: string,
	recordedRuntime?: RecordedRuntime | null,
	options: { apply?: boolean } = {},
): BeginReplayResult {
	const apply = options.apply !== false
	let previous: RecordedRuntime | undefined
	try {
		previous = host?.snapshotRuntime?.()
	} catch (e) {
		console.warn("[replay] failed to snapshot session runtime:", e)
	}
	if (previous && threadId) {
		sessionRecordingManager.saveReplayRuntime(threadId, previous)
	}

	if (!apply || !recordedRuntime || typeof host?.applyRuntime !== "function") {
		return { previous, applied: false }
	}

	try {
		host.applyRuntime(recordedRuntime, {
			clearPolicies: true,
			applyGrants: true,
		})
		return { previous, applied: true }
	} catch (e) {
		console.warn("[replay] failed to apply recorded runtime:", e)
		return { previous, applied: false }
	}
}

export interface EndReplayResult {
	/** The runtime that was written back, when a snapshot existed. */
	restored?: RecordedRuntime
	applied: boolean
}

/**
 * Give the session back to the user: drop the offline replay model and restore
 * the model/mode/permission that were active before the replay started.
 *
 * Safe to call more than once — the second call finds no snapshot and only
 * clears whatever replay state is left.
 */
export function endSessionReplay(
	host: ReplayRuntimeHost | null | undefined,
	threadId: string,
): EndReplayResult {
	if (!threadId) return { applied: false }
	sessionRecordingManager.clearReplayModel(threadId)
	const restored = sessionRecordingManager.takeReplayRuntime(threadId)
	if (!restored || typeof host?.applyRuntime !== "function") {
		return { restored, applied: false }
	}
	try {
		host.applyRuntime(restored, {
			clearPolicies: true,
			applyGrants: true,
		})
		return { restored, applied: true }
	} catch (e) {
		console.warn("[replay] failed to restore session runtime:", e)
		return { restored, applied: false }
	}
}

/**
 * Thread-metadata pairs for a runtime. Nulls are dropped so a missing field
 * never overwrites a good value in the thread's metadata.
 */
export function runtimeMetadata(
	runtime?: RecordedRuntime | null,
): Array<[string, unknown]> {
	if (!runtime) return []
	const entries: Array<[string, unknown]> = [
		["modelId", runtime.modelId],
		["modeId", runtime.modeId],
		["permissionMode", runtime.permissionMode],
		["thinkingLevel", runtime.thinkingLevel],
	]
	return entries.filter(([, value]) => value != null && value !== "")
}

/** True while a run is actually streaming in this session. */
export function isReplayRunActive(
	host: ReplayRuntimeHost | null | undefined,
): boolean {
	try {
		return Boolean(host?.run?.isRunning?.())
	} catch {
		return false
	}
}
