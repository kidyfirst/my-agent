import { describe, it, expect } from "vitest"
import { createRetrieveFoldedMessagesTool } from "../retrieve-folded.js"
import { RequestContext } from "../../core/context/index.js"

describe("retrieve_folded_messages tool", () => {
	it("returns a message when no folded ranges exist", async () => {
		const tool = createRetrieveFoldedMessagesTool()
		const rc = new RequestContext()
		const mockController = {
			getFoldedRanges: () => [],
		}
		rc.set("controller", mockController)
		rc.set("threadId", "test-thread")

		const res = await tool.execute({}, { requestContext: rc } as any)
		expect(res.isError).toBe(false)
		expect(res.content).toContain("No folded history ranges exist")
	})

	it("lists all available folded ranges when rangeId is omitted", async () => {
		const tool = createRetrieveFoldedMessagesTool()
		const rc = new RequestContext()
		const mockRanges = [
			{
				rangeId: "fold_001",
				threadId: "t1",
				messageCount: 10,
				startIndex: 0,
				userGoal: "Implement authentication middleware",
				createdAt: 1700000000000,
				messages: [],
			},
			{
				rangeId: "fold_002",
				threadId: "t1",
				messageCount: 15,
				startIndex: 0,
				userGoal: "Run test suite",
				createdAt: 1700000050000,
				messages: [],
			},
		]
		const mockController = {
			getFoldedRanges: () => mockRanges,
		}
		rc.set("controller", mockController)
		rc.set("threadId", "t1")

		const res = await tool.execute({}, { requestContext: rc } as any)
		expect(res.isError).toBe(false)
		expect(res.content).toContain("Available folded history ranges")
		expect(res.content).toContain("[fold_001]")
		expect(res.content).toContain("Implement authentication middleware")
		expect(res.content).toContain("[fold_002]")
	})

	it("retrieves tool outputs from a specific folded range", async () => {
		const tool = createRetrieveFoldedMessagesTool()
		const rc = new RequestContext()
		const mockMessages = [
			{
				id: "m1",
				role: "user",
				content: "Please build the project",
			},
			{
				id: "m2",
				role: "tool",
				content: "Compilation failed: TS2304 Cannot find name 'foo'",
			},
			{
				id: "m3",
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolName: "execute_command",
						args: { command: "pnpm test" },
					},
					{
						type: "tool-result",
						result: "Tests passed: 5/5",
					},
				],
			},
		]
		const mockRanges = [
			{
				rangeId: "fold_001",
				threadId: "t1",
				messageCount: 3,
				startIndex: 0,
				userGoal: "Please build the project",
				createdAt: Date.now(),
				messages: mockMessages,
			},
		]
		const mockController = {
			getFoldedRanges: () => mockRanges,
		}
		rc.set("controller", mockController)
		rc.set("threadId", "t1")

		// 1. Default filter is tool_outputs
		const resTool = await tool.execute(
			{ rangeId: "fold_001", filter: "tool_outputs" },
			{ requestContext: rc } as any,
		)
		expect(resTool.isError).toBe(false)
		expect(resTool.content).toContain("Retrieved Folded History [fold_001]")
		expect(resTool.content).toContain("Compilation failed: TS2304")
		expect(resTool.content).toContain("execute_command")
		// User message should not be in tool_outputs filter
		expect(resTool.content).not.toContain("Please build the project")

		// 2. User messages filter
		const resUser = await tool.execute(
			{ rangeId: "fold_001", filter: "user_messages" },
			{ requestContext: rc } as any,
		)
		expect(resUser.content).toContain("Please build the project")
		expect(resUser.content).not.toContain("Compilation failed")

		// 3. Keyword query filter
		const resQuery = await tool.execute(
			{ rangeId: "fold_001", filter: "all", query: "TS2304" },
			{ requestContext: rc } as any,
		)
		expect(resQuery.content).toContain("TS2304")
		expect(resQuery.content).not.toContain("Tests passed")
	})

	it("returns an error if requested rangeId does not exist", async () => {
		const tool = createRetrieveFoldedMessagesTool()
		const rc = new RequestContext()
		const mockRanges = [
			{
				rangeId: "fold_001",
				threadId: "t1",
				messageCount: 5,
				startIndex: 0,
				createdAt: Date.now(),
				messages: [],
			},
		]
		const mockController = {
			getFoldedRanges: () => mockRanges,
		}
		rc.set("controller", mockController)
		rc.set("threadId", "t1")

		const res = await tool.execute({ rangeId: "fold_999" }, {
			requestContext: rc,
		} as any)
		expect(res.isError).toBe(true)
		expect(res.content).toContain("Folded range 'fold_999' not found")
	})
})
