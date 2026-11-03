import { describe, expect, it } from "vitest"
import {
	hasRecordingExtension,
	resolveDroppedFilePath,
} from "../utils/droppedFile"

function fakeFile(name: string, legacyPath?: string): File {
	const file: Record<string, unknown> = { name }
	if (legacyPath !== undefined) file.path = legacyPath
	return file as unknown as File
}

function fakeDataTransfer(data: Record<string, string>): DataTransfer {
	return {
		getData: (format: string) => data[format] ?? "",
	} as unknown as DataTransfer
}

describe("hasRecordingExtension", () => {
	it("accepts json and jsonl in any casing", () => {
		expect(hasRecordingExtension("/a/b.json")).toBe(true)
		expect(hasRecordingExtension("/a/b.JSONL")).toBe(true)
		expect(hasRecordingExtension("recording.jsonl")).toBe(true)
	})

	it("rejects other files", () => {
		expect(hasRecordingExtension("/a/b.txt")).toBe(false)
		expect(hasRecordingExtension("/a/b.json.bak")).toBe(false)
	})
})

describe("resolveDroppedFilePath", () => {
	// Electron 32+ dropped File has no `path`; the preload bridge is the only source.
	it("uses the preload bridge when File.path is gone", () => {
		const path = resolveDroppedFilePath(
			fakeFile("rec.jsonl"),
			fakeDataTransfer({}),
			{ getPathForFile: () => "/Users/me/.myagent/sessions/rec.jsonl" },
		)
		expect(path).toBe("/Users/me/.myagent/sessions/rec.jsonl")
	})

	it("prefers the bridge over a stale legacy path", () => {
		const path = resolveDroppedFilePath(
			fakeFile("rec.jsonl", "/stale/path.jsonl"),
			fakeDataTransfer({}),
			{ getPathForFile: () => "/fresh/path.jsonl" },
		)
		expect(path).toBe("/fresh/path.jsonl")
	})

	it("falls back to File.path on older Electron builds", () => {
		const path = resolveDroppedFilePath(
			fakeFile("rec.jsonl", "/legacy/rec.jsonl"),
			fakeDataTransfer({}),
			null,
		)
		expect(path).toBe("/legacy/rec.jsonl")
	})

	it("falls back to a file:// URI when neither source is available", () => {
		const path = resolveDroppedFilePath(
			fakeFile("rec.jsonl"),
			fakeDataTransfer({
				"text/uri-list": "file:///Users/me/My%20Recordings/rec.jsonl",
			}),
			null,
		)
		expect(path).toBe("/Users/me/My Recordings/rec.jsonl")
	})

	it("survives a bridge that throws", () => {
		const path = resolveDroppedFilePath(
			fakeFile("rec.jsonl"),
			fakeDataTransfer({ "text/uri-list": "file:///tmp/rec.jsonl" }),
			{
				getPathForFile: () => {
					throw new Error("not supported")
				},
			},
		)
		expect(path).toBe("/tmp/rec.jsonl")
	})

	it("returns an empty string when nothing can be resolved", () => {
		expect(
			resolveDroppedFilePath(fakeFile("rec.jsonl"), fakeDataTransfer({}), null),
		).toBe("")
		expect(resolveDroppedFilePath(fakeFile("rec.jsonl"), null, null)).toBe("")
	})
})
