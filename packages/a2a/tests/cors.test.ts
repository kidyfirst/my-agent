import { describe, expect, it } from "vitest"
import { getLoopbackOrigin } from "../src/server/cors.js"

describe("getLoopbackOrigin", () => {
	it("echoes loopback origins", () => {
		expect(getLoopbackOrigin("http://localhost:5173")).toBe(
			"http://localhost:5173",
		)
		expect(getLoopbackOrigin("http://127.0.0.1:5173")).toBe(
			"http://127.0.0.1:5173",
		)
		expect(getLoopbackOrigin("http://[::1]:5173")).toBe("http://[::1]:5173")
		expect(getLoopbackOrigin("https://localhost")).toBe("https://localhost")
	})

	it("rejects non-loopback origins", () => {
		expect(getLoopbackOrigin("https://evil.example.com")).toBeUndefined()
		expect(getLoopbackOrigin("http://192.168.1.10:3000")).toBeUndefined()
		expect(getLoopbackOrigin("http://localhost.evil.com")).toBeUndefined()
	})

	it("ignores non-browser clients that send no Origin", () => {
		expect(getLoopbackOrigin(undefined)).toBeUndefined()
	})

	it("rejects malformed origins", () => {
		expect(getLoopbackOrigin("not a url")).toBeUndefined()
	})
})
