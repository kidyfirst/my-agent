import { describe, it, expect } from "vitest"
import { organizeTurnItems, type RenderItem } from "../components/ChatView"
import type { Message } from "../types/ipc"

describe("organizeTurnItems - Turn Order and Placement", () => {
	const createUserItem = (id: string, text: string): RenderItem => ({
		type: "user",
		key: `msg-${id}`,
		data: {
			id,
			role: "user",
			content: [{ type: "text", text }],
			createdAt: new Date().toISOString(),
		} as Message,
	})

	const createAssistantItem = (
		id: string,
		text: string,
		durationMs?: number,
	): RenderItem => ({
		type: "assistant",
		key: `msg-${id}-text-0`,
		data: {
			id,
			role: "assistant",
			content: [{ type: "text", text }],
			durationMs,
			isStreaming: false,
			createdAt: new Date().toISOString(),
		} as Message & { isStreaming: boolean },
	})

	const createExecutionItem = (
		key: string,
		steps: Array<{ id: string; type: "thinking" | "tool" }>,
		durationMs?: number,
		isActive = false,
	): RenderItem => ({
		type: "execution",
		key,
		data: {
			isActive,
			steps: steps.map((s) =>
				s.type === "thinking"
					? {
							type: "thinking",
							id: s.id,
							text: "thinking thoughts...",
							durationSec: 2,
						}
					: {
							type: "tool",
							id: s.id,
							tool: {
								id: s.id,
								name: "read_file",
								args: {},
								status: "complete",
							},
						},
			),
			durationMs,
		},
	})

	it("reorders ExecutionBlock to appear BEFORE AssistantMessage when execution was appended after assistant", () => {
		// Simulates user: '再吗？', assistant: '在。刚才我在确认...', execution: 'Worked for 2.4s'
		const user = createUserItem("u1", "再吗？")
		const asst = createAssistantItem(
			"a1",
			"在。刚才我在确认一件事: memory.test.ts...",
			2400,
		)
		const exec = createExecutionItem(
			"msg-a1-exec-0",
			[{ id: "think-1", type: "thinking" }],
			2400,
		)

		// Input was [user, assistant, execution] (the bug scenario)
		const result = organizeTurnItems([user, asst, exec])

		expect(result).toHaveLength(3)
		expect(result[0].type).toBe("user")
		expect(result[1].type).toBe("execution")
		expect(result[2].type).toBe("assistant")

		if (result[1].type === "execution") {
			expect(result[1].data.durationMs).toBe(2400)
			expect(result[1].data.steps).toHaveLength(1)
		}
	})

	it("keeps ExecutionBlock before AssistantMessage when it was already before assistant", () => {
		const user = createUserItem("u1", "再吗？")
		const exec = createExecutionItem(
			"msg-a1-exec-0",
			[{ id: "think-1", type: "thinking" }],
			2400,
		)
		const asst = createAssistantItem("a1", "在。请问有什么需要？", 2400)

		const result = organizeTurnItems([user, exec, asst])

		expect(result).toHaveLength(3)
		expect(result[0].type).toBe("user")
		expect(result[1].type).toBe("execution")
		expect(result[2].type).toBe("assistant")
	})

	it("correctly handles multiple turns independently", () => {
		const u1 = createUserItem("u1", "Turn 1 question")
		const e1 = createExecutionItem("e1", [{ id: "t1", type: "thinking" }], 1500)
		const a1 = createAssistantItem("a1", "Turn 1 answer", 1500)

		const u2 = createUserItem("u2", "Turn 2 question")
		// Turn 2 execution appended after assistant
		const a2 = createAssistantItem("a2", "Turn 2 answer", 3200)
		const e2 = createExecutionItem("e2", [{ id: "t2", type: "tool" }], 3200)

		const result = organizeTurnItems([u1, e1, a1, u2, a2, e2])

		expect(result.map((r) => r.type)).toEqual([
			"user",
			"execution",
			"assistant",
			"user",
			"execution",
			"assistant",
		])
	})

	it("merges multiple execution blocks within the same turn into one preceding block", () => {
		const user = createUserItem("u1", "Execute multi-step task")
		const exec1 = createExecutionItem(
			"e1",
			[{ id: "step-1", type: "thinking" }],
			1000,
		)
		const asst1 = createAssistantItem("a1", "Partial answer")
		const exec2 = createExecutionItem(
			"e2",
			[{ id: "step-2", type: "tool" }],
			2500,
		)
		const asst2 = createAssistantItem("a2", "Final answer", 2500)

		const result = organizeTurnItems([user, exec1, asst1, exec2, asst2])

		// Expected order: user -> single merged execution -> asst1 -> asst2
		expect(result).toHaveLength(4)
		expect(result[0].type).toBe("user")
		expect(result[1].type).toBe("execution")
		expect(result[2].type).toBe("assistant")
		expect(result[3].type).toBe("assistant")

		if (result[1].type === "execution") {
			expect(result[1].data.steps).toHaveLength(2)
			expect(result[1].data.steps.map((s) => s.id)).toEqual([
				"step-1",
				"step-2",
			])
			expect(result[1].data.durationMs).toBe(2500)
		}
	})

	it("inherits durationMs from the assistant message if execution item had none", () => {
		const user = createUserItem("u1", "Check this")
		const asst = createAssistantItem("a1", "Here is the check", 1800)
		// e.g. unrenderedTools execution block without durationMs
		const exec = createExecutionItem(
			"live-execution-block",
			[{ id: "tool-run", type: "tool" }],
			undefined,
		)

		const result = organizeTurnItems([user, asst, exec])

		expect(result).toHaveLength(3)
		expect(result[1].type).toBe("execution")
		if (result[1].type === "execution") {
			expect(result[1].data.durationMs).toBe(1800)
		}
	})

	it("does not insert execution block for turns without any execution or thinking", () => {
		const user = createUserItem("u1", "Hello")
		const asst = createAssistantItem("a1", "Hi there!")

		const result = organizeTurnItems([user, asst])

		expect(result).toHaveLength(2)
		expect(result[0].type).toBe("user")
		expect(result[1].type).toBe("assistant")
	})

	it("synthesizes an execution block with durationMs when assistant completed with task duration", () => {
		const user = createUserItem("u1", "帮我看看这个图片有什么错误")
		const asst = createAssistantItem(
			"a1",
			"根据图片分析，发现有以下两处问题...",
			3200,
		)

		const result = organizeTurnItems([user, asst])

		expect(result).toHaveLength(3)
		expect(result[0].type).toBe("user")
		expect(result[1].type).toBe("execution")
		expect(result[2].type).toBe("assistant")
		if (result[1].type === "execution") {
			expect(result[1].data.durationMs).toBe(3200)
			expect(result[1].data.steps).toHaveLength(0)
		}
	})

	it("preserves active placeholder execution block when agent is active", () => {
		const user = createUserItem("u1", "Run a long task")
		const activeExec: RenderItem = {
			type: "execution",
			key: "active-placeholder",
			data: {
				isActive: true,
				steps: [],
				startedAt: Date.now(),
			},
		}

		const result = organizeTurnItems([user, activeExec])

		expect(result).toHaveLength(2)
		expect(result[0].type).toBe("user")
		expect(result[1].type).toBe("execution")
		if (result[1].type === "execution") {
			expect(result[1].data.isActive).toBe(true)
		}
	})

	it("correctly preserves system notices", () => {
		const sys: RenderItem = {
			type: "system",
			key: "sys-1",
			data: {
				id: "sys-1",
				role: "system",
				content: "Environment switched",
			} as Message,
		}
		const user = createUserItem("u1", "Hello")
		const exec = createExecutionItem(
			"e1",
			[{ id: "t1", type: "thinking" }],
			1000,
		)
		const asst = createAssistantItem("a1", "Hi!")

		const result = organizeTurnItems([sys, user, asst, exec])

		expect(result.map((r) => r.type)).toEqual([
			"system",
			"user",
			"execution",
			"assistant",
		])
	})
})
