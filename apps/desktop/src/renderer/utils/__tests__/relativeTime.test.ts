import { describe, expect, it } from "vitest"
import { formatRelativeTime } from "../relativeTime"

const now = new Date("2026-10-30T10:00:00Z").getTime()
const ago = (ms: number) => new Date(now - ms).toISOString()

describe("formatRelativeTime", () => {
	it("returns an empty string when there is no timestamp", () => {
		expect(formatRelativeTime(undefined, now)).toBe("")
		expect(formatRelativeTime(null, now)).toBe("")
		expect(formatRelativeTime("", now)).toBe("")
		expect(formatRelativeTime("not-a-date", now)).toBe("")
	})

	it("collapses anything under a minute to 'now'", () => {
		expect(formatRelativeTime(ago(0), now)).toBe("now")
		expect(formatRelativeTime(ago(59_000), now)).toBe("now")
	})

	it("uses m / h / d / w / mo / y buckets", () => {
		expect(formatRelativeTime(ago(60_000), now)).toBe("1m")
		expect(formatRelativeTime(ago(59 * 60_000), now)).toBe("59m")
		expect(formatRelativeTime(ago(2 * 3_600_000), now)).toBe("2h")
		expect(formatRelativeTime(ago(23 * 3_600_000), now)).toBe("23h")
		expect(formatRelativeTime(ago(3 * 86_400_000), now)).toBe("3d")
		expect(formatRelativeTime(ago(6 * 86_400_000), now)).toBe("6d")
		expect(formatRelativeTime(ago(8 * 86_400_000), now)).toBe("1w")
		expect(formatRelativeTime(ago(40 * 86_400_000), now)).toBe("1mo")
		expect(formatRelativeTime(ago(400 * 86_400_000), now)).toBe("1y")
	})

	it("never goes negative for future timestamps", () => {
		expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe(
			"now",
		)
	})

	it("accepts epoch millis and Date instances", () => {
		expect(formatRelativeTime(now - 120_000, now)).toBe("2m")
		expect(formatRelativeTime(new Date(now - 7_200_000), now)).toBe("2h")
	})
})
