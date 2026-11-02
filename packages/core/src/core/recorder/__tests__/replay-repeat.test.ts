import { describe, expect, it } from "vitest"
import {
	createReplayModel,
	deriveReplayScript,
	reconstructMessagesFromRecording,
	replayPlaybackKey,
} from "../replay.js"

/** One recorded run: a prompt plus a single text answer. */
function makeRecording(): string {
	const events = [
		{ type: "session", createdAt: 1_700_000_000_000, threadId: "original" },
		{
			type: "run/start",
			data: { runId: "run-a", userPrompt: "Explain the diff" },
		},
		{
			type: "assistant/stream",
			data: {
				finishReason: "stop",
				stream: [
					{
						type: "chunk",
						chunk: { type: "text-delta", delta: "It renames a field." },
					},
				],
			},
		},
	]
	return events.map((e) => JSON.stringify(e)).join("\n")
}

describe("reconstructMessagesFromRecording — repeated playback", () => {
	it("writes the same ids when no playback id is given (old behaviour)", () => {
		const content = makeRecording()
		const first = reconstructMessagesFromRecording(content, "thread-1", "res-1")
		const second = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
		)

		expect(first.map((m) => m.id)).toEqual(second.map((m) => m.id))
		expect(first[0].id).toBe("replay-user-run-a-0")
	})

	it("uses a fresh id space per playback so a re-replay really changes rows", () => {
		const content = makeRecording()
		const first = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
			undefined,
			{
				playbackId: "aaa",
			},
		)
		const second = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
			undefined,
			{
				playbackId: "bbb",
			},
		)

		expect(first.map((m) => m.id)).not.toEqual(second.map((m) => m.id))
		// The replay marker has to survive: the UI finds these rows by prefix.
		for (const message of [...first, ...second]) {
			expect(message.id.startsWith("replay-")).toBe(true)
		}
	})

	it("honours startAt so a repeat lands at the end of the thread", () => {
		const content = makeRecording()
		const startedAt = Date.now()
		const messages = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
			startedAt,
		)

		expect(messages[0].createdAt.getTime()).toBe(startedAt)
		expect(messages[1].createdAt.getTime()).toBe(startedAt + 1000)
	})

	it("keeps the recorded prompt and answer text", () => {
		const content = makeRecording()
		const messages = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
		)

		expect(messages).toHaveLength(2)
		expect(messages[0].content.content).toBe("Explain the diff")
		expect(messages[1].content.content).toBe("It renames a field.")
	})

	it("tags each playback so two passes can be told apart", () => {
		const content = makeRecording()
		const first = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
			undefined,
			{
				playbackId: "pbmg2k1",
			},
		)
		const second = reconstructMessagesFromRecording(
			content,
			"thread-1",
			"res-1",
			undefined,
			{
				playbackId: "pbn9x2",
			},
		)

		expect(replayPlaybackKey(first[1].id)).toBe("mg2k1")
		expect(replayPlaybackKey(second[1].id)).toBe("n9x2")
		expect(replayPlaybackKey(first[1].id)).not.toBe(
			replayPlaybackKey(second[1].id),
		)
	})

	it("returns null for ids written before playbacks were tagged", () => {
		expect(
			replayPlaybackKey(
				"replay-assistant-dcce6d28-a80d-4323-9a42-735a8c1c21b4-0",
			),
		).toBe(null)
		expect(replayPlaybackKey("")).toBe(null)
		expect(replayPlaybackKey(null)).toBe(null)
	})
})

describe("createReplayModel — replaying one recording more than once", () => {
	it("throws once the script is used up by default", async () => {
		const script = deriveReplayScript(makeRecording())
		const model = createReplayModel(script)

		await model.doStream()
		await expect(model.doStream()).rejects.toThrow(/exhausted/i)
	})

	it("wraps around so the same file can drive another run", async () => {
		const script = deriveReplayScript(makeRecording())
		const model = createReplayModel(script, { onExhausted: "wrap" })

		await model.doStream()
		await expect(model.doStream()).resolves.toBeTruthy()
	})

	it("reset() rewinds the cursor", async () => {
		const script = deriveReplayScript(makeRecording())
		const model = createReplayModel(script)

		await model.doStream()
		expect(model.getConsumedCount()).toBe(1)

		model.reset()
		expect(model.getConsumedCount()).toBe(0)
		await expect(model.doStream()).resolves.toBeTruthy()
	})
})
