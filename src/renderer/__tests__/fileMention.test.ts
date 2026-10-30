import { describe, it, expect } from "vitest"
import {
	extractAtMentionQuery,
	filterRepoFiles,
} from "../components/FileMentionAutocomplete"

describe("extractAtMentionQuery", () => {
	it("extracts query when @ is at the beginning of the text", () => {
		const res1 = extractAtMentionQuery("@")
		expect(res1).toEqual({
			filter: "",
			range: { start: 0, end: 1 },
		})

		const res2 = extractAtMentionQuery("@f")
		expect(res2).toEqual({
			filter: "f",
			range: { start: 0, end: 2 },
		})

		const res3 = extractAtMentionQuery("@fast.ts")
		expect(res3).toEqual({
			filter: "fast.ts",
			range: { start: 0, end: 8 },
		})
	})

	it("extracts query when preceded by spaces or english text", () => {
		const res = extractAtMentionQuery("Check out @execute.ts")
		expect(res).toEqual({
			filter: "execute.ts",
			range: { start: 10, end: 21 },
		})
	})

	it("extracts query when preceded by Chinese characters without spaces", () => {
		const res = extractAtMentionQuery("输入框中支持@f")
		expect(res).toEqual({
			filter: "f",
			range: { start: 6, end: 8 },
		})
	})

	it("returns null if there is whitespace after @", () => {
		const res = extractAtMentionQuery("@fast ")
		expect(res).toBeNull()

		const res2 = extractAtMentionQuery("@fast something")
		expect(res2).toBeNull()
	})

	it("returns null if there is no @ in the text", () => {
		const res = extractAtMentionQuery("Hello world")
		expect(res).toBeNull()
	})

	it("picks the last @ before the cursor", () => {
		const res = extractAtMentionQuery("email@test.com and @newFile")
		expect(res).toEqual({
			filter: "newFile",
			range: { start: 19, end: 27 },
		})
	})
})

describe("filterRepoFiles", () => {
	const mockFiles = [
		"src/prompts/fast.ts",
		"src/core/memory/filter.ts",
		"src/tools/file-view.ts",
		"src/core/workspace/filesystem.ts",
		"src/renderer/components/FileTree.tsx",
		"src/renderer/components/FileEditor.tsx",
		"src/renderer/components/FilesChangedBar.tsx",
		"src/core/memory/__tests__/memory-filter.test.ts",
		"src/agents/execute.ts",
		"README.md",
	]

	it("returns top files when filter is empty, prioritizing recently opened", () => {
		const openFiles = ["src/renderer/components/FileTree.tsx"]
		const result = filterRepoFiles(mockFiles, "", openFiles)

		expect(result.length).toBeGreaterThan(0)
		expect(result[0].path).toBe("src/renderer/components/FileTree.tsx")
		expect(result[0].isRecentlyOpened).toBe(true)
	})

	it("filters by prefix match on basename", () => {
		const result = filterRepoFiles(mockFiles, "f")
		const names = result.map((r) => r.name)

		// All returned files should match 'f'
		expect(names.length).toBeGreaterThanOrEqual(7)
		expect(names).toContain("fast.ts")
		expect(names).toContain("filter.ts")
		expect(names).toContain("FileTree.tsx")
	})

	it("boosts recently opened files when scores are comparable", () => {
		const openFiles = ["src/prompts/fast.ts"]
		const result = filterRepoFiles(mockFiles, "f", openFiles)

		// fast.ts should have score boost from being recently opened
		expect(result[0].name).toBe("fast.ts")
		expect(result[0].isRecentlyOpened).toBe(true)
	})

	it("matches path substrings if basename doesn't match", () => {
		const result = filterRepoFiles(mockFiles, "agents")
		expect(result).toHaveLength(1)
		expect(result[0].path).toBe("src/agents/execute.ts")
	})

	it("returns empty list if nothing matches", () => {
		const result = filterRepoFiles(mockFiles, "nonexistent-xyz")
		expect(result).toHaveLength(0)
	})
})
