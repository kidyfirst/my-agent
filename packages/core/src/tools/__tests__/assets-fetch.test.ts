import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createAssetsFetchTool } from "../assets-fetch.js"
import { AssetManager } from "../../assets/manager.js"

describe("createAssetsFetchTool", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "myagent-asset-fetch-test-"),
		)
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("returns image data when asset exists", async () => {
		const meta = await AssetManager.saveAsset(
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
			{
				filename: "test.png",
				projectRoot: tempDir,
			},
		)

		const tool = createAssetsFetchTool(tempDir)
		const res = await tool.execute({ assetId: meta.assetId }, {} as any)

		expect(res.success).toBe(true)
		expect(res.assetId).toBe(meta.assetId)
		expect(res.data).toContain("data:image/png;base64,")
	})

	it("returns text content for text assets", async () => {
		const meta = await AssetManager.saveAsset(
			Buffer.from("Hello from test asset"),
			{
				filename: "notes.txt",
				mimeType: "text/plain",
				projectRoot: tempDir,
			},
		)

		const tool = createAssetsFetchTool(tempDir)
		const res = await tool.execute({ assetId: meta.assetId }, {} as any)

		expect(res.success).toBe(true)
		expect(res.content).toBe("Hello from test asset")
	})

	it("returns error message when asset does not exist", async () => {
		const tool = createAssetsFetchTool(tempDir)
		const res = await tool.execute({ assetId: "missing_asset" }, {} as any)

		expect(res.success).toBe(false)
		expect(res.error).toContain("was not found on disk")
	})
})
