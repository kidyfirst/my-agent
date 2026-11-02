import { describe, it, expect } from "vitest"
import { filterSystemReminderMessages } from "../index.js"
import type { MyAgentDBMessage } from "../../agent/index.js"

describe("filterSystemReminderMessages", () => {
	const userMsg: MyAgentDBMessage = {
		id: "1",
		role: "user",
		createdAt: new Date(),
		content: {
			format: 2,
			parts: [{ type: "text", text: "hi" }],
			content: "hi",
		},
	}

	const assistantMsg: MyAgentDBMessage = {
		id: "2",
		role: "assistant",
		createdAt: new Date(),
		content: {
			format: 2,
			parts: [{ type: "text", text: "hello" }],
			content: "hello",
		},
	}

	const signalMsg: MyAgentDBMessage = {
		id: "3",
		role: "signal",
		type: "recall",
		createdAt: new Date(),
		content: {
			format: 2,
			parts: [{ type: "text", text: "context" }],
			content: "context",
		},
	}

	it("returns all messages when hideSignals is false and includeSystemReminders is true", () => {
		const res = filterSystemReminderMessages(
			[userMsg, assistantMsg, signalMsg],
			true,
			false,
		)
		expect(res).toHaveLength(3)
	})

	it("hides signal messages when hideSignals is true", () => {
		const res = filterSystemReminderMessages(
			[userMsg, assistantMsg, signalMsg],
			false,
			true,
		)
		expect(res).toHaveLength(2)
		expect(res.map((m) => m.id)).toEqual(["1", "2"])
	})
})
