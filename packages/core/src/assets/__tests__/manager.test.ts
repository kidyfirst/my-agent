import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { AssetManager } from "../manager.js"

describe("AssetManager", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-asset-test-"))
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("saves a base64 image asset and generates metadata", async () => {
		const base64Png =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
		const meta = await AssetManager.saveAsset(base64Png, {
			filename: "pixel.png",
			mimeType: "image/png",
			projectRoot: tempDir,
		})

		expect(meta.assetId).toMatch(/^ast_/)
		expect(meta.filename).toBe("pixel.png")
		expect(meta.mimeType).toBe("image/png")
		expect(meta.url).toBe(`myagent-asset://${meta.assetId}.png`)
		expect(meta.size).toBeGreaterThan(0)

		const resolved = AssetManager.resolveAssetPath(meta.assetId, tempDir)
		expect(resolved).toBeTruthy()
		expect(fs.existsSync(resolved!)).toBe(true)

		const fetched = await AssetManager.getAsset(meta.assetId, tempDir)
		expect(fetched).toBeTruthy()
		expect(fetched?.base64).toBe(base64Png)
		expect(fetched?.mimeType).toBe("image/png")
	})

	it("saves a data URI image and parses mimeType", async () => {
		const dataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
		const meta = await AssetManager.saveAsset(dataUri, {
			projectRoot: tempDir,
		})

		expect(meta.mimeType).toBe("image/jpeg")
		expect(meta.url).toBe(`myagent-asset://${meta.assetId}.jpg`)

		const fetched = await AssetManager.getAsset(meta.assetId, tempDir)
		expect(fetched).toBeTruthy()
		expect(fetched?.mimeType).toBe("image/jpeg")
	})

	it("returns null when asset is not found", async () => {
		const resolved = AssetManager.resolveAssetPath("non_existent_id", tempDir)
		expect(resolved).toBeNull()

		const fetched = await AssetManager.getAsset("non_existent_id", tempDir)
		expect(fetched).toBeNull()
	})

	it("creates .myagent/.gitignore ignoring assets/", async () => {
		await AssetManager.saveAsset("test", {
			projectRoot: tempDir,
			filename: "test.txt",
		})

		const gitignorePath = path.join(tempDir, ".myagent", ".gitignore")
		expect(fs.existsSync(gitignorePath)).toBe(true)
		const content = fs.readFileSync(gitignorePath, "utf-8")
		expect(content).toContain("assets/")
	})
})
