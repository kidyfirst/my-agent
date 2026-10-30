import { beforeEach, describe, expect, it, vi } from "vitest"

const calls: any[] = []

vi.mock("../llm-stream.js", () => ({
	executeStreamLLM: vi.fn(async (options: any) => {
		calls.push(options)
		return {
			assistantText: "ok",
			reasoningText: "",
			executedTools: [],
			tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		}
	}),
}))

const { chatGraphDefinition } = await import("../graphs/chat-graph.js")

function makeContext(executableTools: Record<string, any>) {
	return {
		modeId: "fast",
		model: {},
		modelIdStr: "test/model",
		instructions: "base instructions",
		executableTools,
		abortSignal: new AbortController().signal,
		emit: () => {},
		resourceId: "r1",
		threadId: "t1",
	} as any
}

async function runGraph(executableTools: Record<string, any>) {
	calls.length = 0
	const app = chatGraphDefinition.buildGraph(makeContext(executableTools))
	await app.invoke({ messages: [{ role: "user", content: "hi" }] })
	return calls[0]
}

describe("fast mode tool access", () => {
	beforeEach(() => {
		calls.length = 0
	})

	it("offers read-only tools to the model", async () => {
		const call = await runGraph({
			view: { id: "view" },
			search_content: { id: "search_content" },
			find_files: { id: "find_files" },
			web_search: { id: "web_search" },
		})
		expect(Object.keys(call.tools).sort()).toEqual([
			"find_files",
			"search_content",
			"view",
			"web_search",
		])
	})

	it("never offers write, edit, shell or MCP tools with unknown effects", async () => {
		const call = await runGraph({
			view: { id: "view" },
			write_file: { id: "write_file" },
			string_replace_lsp: { id: "string_replace_lsp" },
			ast_smart_edit: { id: "ast_smart_edit" },
			execute_command: { id: "execute_command" },
			subagent: { id: "subagent" },
			mcp__notion__create_page: { id: "mcp" },
		})
		expect(Object.keys(call.tools)).toEqual(["view"])
	})

	it("offers a connected search server so lookups are possible", async () => {
		// The regression: Fast mode used to strip every MCP tool, so a
		// configured LangSearch was invisible and the model answered "I have no
		// web access" over a working search endpoint.
		const call = await runGraph({
			view: { id: "view" },
			langsearch_web_search: { id: "web" },
			mcp__notion__create_page: { id: "mcp" },
		})
		expect(Object.keys(call.tools).sort()).toEqual([
			"langsearch_web_search",
			"view",
		])
	})

	it("still answers when no read-only tool is registered", async () => {
		const call = await runGraph({ execute_command: { id: "execute_command" } })
		expect(call.tools).toEqual({})
	})

	it("allows a few tool rounds, then forces an answer", async () => {
		const call = await runGraph({ view: { id: "view" } })
		expect(call.stopWhen).toBeDefined()
	})

	it("tells the model it must not write", async () => {
		const call = await runGraph({ view: { id: "view" } })
		expect(call.instructions).toContain("read-only tool access")
		expect(call.instructions).toContain("ReAct mode")
	})
})
