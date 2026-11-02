import { describe, expect, it } from "vitest"
import { isNewerVersion, findMatchingAsset } from "../updater.js"

describe("Updater logic", () => {
	it("correctly compares semantic versions", () => {
		expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true)
		expect(isNewerVersion("v1.1.0", "1.0.0")).toBe(true)
		expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true)
		expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false)
		expect(isNewerVersion("v1.0.0", "1.0.0")).toBe(false)
		expect(isNewerVersion("0.9.9", "1.0.0")).toBe(false)
		expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false)
	})

	it("finds matching macOS arm64 dmg asset", () => {
		const assets = [
			{
				name: "my-agent-1.0.1-mac-x64.dmg",
				browser_download_url:
					"https://github.com/.../my-agent-1.0.1-mac-x64.dmg",
				size: 1000,
			},
			{
				name: "my-agent-1.0.1-mac-arm64.dmg",
				browser_download_url:
					"https://github.com/.../my-agent-1.0.1-mac-arm64.dmg",
				size: 1000,
			},
			{
				name: "my-agent-1.0.1-setup.exe",
				browser_download_url: "https://github.com/.../my-agent-1.0.1-setup.exe",
				size: 1000,
			},
		]

		const macArm = findMatchingAsset(assets, "darwin", "arm64")
		expect(macArm?.fileName).toBe("my-agent-1.0.1-mac-arm64.dmg")

		const macX64 = findMatchingAsset(assets, "darwin", "x64")
		expect(macX64?.fileName).toBe("my-agent-1.0.1-mac-x64.dmg")

		const win = findMatchingAsset(assets, "win32", "x64")
		expect(win?.fileName).toBe("my-agent-1.0.1-setup.exe")
	})

	it("falls back to zip if dmg is not present", () => {
		const assets = [
			{
				name: "my-agent-1.0.1-mac-arm64.zip",
				browser_download_url:
					"https://github.com/.../my-agent-1.0.1-mac-arm64.zip",
				size: 1000,
			},
		]
		const macArm = findMatchingAsset(assets, "darwin", "arm64")
		expect(macArm?.fileName).toBe("my-agent-1.0.1-mac-arm64.zip")
	})
})
