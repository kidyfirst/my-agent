import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { FileEditor } from "../components/FileEditor"
import { OpenInDropdown } from "../components/OpenInDropdown"

describe("FileEditor with OpenInDropdown", () => {
	beforeEach(() => {
		// Mock window.api
		;(globalThis as any).window = {
			api: {
				invoke: vi.fn().mockResolvedValue({
					content: "# Hello World",
					path: "docs/study/04-execution.md",
					fileName: "04-execution.md",
					extension: "md",
					size: 100,
					lineCount: 1,
				}),
				on: vi.fn(),
			},
		}
	})

	it("renders OpenInDropdown in FileEditor header instead of raw button", () => {
		const html = renderToStaticMarkup(
			<FileEditor filePath="docs/study/04-execution.md" />,
		)
		expect(html).toContain("Open in...")
		expect(html).toContain("Open file in...")
		// Should not have the hardcoded viewBox 0 0 16 16 on external editor icon
		expect(html).not.toContain('viewBox="0 0 16 16"')
	})

	it("renders OpenInDropdown with valid 24x24 viewBox chevron icon", () => {
		const html = renderToStaticMarkup(
			<OpenInDropdown filePath="docs/study/04-execution.md" />,
		)
		expect(html).toContain("Open in...")
		expect(html).toContain('viewBox="0 0 24 24"')
		expect(html).not.toContain('viewBox="0 0 8 8"')
	})
})
