import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatView } from "../components/ChatView"
import { UserMessage } from "../components/UserMessage"
import type { Message } from "../types/ipc"

const messages: Message[] = [
	{
		id: "u1",
		role: "user",
		content: [{ type: "text", text: "深圳天气怎么样？" }],
		createdAt: "2026-10-30T08:24:00.000Z",
	},
	{
		id: "a1",
		role: "assistant",
		content: [{ type: "text", text: "今天多云转晴。" }],
		createdAt: "2026-10-30T08:24:03.000Z",
		durationMs: 1200,
	},
]

describe("chat scroll bottom fade and scroll-to-latest button", () => {
	it("renders bottom transparent gradient overlay in ChatView", () => {
		const html = renderToStaticMarkup(
			<ChatView
				messages={messages}
				tools={new Map()}
				subagents={new Map()}
				isAgentActive={false}
				agentStartedAt={null}
				streamingMessageId={null}
				todos={[]}
			/>,
		)
		expect(html).toContain('data-testid="chat-bottom-fade"')
		expect(html).toContain("linear-gradient(to bottom, transparent, var(--bg))")
	})

	it("renders floating circular scroll-to-latest button with down arrow icon", () => {
		const html = renderToStaticMarkup(
			<ChatView
				messages={messages}
				tools={new Map()}
				subagents={new Map()}
				isAgentActive={false}
				agentStartedAt={null}
				streamingMessageId={null}
				todos={[]}
			/>,
		)
		expect(html).toContain('data-testid="scroll-to-latest-button"')
		expect(html).toContain('aria-label="Scroll to latest"')
		// Down arrow svg line and polyline
		expect(html).toContain('<line x1="12" y1="5" x2="12" y2="19"')
		expect(html).toContain('<polyline points="19 12 12 19 5 12"')
	})

	it("renders sticky gradient fade and sentinel in UserMessage", () => {
		const html = renderToStaticMarkup(
			<UserMessage message={messages[0]} pinned={true} />,
		)
		expect(html).toContain('data-testid="sticky-sentinel"')
		expect(html).toContain('data-testid="sticky-fade-bottom"')
		expect(html).toContain("linear-gradient(to bottom, var(--bg), transparent)")
	})

	it("does not render sticky fade when UserMessage is not pinned", () => {
		const html = renderToStaticMarkup(
			<UserMessage message={messages[0]} pinned={false} />,
		)
		expect(html).not.toContain('data-testid="sticky-sentinel"')
		expect(html).not.toContain('data-testid="sticky-fade-bottom"')
	})
})
