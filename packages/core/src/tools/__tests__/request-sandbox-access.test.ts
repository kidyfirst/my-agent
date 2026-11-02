import { describe, expect, it } from "vitest"
import * as path from "node:path"
import { requestSandboxAccessTool } from "../request-sandbox-access.js"
import { RequestContext } from "../../core/index.js"

describe("request_sandbox_access tool", () => {
	it("returns a clean error message without /sandbox when UI context is missing", async () => {
		const res = await (requestSandboxAccessTool as any).execute({
			path: "/outside/dir",
			reason: "Need to inspect files",
		})

		expect(res.isError).toBe(true)
		expect(res.content).not.toContain("/sandbox")
		expect(res.content).toContain("approval UI context not available")
	})

	it("emits ask_question and adds path to sandboxAllowedPaths on approval", async () => {
		const events: any[] = []
		let questionResolver: any = null
		let state = { sandboxAllowedPaths: [] as string[] }

		const mockHarness = {
			emitEvent: (evt: any) => events.push(evt),
			registerQuestion: ({ resolve }: any) => {
				questionResolver = resolve
			},
			getState: () => state,
			setState: async (patch: any) => {
				state = { ...state, ...patch }
			},
		}

		const rc = new RequestContext()
		rc.set("harness", mockHarness)
		const toolContext = { requestContext: rc }

		const testPath = path.resolve("/tmp/external-project")
		const executePromise = (requestSandboxAccessTool as any).execute(
			{
				path: testPath,
				reason: "Need to read sibling repo docs",
			},
			toolContext,
		)

		// Wait a tick for question registration
		await new Promise((r) => setTimeout(r, 10))

		expect(events.length).toBe(1)
		expect(events[0].type).toBe("ask_question")
		expect(events[0].question).toContain(testPath)
		expect(events[0].options).toBeDefined()
		expect(questionResolver).toBeDefined()

		// User approves
		questionResolver("Approve")

		const res = await executePromise
		expect(res.isError).toBe(false)
		expect(res.content).toContain("Access granted")
		expect(state.sandboxAllowedPaths).toContain(testPath)
	})

	it("returns access denied when user declines", async () => {
		const events: any[] = []
		let questionResolver: any = null
		const state = { sandboxAllowedPaths: [] as string[] }

		const mockHarness = {
			emitEvent: (evt: any) => events.push(evt),
			registerQuestion: ({ resolve }: any) => {
				questionResolver = resolve
			},
			getState: () => state,
			setState: async () => {},
		}

		const rc = new RequestContext()
		rc.set("harness", mockHarness)
		const toolContext = { requestContext: rc }

		const testPath = path.resolve("/tmp/restricted-project")
		const executePromise = (requestSandboxAccessTool as any).execute(
			{
				path: testPath,
				reason: "Need to edit sibling repo",
			},
			toolContext,
		)

		await new Promise((r) => setTimeout(r, 10))
		questionResolver("Deny")

		const res = await executePromise
		expect(res.isError).toBe(false)
		expect(res.content).toContain("Access denied: The user declined access")
		expect(state.sandboxAllowedPaths).not.toContain(testPath)
	})
})
