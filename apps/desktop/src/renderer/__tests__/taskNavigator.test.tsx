import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TaskNavigator, type TaskItem } from "../components/TaskNavigator"
import { ChatView } from "../components/ChatView"
import type { Message } from "../types/ipc"

describe("TaskNavigator", () => {
	const mockTasks: TaskItem[] = [
		{ id: "t1", turnKey: "k1", text: "First task prompt", index: 0 },
		{ id: "t2", turnKey: "k2", text: "Second task prompt", index: 1 },
		{ id: "t3", turnKey: "k3", text: "Third task prompt", index: 2 },
	]

	it("does not render when there are fewer than 2 tasks", () => {
		const html = renderToStaticMarkup(
			<TaskNavigator
				tasks={[mockTasks[0]]}
				activeTaskId="t1"
				onSelectTask={vi.fn()}
			/>,
		)
		expect(html).toBe("")
	})

	it("renders timeline nav with tick marks for tasks", () => {
		const html = renderToStaticMarkup(
			<TaskNavigator
				tasks={mockTasks}
				activeTaskId="t2"
				onSelectTask={vi.fn()}
			/>,
		)
		expect(html).toContain('aria-label="Conversation task timeline"')
		expect(html).toContain('data-task-id="t1"')
		expect(html).toContain('data-task-id="t2"')
		expect(html).toContain('data-task-id="t3"')
		expect(html).toContain('data-task-active="true"')
	})

	it("hides when window/container is too narrow for right margin", () => {
		const html = renderToStaticMarkup(
			<TaskNavigator
				tasks={mockTasks}
				activeTaskId="t2"
				onSelectTask={vi.fn()}
				minContainerWidth={2000} // simulated threshold higher than test default
			/>,
		)
		expect(html).toBe("")
	})

	it("renders inside ChatView when conversation has multiple user turns", () => {
		const multiTurnMessages: Message[] = [
			{
				id: "u1",
				role: "user",
				content: [{ type: "text", text: "Task 1: Search files" }],
				createdAt: "2026-11-06T08:00:00.000Z",
			},
			{
				id: "a1",
				role: "assistant",
				content: [{ type: "text", text: "Found files" }],
				createdAt: "2026-11-06T08:00:05.000Z",
			},
			{
				id: "u2",
				role: "user",
				content: [{ type: "text", text: "Task 2: Refactor component" }],
				createdAt: "2026-11-06T08:01:00.000Z",
			},
			{
				id: "a2",
				role: "assistant",
				content: [{ type: "text", text: "Refactored" }],
				createdAt: "2026-11-06T08:01:10.000Z",
			},
		]

		const html = renderToStaticMarkup(
			<ChatView
				messages={multiTurnMessages}
				tools={new Map()}
				subagents={new Map()}
				isAgentActive={false}
				agentStartedAt={null}
				streamingMessageId={null}
				todos={[]}
			/>,
		)

		expect(html).toContain('aria-label="Conversation task timeline"')
		expect(html).toContain('data-task-id="u1"')
		expect(html).toContain('data-task-id="u2"')
		expect(html).toContain('data-turn-id="u1"')
		expect(html).toContain('data-turn-id="u2"')
	})

	it("renders without background or border in collapsed state and centers few tasks", () => {
		const html = renderToStaticMarkup(
			<TaskNavigator
				tasks={mockTasks}
				activeTaskId="t2"
				onSelectTask={vi.fn()}
			/>,
		)
		expect(html).toContain('background:transparent')
		expect(html).toContain('border:none')
		expect(html).toContain('justify-content:center')
		expect(html).toContain('top:56px')
		expect(html).toContain('bottom:24px')
	})
})
