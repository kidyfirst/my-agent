import { describe, expect, it } from "vitest"
import { parseSubagentMeta, parseSubagentToolLog } from "../subagentMeta"

describe("parseSubagentToolLog", () => {
	it("splits entries into ordered records with error flags", () => {
		expect(
			parseSubagentToolLog("view:ok,search_content:err,find_files:ok"),
		).toEqual([
			{ name: "view", isError: false, status: "complete" },
			{ name: "search_content", isError: true, status: "complete" },
			{ name: "find_files", isError: false, status: "complete" },
		])
	})

	it("tolerates empty segments and missing status", () => {
		expect(parseSubagentToolLog(" view:ok , ,plain ")).toEqual([
			{ name: "view", isError: false, status: "complete" },
			{ name: "plain", isError: false, status: "complete" },
		])
	})

	it("returns an empty list for an empty string", () => {
		expect(parseSubagentToolLog("")).toEqual([])
	})
})

describe("parseSubagentMeta", () => {
	it("extracts model, duration and tools, and strips the tag from the result", () => {
		const raw =
			'调研完成。\n\n结论：模块 Y 负责调度。\n<subagent-meta modelId="google/gemini-2.0-flash" durationMs="4200" tools="view:ok,search_content:ok,view:err" />'
		const info = parseSubagentMeta(raw)
		expect(info.cleanResult).toBe("调研完成。\n\n结论：模块 Y 负责调度。")
		expect(info.modelId).toBe("google/gemini-2.0-flash")
		expect(info.durationMs).toBe(4200)
		expect(info.tools.map((t) => [t.name, t.isError])).toEqual([
			["view", false],
			["search_content", false],
			["view", true],
		])
	})

	it("passes text through untouched when no meta tag is present", () => {
		const info = parseSubagentMeta("plain result without metadata")
		expect(info.cleanResult).toBe("plain result without metadata")
		expect(info.modelId).toBeNull()
		expect(info.durationMs).toBeNull()
		expect(info.tools).toEqual([])
	})

	it("handles non-string results without throwing", () => {
		expect(parseSubagentMeta(undefined)).toEqual({
			cleanResult: "",
			modelId: null,
			durationMs: null,
			tools: [],
		})
		expect(parseSubagentMeta({ content: 42 }).cleanResult).toBe("")
	})

	it("reads the meta from an object-shaped result's string content", () => {
		const info = parseSubagentMeta({
			content:
				'done\n<subagent-meta modelId="m" durationMs="10" tools="view:ok" />',
		})
		expect(info.durationMs).toBe(10)
		expect(info.tools).toHaveLength(1)
		expect(info.cleanResult).toBe("done")
	})

	it("keeps an abort marker result intact when it has no meta", () => {
		const info = parseSubagentMeta("[Aborted by user]")
		expect(info.cleanResult).toBe("[Aborted by user]")
	})

	it("nulls out a malformed duration instead of NaN", () => {
		const info = parseSubagentMeta(
			'x\n<subagent-meta modelId="m" durationMs="fast" tools="" />',
		)
		expect(info.durationMs).toBeNull()
		expect(info.tools).toEqual([])
		expect(info.cleanResult).toBe("x")
	})
})
