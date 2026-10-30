import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatView } from "../components/ChatView"
import { InterruptedNotice } from "../components/InterruptedNotice"
import type { Message } from "../types/ipc"

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(here, "..", rel), "utf8")

const messages = [
	{
		id: "u1",
		role: "user",
		content: [{ type: "text", text: "深圳天气怎么样？" }],
		createdAt: "2026-10-30T08:24:00.000Z",
	},
	{
		id: "a1",
		role: "assistant",
		content: [{ type: "text", text: "我先查一下。" }],
		createdAt: "2026-10-30T08:24:03.000Z",
		durationMs: 4200,
	},
] as unknown as Message[]

const renderChat = (interrupted?: boolean) =>
	renderToStaticMarkup(
		<ChatView
			messages={messages}
			tools={new Map()}
			subagents={new Map()}
			isAgentActive={false}
			agentStartedAt={null}
			streamingMessageId={null}
			todos={[]}
			interrupted={interrupted}
		/>,
	)

describe("interrupted notice", () => {
	it("closes the turn when the user stopped it", () => {
		const html = renderChat(true)
		expect(html).toContain("User actively interrupts task")
		// After the answer, not before it.
		expect(html.indexOf("我先查一下")).toBeLessThan(
			html.indexOf("User actively interrupts task"),
		)
	})

	it("stays off the transcript otherwise", () => {
		expect(renderChat(false)).not.toContain("User actively interrupts task")
		expect(renderChat(undefined)).not.toContain("User actively interrupts task")
	})

	it("centers the label between two fading rules", () => {
		const html = renderToStaticMarkup(<InterruptedNotice />)
		// One full-width row: the spacers take the slack, so the label lands on
		// the column's center regardless of how long the text is.
		expect(html).toContain("display:flex")
		expect(html.match(/flex:1/g)?.length).toBe(2)
		expect(html).toContain("linear-gradient(to right, transparent")
		expect(html).toContain("linear-gradient(to left, transparent")
		expect(html).toContain('role="status"')
	})

	it("is renderer state only — a stop is never written to the thread", () => {
		// The note must not survive a reload, so nothing here may persist.
		const notice = read("components/InterruptedNotice.tsx")
		expect(notice).not.toContain("window.api")
		expect(notice).not.toContain("localStorage")

		const app = read("App.tsx")
		const abort =
			/const handleAbort = useCallback\(async \(\) => \{([\s\S]*?)\n\t\}, \[/.exec(
				app,
			)
		expect(abort?.[1]).toContain("setInterruptedThreadKey(")
		// Marked before the IPC round trip, or the note trails the click.
		expect(abort?.[1]?.indexOf("setInterruptedThreadKey(")).toBeLessThan(
			abort?.[1]?.indexOf('type: "abort"') ?? -1,
		)
		expect(abort?.[1]).not.toContain("setThreads(")
	})

	it("a new send retires the note for the next turn", () => {
		const app = read("App.tsx")
		const send = /const handleSend = useCallback\(([\s\S]*?)\n\t\)/.exec(app)
		expect(send?.[1]).toContain("setInterruptedThreadKey(null)")
	})
})
