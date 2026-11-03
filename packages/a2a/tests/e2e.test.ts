import { describe, it, expect, vi, beforeAll } from "vitest"
import { Readable, Writable } from "node:stream"
import { createA2ARequestHandler } from "../src/server/http-server.js"
import { A2AClient } from "../src/client/client.js"
import type { MyAgentHarness } from "@my-agent/core"

function createInProcessFetch(handler: (req: any, res: any) => Promise<void>) {
	return async (
		url: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		const urlStr = url.toString()
		const parsed = new URL(urlStr)
		const method = init?.method || "GET"
		const headers = new Headers(init?.headers)
		const bodyStr = typeof init?.body === "string" ? init.body : ""

		const reqStream = new Readable({
			read() {
				if (bodyStr) {
					this.push(bodyStr)
				}
				this.push(null)
			},
		}) as any
		reqStream.url = parsed.pathname + parsed.search
		reqStream.method = method
		reqStream.headers = Object.fromEntries(headers.entries())

		let statusCode = 200
		const resHeaders = new Headers()
		const responseChunks: Buffer[] = []

		const resStream = new Writable({
			write(chunk, _encoding, callback) {
				responseChunks.push(Buffer.from(chunk))
				callback()
			},
		}) as any

		resStream.setHeader = (name: string, value: string) => {
			resHeaders.set(name, value)
		}
		resStream.writeHead = (code: number, headersObj?: any) => {
			statusCode = code
			if (headersObj) {
				for (const [k, v] of Object.entries(headersObj)) {
					resHeaders.set(k, String(v))
				}
			}
		}

		await new Promise<void>((resolve) => {
			resStream.on("finish", resolve)
			handler(reqStream, resStream).catch(console.error)
		})

		const responseBody = Buffer.concat(responseChunks).toString("utf-8")
		return new Response(responseBody, {
			status: statusCode,
			headers: resHeaders,
		})
	}
}

describe("A2A Server and Client In-Process E2E", () => {
	let client: A2AClient
	let mockHarness: MyAgentHarness

	beforeAll(() => {
		mockHarness = {
			id: "test-harness",
			controller: {} as any,
			activeSession: { resourceId: "/workspace/proj-a" } as any,
			init: vi.fn(),
			subscribe: vi.fn(() => () => {}),
			sendMessage: vi.fn(async () => {}),
			abort: vi.fn(async () => {}),
			steer: vi.fn(),
			followUp: vi.fn(),
			getState: vi.fn(() => ({})),
			setState: vi.fn(),
			listModes: vi.fn(() => []),
			getCurrentModeId: vi.fn(() => "react"),
			switchMode: vi.fn(),
			getCurrentModelId: vi.fn(() => "model-x"),
			getFullModelId: vi.fn(() => "provider:model-x"),
			switchModel: vi.fn(),
			switchObserverModel: vi.fn(),
			switchReflectorModel: vi.fn(),
			getCurrentThreadId: vi.fn(() => "thread-e2e"),
			createThread: vi.fn(async (opts) => ({
				id: "thread-created-e2e",
				title: opts?.title || "New Thread",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})),
			switchThread: vi.fn(),
			renameThread: vi.fn(),
			deleteThread: vi.fn(),
			listThreads: vi.fn(async () => [
				{
					id: "thread-e2e",
					title: "E2E Thread",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			]),
			listMessages: vi.fn(async () => [
				{ id: "m1", role: "assistant", content: "Agent completed task" },
			]),
			getTokenUsage: vi.fn(() => ({}) as any),
			getDisplayState: vi.fn(() => ({}) as any),
			isRunning: vi.fn(() => false),
			isThreadRunning: vi.fn(() => false),
			getRunningThreadIds: vi.fn(() => []),
			getPendingApprovals: vi.fn(() => []),
			respondToToolApproval: vi.fn(),
			respondToQuestion: vi.fn(),
			respondToPlanApproval: vi.fn(),
			listAvailableModels: vi.fn(() => []),
			setPermissionForCategory: vi.fn(),
			getPermissionRules: vi.fn(() => ({}) as any),
			getSessionGrants: vi.fn(() => ({}) as any),
		}

		const handler = createA2ARequestHandler({
			harness: mockHarness,
			port: 3888,
			host: "127.0.0.1",
		})

		const inProcessFetch = createInProcessFetch(handler)

		client = new A2AClient({
			baseUrl: "http://127.0.0.1:3888",
			fetch: inProcessFetch as any,
		})
	})

	it("fetches agent card", async () => {
		const card = await client.getAgentCard()
		expect(card.name).toBe("My Agent")
		expect(card.capabilities.streaming).toBe(true)
		expect(card.skills.length).toBeGreaterThan(0)
	})

	it("creates a thread via A2A client", async () => {
		const res = await client.createThread({ title: "A2A Created Thread" })
		expect(res.threadId).toBe("thread-created-e2e")
		expect(res.title).toBe("A2A Created Thread")
	})

	it("sends a message via A2A client", async () => {
		const task = await client.sendMessage({
			contextId: "thread-e2e",
			message: { text: "Review PR #42" },
		})
		expect(task.status).toBe("COMPLETED")
		expect(task.message.parts[0].text).toBe("Agent completed task")
	})
})
