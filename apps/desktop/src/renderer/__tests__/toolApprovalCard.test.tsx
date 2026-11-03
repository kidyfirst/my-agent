import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ToolApprovalCard, type PendingApprovalData } from "../components/ToolApprovalCard"

describe("ToolApprovalCard Component", () => {
	const sampleApproval: PendingApprovalData = {
		threadId: "test-thread-1",
		toolCallId: "call_abc123",
		toolName: "execute_command",
		category: "bash",
		categoryLabel: "Bash",
		args: {
			command:
				'curl -s -X POST http://127.0.0.1:3888/a2a -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":2,"method":"projects/create","params":{"path":"/Users/timlyu/my-agent/workspaces/demo-a2a","name":"demo-a2a","initGit":true}}\'',
		},
	}

	it("renders title, description and code preview block", () => {
		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={sampleApproval}
				onRespond={vi.fn()}
			/>,
		)

		expect(html).toContain('data-testid="tool-approval-card"')
		expect(html).toContain("Allow a2a create project demo-a2a?")
		expect(html).toContain(
			"Calls a local server not spawned in this session to create a new project directory outside the workspace.",
		)
		expect(html).toContain("curl")
		expect(html).toContain("127.0.0.1:3888/a2a")
		expect(html).toContain("demo-a2a")
	})

	it("renders all 5 options matching the Gemini approval design", () => {
		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={sampleApproval}
				onRespond={vi.fn()}
			/>,
		)

		// Option 1
		expect(html).toContain("Yes, allow this time")

		// Option 2 (conversation scope)
		expect(html).toContain("in this conversation")

		// Option 3 (project scope)
		expect(html).toContain("in this project")

		// Option 4 (global scope)
		expect(html).toContain("Yes, and always allow")

		// Option 5 (No / decline)
		expect(html).toContain("No")
		expect(html).toContain("(tell the agent what to do instead)")

		// Number badges 1-5
		expect(html).toContain(">1<")
		expect(html).toContain(">2<")
		expect(html).toContain(">3<")
		expect(html).toContain(">4<")
		expect(html).toContain(">5<")
	})

	it("renders Skip and Submit buttons in bottom right", () => {
		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={sampleApproval}
				onRespond={vi.fn()}
			/>,
		)

		expect(html).toContain("Skip")
		expect(html).toContain("Submit ↵")
	})

	it("handles non-command tools gracefully", () => {
		const toolApproval: PendingApprovalData = {
			threadId: "test-thread-2",
			toolCallId: "call_def456",
			toolName: "web_search",
			category: "network",
			categoryLabel: "Network",
			args: { query: "Shenzhen weather today" },
		}

		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={toolApproval}
				onRespond={vi.fn()}
			/>,
		)

		expect(html).toContain("Allow web search?")
		expect(html).toContain("Network tool execution requires your permission.")
		expect(html).toContain("Shenzhen weather today")
		expect(html).toContain("Yes, allow this time")
		expect(html).toContain("in this conversation")
	})

	it("keeps the command preview as the only scroll container", () => {
		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={sampleApproval}
				onRespond={vi.fn()}
			/>,
		)

		// The card is a flex column but must not clamp its own height: a capped
		// body would wrap the options in a second scrollbar beside the preview.
		expect(html).toContain("flex-direction:column")
		expect(html).not.toContain("max-height:60vh")

		// Exactly one scrollable region: the command preview.
		const scrollRegions = html.match(/overflow-y:auto/g) ?? []
		expect(scrollRegions).toHaveLength(1)
		expect(html).toContain("overscroll-behavior:contain")

		// Header and footer stay outside the scrolling region.
		expect(html).toContain("flex-shrink:0")
	})

	it("renders title attributes on options and code block for hover tooltip", () => {
		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={sampleApproval}
				onRespond={vi.fn()}
			/>,
		)

		expect(html).toContain('title="Yes, allow this time"')
		expect(html).toContain("curl -s -X POST http://127.0.0.1:3888/a2a")
	})

	it("omits middle of long command while preserving 'in this conversation' and 'in this project'", () => {
		const longApproval: PendingApprovalData = {
			threadId: "test-thread-long",
			toolCallId: "call_long456",
			toolName: "execute_command",
			category: "bash",
			categoryLabel: "Bash",
			args: {
				command:
					"cd /Users/timlyu/gitcode/github/mastra-code-ui && git diff packages/core/src/tools/subagent.ts packages/core/src/tools/shell.ts packages/core/src/tools/subagent.test.ts",
			},
		}

		const html = renderToStaticMarkup(
			<ToolApprovalCard
				approval={longApproval}
				onRespond={vi.fn()}
			/>,
		)

		// Option 2 & 3 must show middle ellipsis for command
		expect(html).toContain("cd /Users/timlyu...subagent.test.ts")

		// Scope endings must always be present and wrapped
		expect(html).toContain("in this conversation")
		expect(html).toContain("in this project")

		// Hover tooltip retains the full untruncated command (with HTML attribute escaping)
		expect(html).toContain("in this conversation")
		expect(html).toContain("in this project")
		expect(html).toContain("packages/core/src/tools/subagent.test.ts")
	})
})
