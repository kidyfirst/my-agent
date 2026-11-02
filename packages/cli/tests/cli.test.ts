import { describe, it, expect, vi } from "vitest"
import { runCli } from "../src/cli.js"

describe("CLI entrypoint", () => {
	it("prints version on --version", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		await runCli(["--version"])
		expect(logSpy).toHaveBeenCalledWith("my-agent v0.1.3")
		logSpy.mockRestore()
	})

	it("prints help on --help", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		await runCli(["--help"])
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("My Agent CLI"))
		logSpy.mockRestore()
	})

	it("shows status info", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		await runCli(["status"])
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("My Agent Status"),
		)
		logSpy.mockRestore()
	})
})
