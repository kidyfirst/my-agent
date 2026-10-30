/**
 * Replay provenance lives in the message id: `reconstructMessagesFromRecording` writes
 * `replay-user-<runId>-<n>` / `replay-assistant-<runId>-<n>`. The message table has no
 * metadata column, so the id prefix is the only durable marker available to the UI.
 */
export const REPLAY_MESSAGE_ID_PREFIX = "replay-"

export function isReplayMessageId(id: string | null | undefined): boolean {
	return typeof id === "string" && id.startsWith(REPLAY_MESSAGE_ID_PREFIX)
}

export function isReplayMessage(
	message: { id?: string | null } | null | undefined,
): boolean {
	return isReplayMessageId(message?.id)
}

/**
 * The per-playback suffix of a replayed message id: `replay-assistant-<runId>-0-pbmg2k1`
 * yields `pbmg2k1`. A recording may be replayed several times; each pass writes its own
 * suffix (see `replayPlaybackKey` in the recorder), so two blocks with different keys are
 * two playbacks and must both stay visible. Rows written before playbacks carried a
 * suffix return null and are treated as one legacy batch.
 */
export function getReplayPlaybackKey(
	id: string | null | undefined,
): string | null {
	if (typeof id !== "string") return null
	const match = /^replay-(?:user|assistant)-.+-pb([a-z0-9]+)$/.exec(id)
	return match ? match[1] : null
}
