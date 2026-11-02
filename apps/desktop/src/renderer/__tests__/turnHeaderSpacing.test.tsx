import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { ExecutionBlock } from "../components/ExecutionBlock"
import { AssistantMessage } from "../components/AssistantMessage"
import type { Message } from "../types/chat"

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(here, "..", rel), "utf8")

const message = {
	id: "m1",
	role: "assistant",
	content: "明白，去掉作者口吻的表述。",
	createdAt: "2026-10-30T08:20:00.000Z",
} as unknown as Message

describe("turn header spacing", () => {
	it("the header owns the gap under it, not its own padding", () => {
		const html = renderToStaticMarkup(
			<ExecutionBlock durationMs={3900} steps={[]} />,
		)
		expect(html).toContain("Worked for 3.9s")
		// 8px below: same value the answer's timestamp uses above itself.
		expect(html).toContain("margin:6px 0 8px 0")
		// No bottom padding on the label row — it would stack onto that margin.
		expect(html).toContain("padding:3px 0 0 0")
	})

	it("an answer under a header drops its own top spacing", () => {
		const tight = renderToStaticMarkup(
			<AssistantMessage message={message} flushTop />,
		)
		expect(tight).toContain('class="assistant-message assistant-flush-top"')
		expect(tight).toContain("padding:0 0 8px 0")

		const loose = renderToStaticMarkup(<AssistantMessage message={message} />)
		expect(loose).toContain('class="assistant-message"')
		expect(loose).toContain("padding:8px 0")
	})

	it("the flush rule only cancels the first block's margin", () => {
		const source = read("components/AssistantMessage.tsx")
		expect(source).toContain(
			".assistant-flush-top .markdown-body > :first-child { margin-top: 0; }",
		)
	})

	it("header gap and timestamp gap are the same number", () => {
		// The collapsed header uses the plain number; an open step list gets a
		// slightly larger one, so read the false branch.
		const header = /margin: `6px 0 \$\{stepsVisible \? \d+ : (\d+)\}px 0`/.exec(
			read("components/ExecutionBlock.tsx"),
		)
		// The footer row now holds the timestamp plus the action pill; only the
		// horizontal gap grew, the top margin still mirrors the header.
		const timestamp =
			/alignItems: "center",\s*gap: \d+,\s*marginTop: (\d+),/.exec(
				read("components/AssistantMessage.tsx"),
			)
		expect(header?.[1]).toBeDefined()
		expect(timestamp?.[1]).toBeDefined()
		expect(header?.[1]).toBe(timestamp?.[1])
	})

	it("ChatView only tightens answers that directly follow a header", () => {
		const source = read("components/ChatView.tsx")
		expect(source).toContain("flushTop={afterHeader}")
		expect(source).toMatch(/turn\.items\[i - 1\]\?\.type === "execution"/)
	})
})
