import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
	sanitizeModelUseCounts,
	loadSettings,
	saveSettings,
} from "../settings.js"

describe("modelUseCounts sanitization and persistence", () => {
	let tempDir: string
	let tempSettingsPath: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-test-"))
		tempSettingsPath = path.join(tempDir, "settings.json")
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {
			// ignore cleanup error
		}
	})

	it("sanitizeModelUseCounts filters out [object Object], undefined, null, and empty keys", () => {
		const raw = {
			"[object Object]": 5,
			undefined: 2,
			null: 1,
			"": 3,
			"   ": 4,
			"google/gemini-2.0-flash": 10,
			"deepseek/deepseek-chat": 4.8,
			invalidNum: "not-a-number",
			negative: -2,
			zero: 0,
		}
		const cleaned = sanitizeModelUseCounts(raw as any)
		expect(cleaned).toEqual({
			"google/gemini-2.0-flash": 10,
			"deepseek/deepseek-chat": 4,
		})
	})

	it("sanitizeModelUseCounts safely handles non-object inputs", () => {
		expect(sanitizeModelUseCounts(null)).toEqual({})
		expect(sanitizeModelUseCounts(undefined)).toEqual({})
		expect(sanitizeModelUseCounts([] as any)).toEqual({})
		expect(sanitizeModelUseCounts("some string" as any)).toEqual({})
	})

	it("loadSettings automatically removes [object Object] from settings.json", () => {
		fs.writeFileSync(
			tempSettingsPath,
			JSON.stringify({
				modelUseCounts: {
					"google/gemini-3.8-flash": 364,
					"[object Object]": 5,
					"deepseek/deepseek-chat": 9,
				},
			}),
			"utf-8",
		)

		const loaded = loadSettings(tempSettingsPath)
		expect(loaded.modelUseCounts).toEqual({
			"google/gemini-3.8-flash": 364,
			"deepseek/deepseek-chat": 9,
		})
		expect(loaded.modelUseCounts["[object Object]"]).toBeUndefined()
	})

	it("saveSettings sanitizes modelUseCounts before saving to disk", () => {
		const initialSettings = loadSettings(tempSettingsPath)
		;(initialSettings.modelUseCounts as any)["[object Object]"] = 12
		;(initialSettings.modelUseCounts as any)["openai/o3-mini"] = 7

		saveSettings(initialSettings, tempSettingsPath)

		const rawOnDisk = JSON.parse(fs.readFileSync(tempSettingsPath, "utf-8"))
		expect(rawOnDisk.modelUseCounts).toEqual({
			"openai/o3-mini": 7,
		})
		expect(rawOnDisk.modelUseCounts["[object Object]"]).toBeUndefined()
	})
})
