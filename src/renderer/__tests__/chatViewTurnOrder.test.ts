import { describe, it, expect } from "vitest"
import {
	organizeTurnItems,
	groupItemsIntoTurns,
	isReplayTurn,
	decideDuplicateUser,
	isDuplicateReplayAnswer,
	type RenderItem,
} from "../components/ChatView"
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

	describe("groupItemsIntoTurns - Sticky Isolation", () => {
		it("groups multiple turns so each turn contains its own user message as a sticky boundary", () => {
			const u1 = createUserItem("u1", "First question")
			const a1 = createAssistantItem("a1", "First answer")
			const u2 = createUserItem("u2", "Second question")
			const a2 = createAssistantItem("a2", "Second answer")
			const u3 = createUserItem("u3", "Third question")
			const a3 = createAssistantItem("a3", "Third answer")

			const items = organizeTurnItems([u1, a1, u2, a2, u3, a3])
			const turns = groupItemsIntoTurns(items)

			expect(turns).toHaveLength(3)
			expect(turns[0].userItem?.data.id).toBe("u1")
			expect(turns[0].items.map((i) => i.type)).toEqual(["assistant"])

			expect(turns[1].userItem?.data.id).toBe("u2")
			expect(turns[1].items.map((i) => i.type)).toEqual(["assistant"])

			expect(turns[2].userItem?.data.id).toBe("u3")
			expect(turns[2].items.map((i) => i.type)).toEqual(["assistant"])
		})

		it("handles system notices before turns without userItem", () => {
			const sys: RenderItem = {
				type: "system",
				key: "sys-1",
				data: { id: "sys-1", role: "system", content: "Init" } as Message,
			}
			const u1 = createUserItem("u1", "Hello")
			const a1 = createAssistantItem("a1", "Hi")

			const turns = groupItemsIntoTurns([sys, u1, a1])

			expect(turns).toHaveLength(2)
			expect(turns[0].userItem).toBeUndefined()
			expect(turns[0].items[0].type).toBe("system")

			expect(turns[1].userItem?.data.id).toBe("u1")
			expect(turns[1].items[0].type).toBe("assistant")
		})
	})
})

describe("isReplayTurn", () => {
	const userItem = (id: string): RenderItem => ({
		type: "user",
		key: `msg-${id}`,
		data: {
			id,
			role: "user",
			content: [{ type: "text", text: "在么" }],
			createdAt: new Date().toISOString(),
		} as Message,
	})

	const assistantItem = (id: string): RenderItem => ({
		type: "assistant",
		key: `msg-${id}-text-0`,
		data: {
			id,
			role: "assistant",
			content: [{ type: "text", text: "在。" }],
			isStreaming: false,
			createdAt: new Date().toISOString(),
		} as Message & { isStreaming: boolean },
	})

	it("flags a turn whose user message came from a recording", () => {
		const turns = groupItemsIntoTurns([
			userItem("replay-user-run-1-0"),
			assistantItem("replay-assistant-run-1-0"),
		])
		expect(isReplayTurn(turns[0])).toBe(true)
	})

	it("flags a recording without a captured prompt via its assistant message", () => {
		const turns = groupItemsIntoTurns([
			assistantItem("replay-assistant-run-1-0"),
		])
		expect(isReplayTurn(turns[0])).toBe(true)
	})

	it("leaves live turns unmarked", () => {
		const turns = groupItemsIntoTurns([
			userItem("u-live"),
			assistantItem("a-live"),
		])
		expect(isReplayTurn(turns[0])).toBe(false)
	})

	it("keeps a replayed prompt as its own turn when grouping two identical prompts", () => {
		// `decideDuplicateUser` already collapses the live/replay pair upstream, so
		// grouping only ever sees one of them. Should both reach this point, they must
		// stay separate turns instead of silently merging into the live one.
		const turns = groupItemsIntoTurns([
			userItem("u-live"),
			userItem("replay-user-run-1-0"),
			assistantItem("replay-assistant-run-1-0"),
		])
		expect(turns).toHaveLength(2)
		expect(turns[1].userItem?.data.id).toBe("replay-user-run-1-0")
		expect(isReplayTurn(turns[1])).toBe(true)
	})
})

