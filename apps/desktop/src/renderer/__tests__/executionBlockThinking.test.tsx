import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ExecutionBlock, formatThinkingText } from "../components/ExecutionBlock"

describe("formatThinkingText", () => {
	it("returns empty string for empty input", () => {
		expect(formatThinkingText("")).toBe("")
	})

	it("splits dense run-on text before Chinese phase markers", () => {
		const raw = "我先读一下当前实现，然后再开始修改。实现已经清楚了。关键点：Math.ceil 是每次分段都向上取整。现在开始验证：先检查是否有测试引用。"
		const formatted = formatThinkingText(raw)
		expect(formatted).toContain("实现已经清楚了。\n\n关键点：")
		expect(formatted).toContain("向上取整。\n\n现在开始验证：")
	})

	it("splits text before English phase transitions", () => {
		const raw = "First step is to check files. Then we run tests. Finally we commit."
		const formatted = formatThinkingText(raw)
		expect(formatted).toContain("files.\n\nThen")
		expect(formatted).toContain("tests.\n\nFinally")
	})

	it("splits before bracketed bold phases", () => {
		const raw = "Intro text here **[Analysis]** Let's see what happens **[Plan]** Step 1."
		const formatted = formatThinkingText(raw)
		expect(formatted).toContain("Intro text here\n\n**[Analysis]**")
		expect(formatted).toContain("what happens\n\n**[Plan]**")
	})
})

describe("ExecutionBlock rendering", () => {
	it("renders execution block with thinking and tool steps", () => {
		const steps = [
			{
				type: "thinking" as const,
				id: "think-1",
				text: "Analysis completed. Now starting work.",
			},
			{
				type: "tool" as const,
				id: "tool-step-1",
				tool: {
					id: "tool-1",
					name: "read_file",
					args: { path: "test.ts" },
					status: "complete" as const,
				},
			},
		]
		const html = renderToStaticMarkup(
			<ExecutionBlock steps={steps} isActive={true} />,
		)
		expect(html).toContain("Thought")
		expect(html).toContain("Read")
		expect(html).toContain("test.ts")
	})
})
