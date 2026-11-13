import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AssistantMessage } from "../components/AssistantMessage"
import type { Message } from "../types/ipc"

describe("Project File Chips and Tab Previews", () => {
	it("renders project markdown files and paths as ProjectFileChip with editor tab action", () => {
		const message: Message = {
			id: "m1",
			role: "assistant",
			content: [
				{
					type: "text",
					text: "我在 `docs/study/` 下新增了文件：\n\n- README.md\n- 01-哲学与领域模型.md\n- docs/study/02-授权模型.md",
				},
			],
			createdAt: "2026-11-12T19:56:00.000Z",
		}

		const html = renderToStaticMarkup(<AssistantMessage message={message} />)

		// Must render data-file-chip instead of data-library-chip
		expect(html).toContain('data-file-chip="true"')
		expect(html).toContain('title="Click to open &quot;README.md&quot; in editor tab"')
		expect(html).toContain(
			'title="Click to open &quot;01-哲学与领域模型.md&quot; in editor tab"',
		)
		expect(html).toContain(
			'title="Click to open &quot;docs/study/02-授权模型.md&quot; in editor tab"',
		)
		expect(html).not.toContain('title="Click to preview &quot;README.md&quot; in Library"')
	})

	it("renders markdown table cells with project files as ProjectFileChip", () => {
		const message: Message = {
			id: "m2",
			role: "assistant",
			content: [
				{
					type: "text",
					text: `| 文件 | 内容 |
| --- | --- |
| README.md | 目录、适合谁、环境准备 |
| 01-哲学与领域模型.md | 注意力经济学 |`,
				},
			],
			createdAt: "2026-11-12T19:56:00.000Z",
		}

		const html = renderToStaticMarkup(<AssistantMessage message={message} />)

		expect(html).toContain('data-file-chip="true"')
		expect(html).toContain('title="Click to open &quot;README.md&quot; in editor tab"')
		expect(html).toContain(
			'title="Click to open &quot;01-哲学与领域模型.md&quot; in editor tab"',
		)
		expect(html).not.toContain('data-library-chip="true"')
	})

	it("preserves LibraryDocumentChip for explicit library links or office documents", () => {
		const message: Message = {
			id: "m3",
			role: "assistant",
			content: [
				{
					type: "text",
					text: "知识库文件：`1-2.习近平总书记重要讲话精神.docx`\n\n[点击查看知识库](library://doc-123)",
				},
			],
			createdAt: "2026-11-12T19:56:00.000Z",
		}

		const html = renderToStaticMarkup(<AssistantMessage message={message} />)

		expect(html).toContain('data-library-chip="true"')
		expect(html).toContain("doc-123")
		expect(html).toContain("1-2.习近平总书记重要讲话精神.docx")
	})
})