describe("decideDuplicateUser", () => {
	const user = (id: string, text: string): Message =>
		({
			id,
			role: "user",
			content: [{ type: "text", text }],
			createdAt: new Date().toISOString(),
		}) as Message

	it("keeps distinct prompts", () => {
		expect(decideDuplicateUser(user("u1", "在么"), user("u2", "在吗"))).toBe(
			"keep",
		)
	})

	it("replaces a live prompt with the replayed copy of the same prompt", () => {
		// The exact production case: the user had already sent "在么", then replayed a
		// recording of that same prompt. One bubble must survive, and it must be the
		// replayed one so the turn stays inside a single replay outline.
		expect(
			decideDuplicateUser(
				user("u-live", "在么"),
				user("replay-user-r1-0", "在么"),
			),
		).toBe("replace-previous")
	})

	it("keeps a live prompt typed again after a replayed one", () => {
		// Sending the same text again after a replay is a real new send — dropping
		// it would look like the message vanished.
		expect(
			decideDuplicateUser(
				user("replay-user-r1-0", "在么"),
				user("u-live", "在么"),
			),
		).toBe("keep")
	})

	it("keeps two replayed prompts (two recorded runs)", () => {
		expect(
			decideDuplicateUser(
				user("replay-user-r1-0", "在么"),
				user("replay-user-r2-0", "在么"),
			),
		).toBe("keep")
	})

	it("collapses a double-sent live prompt", () => {
		expect(decideDuplicateUser(user("u1", "在么"), user("u2", "在么"))).toBe(
			"skip",
		)
	})

	it("ignores a non-user previous item", () => {
		expect(decideDuplicateUser(undefined, user("u1", "在么"))).toBe("keep")
	})
})

describe("isDuplicateReplayAnswer", () => {
	const answer = (id: string, text = "在。"): Message =>
		({
			id,
			role: "assistant",
			content: [{ type: "text", text }],
			createdAt: new Date().toISOString(),
		}) as Message

	it("detects a live answer that repeats the replayed one", () => {
		expect(
			isDuplicateReplayAnswer(
				answer("replay-assistant-r1-0"),
				answer("a-live"),
			),
		).toBe(true)
	})

	it("never collapses two live answers", () => {
		expect(isDuplicateReplayAnswer(answer("a1"), answer("a2"))).toBe(false)
	})

	it("keeps answers that differ", () => {
		expect(
			isDuplicateReplayAnswer(
				answer("replay-assistant-r1-0", "在。"),
				answer("a-live", "在。有什么可以帮你的？"),
			),
		).toBe(false)
	})

	it("keeps answers carrying tool calls", () => {
		const withTool = {
			id: "a-live",
			role: "assistant",
			content: [
				{ type: "text", text: "在。" },
				{
					type: "tool-call",
					toolCallId: "t1",
					toolName: "read_file",
					input: {},
				},
			],
			createdAt: new Date().toISOString(),
		} as unknown as Message
		expect(
			isDuplicateReplayAnswer(answer("replay-assistant-r1-0"), withTool),
		).toBe(false)
	})

	it("keeps the same answer from two different playbacks", () => {
		// Replaying one recording twice writes the same text with a different
		// per-playback id suffix. Those are two passes, not a duplicate answer.
		expect(
			isDuplicateReplayAnswer(
				answer("replay-assistant-r1-0-pbmg2k1"),
				answer("replay-assistant-r1-0-pbn9x2"),
			),
		).toBe(false)
	})

	it("still collapses a replayed answer duplicated inside one playback", () => {
		expect(
			isDuplicateReplayAnswer(
				answer("replay-assistant-r1-0-pbmg2k1"),
				answer("replay-assistant-r1-1-pbmg2k1"),
			),
		).toBe(true)
	})
})
