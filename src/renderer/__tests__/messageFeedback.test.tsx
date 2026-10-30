import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MessageFeedback } from "../components/MessageFeedback"
import { AssistantMessage } from "../components/AssistantMessage"
import { INITIAL_VOTE, applyVote } from "../utils/feedbackVote"
import type { Message } from "../types/ipc"

const markup = (text = "Answer body") =>
	renderToStaticMarkup(<MessageFeedback text={text} />)

const labelsIn = (html: string) =>
	Array.from(html.matchAll(/aria-label="([^"]+)"/g)).map((m) => m[1])

describe("applyVote", () => {
	it("sends a hit for the first vote and remembers it", () => {
		const step = applyVote(INITIAL_VOTE, "like")
		expect(step).toEqual({ next: { voted: "like", sent: true }, send: "like" })
	})

	it("stays silent when the same thumb is clicked again", () => {
		const first = applyVote(INITIAL_VOTE, "like")
		expect(applyVote(first.next, "like")).toEqual({
			next: first.next,
			send: null,
		})
	})

	it("lets the user change their mind without counting it twice", () => {
		const first = applyVote(INITIAL_VOTE, "like")
		const switched = applyVote(first.next, "dislike")
		// The counter cannot be decremented, so the second click only restyles.
		expect(switched.next).toEqual({ voted: "dislike", sent: true })
		expect(switched.send).toBeNull()
	})
})

describe("MessageFeedback", () => {
	it("renders copy, helpful and bad-response as one group", () => {
		const html = markup()
		expect(html).toContain('role="group"')
		expect(labelsIn(html)).toEqual([
			"Message actions",
			"Copy response",
			"Helpful",
			"Bad response",
		])
	})

	it("starts unvoted, so a restart shows no highlight", () => {
		// A committed vote flips aria-pressed to "true"; on a fresh mount every
		// button is "false", which is what "nothing is persisted" looks like.
		expect(markup()).not.toContain('aria-pressed="true"')
	})

	it("drops the copy button when there is nothing to copy", () => {
		const html = markup("   ")
		expect(labelsIn(html)).toEqual([
			"Message actions",
			"Helpful",
			"Bad response",
		])
	})
})

const answer = {
	id: "a1",
	role: "assistant",
	content: [{ type: "text", text: "已完成。" }],
	createdAt: "2026-10-30T08:24:03.000Z",
} as unknown as Message

describe("AssistantMessage footer", () => {
	it("shows the feedback pill under a finished reply", () => {
		const html = renderToStaticMarkup(<AssistantMessage message={answer} />)
		expect(html).toContain("Helpful")
		expect(html).toContain("Bad response")
	})

	it("hides it while the answer is still streaming", () => {
		const html = renderToStaticMarkup(
			<AssistantMessage message={{ ...answer, isStreaming: true }} />,
		)
		expect(html).not.toContain("Bad response")
	})
})
