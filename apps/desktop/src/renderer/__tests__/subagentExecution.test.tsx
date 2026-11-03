import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SubagentExecution } from "../components/SubagentExecution"

const base = {
	toolCallId: "call-1",
	agentType: "execute",
	task: "Create demo-subagent.ts",
	tools: [] as Array<{
		name: string
		args: unknown
		result?: unknown
		isError?: boolean
		status: string
	}>,
}

const markup = (props: Partial<typeof base> & { status: string }) =>
	renderToStaticMarkup(
		<SubagentExecution subagent={{ ...base, ...props } as any} />,
	)

describe("SubagentExecution header", () => {
	it("renders 'Agent for Xs' with a chevron when finished", () => {
		const html = markup({ status: "complete", durationMs: 4200 })
		expect(html).toContain("Agent for 4s")
		// The expand/collapse chevron (aria-hidden svg) sits next to the label.
		expect(html).toContain('aria-hidden="true"')
	})

	it("formats long durations as minutes and seconds", () => {
		const html = markup({ status: "complete", durationMs: 114000 })
		expect(html).toContain("Agent for 1m 54s")
	})

	it("ticks live and stays frozen when interrupted without a duration", () => {
		// Running falls back to the first tick; interrupted shows just "Agent".
		expect(markup({ status: "running" })).toContain("Agent for 1s")
		expect(markup({ status: "interrupted" })).toContain(">Agent<")
		expect(markup({ status: "interrupted" })).not.toContain("Agent for")
	})

	it("keeps the interrupted duration static when known", () => {
		const html = markup({ status: "interrupted", durationMs: 12600 })
		expect(html).toContain("Agent for 13s")
	})

	it("marks a failed subagent as failed instead of silently done", () => {
		const html = markup({
			status: "complete",
			isError: true,
			durationMs: 6480,
		})
		expect(html).toContain("Agent failed after 6s")
		expect(html).not.toContain("Agent for")
	})

	it("numbers parallel agents starting from 1", () => {
		expect(
			markup({ status: "complete", durationMs: 4200, index: 1 }),
		).toContain("Agent 1 for 4s")
		expect(
			markup({ status: "complete", durationMs: 4200, index: 2 }),
		).toContain("Agent 2 for 4s")
		// A numbered failure keeps the index prefix.
		expect(
			markup({ status: "complete", isError: true, durationMs: 6480, index: 2 }),
		).toContain("Agent 2 failed after 6s")
		// Unnumbered singletons stay plain.
		expect(markup({ status: "complete", durationMs: 4200 })).toContain(
			"Agent for 4s",
		)
	})
})

describe("SubagentExecution step log", () => {
	it("renders sub-tools with the Working-block row styling and a step count", () => {
		const html = markup({
			status: "complete",
			durationMs: 70000,
			tools: [
				{ name: "view", args: { file_path: "a/b.ts" }, status: "complete" },
				{
					name: "execute_command",
					args: { command: "ls" },
					status: "complete",
				},
				{
					name: "write_file",
					args: { file_path: "x.ts" },
					isError: true,
					status: "complete",
				},
			],
		})
		// Collapsed header shows the step count, like "Working for › (3 steps)".
		expect(html).toContain("(3 steps)")
		// Rows reuse ToolExecution: friendly labels + icons, error marker on the
		// failed write.
		expect(html).toContain("Bash")
		expect(html).toContain("ls")
		expect(html).toContain("✕")
		// The collapsed log window uses the same 82px max-height as the
		// Working block's step list.
		expect(html).toContain("max-height:82px")
	})

	it("shows no step window when the subagent has no recorded tools", () => {
		const html = markup({ status: "interrupted" })
		expect(html).not.toContain("steps")
		expect(html).not.toContain("max-height:82px")
	})
})
