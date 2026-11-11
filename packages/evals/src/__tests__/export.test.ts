import { describe, it, expect } from "vitest"
import {
	sanitizeTraceText,
	convertTraceToEvalCase,
} from "../export-badcases.js"

describe("export-badcases sanitization", () => {
	it("replaces Chinese phone numbers", () => {
		const raw = "请联系用户 13812345678 或 18998765432"
		const clean = sanitizeTraceText(raw)
		expect(clean).not.toContain("13812345678")
		expect(clean).toContain("13800000000")
	})

	it("replaces email addresses", () => {
		const raw = "发送邮件给 alice.smith@mycompany.org 确认"
		const clean = sanitizeTraceText(raw)
		expect(clean).not.toContain("alice.smith@mycompany.org")
		expect(clean).toContain("user@example.com")
	})

	it("redacts API keys and bearer tokens", () => {
		const raw =
			"API token is sk-1234567890abcdef1234567890 and Bearer eyJhbGciOi..."
		const clean = sanitizeTraceText(raw)
		expect(clean).not.toContain("sk-1234567890abcdef1234567890")
		expect(clean).toContain("sk-********************")
		expect(clean).toContain("Bearer [REDACTED_TOKEN]")
	})

	it("anonymizes home directory paths", () => {
		const raw = "File saved at /Users/john_doe/repo/secret.txt"
		const clean = sanitizeTraceText(raw)
		expect(clean).not.toContain("/Users/john_doe")
		expect(clean).toContain("/Users/developer/repo/secret.txt")
	})

	it("converts a bad trace to an EvalCase with proper defaults", () => {
		const c = convertTraceToEvalCase(
			{
				traceId: "test_trace_1",
				userInput: "用户输入含 13900001111",
				error: "Failed to connect",
				feedback: "thumbs_down",
			},
			0,
		)
		expect(c.id).toBe("bad_test_trace_1")
		expect(c.category).toBe("error_recovery")
		expect(c.input).toContain("13800000000")
		expect(c.max_steps).toBe(4)
	})
})
