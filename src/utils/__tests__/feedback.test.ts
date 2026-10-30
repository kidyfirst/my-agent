import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
	COUNTER_KEYS,
	FEEDBACK_BADGES,
	FEEDBACK_KINDS,
	counterUrl,
	isFeedbackKind,
} from "../feedback"

const here = dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(resolve(here, "../../../README.md"), "utf8")

describe("counterUrl", () => {
	it("addresses one key per button", () => {
		expect(counterUrl("like", "hit")).toBe(
			"https://abacus.jasoncameron.dev/hit/kidyfirst/my-agent-likes",
		)
		expect(counterUrl("dislike", "hit")).toBe(
			"https://abacus.jasoncameron.dev/hit/kidyfirst/my-agent-bad",
		)
	})

	it("separates reading from bumping", () => {
		// README badges read; only a real click may hit.
		expect(counterUrl("like", "get")).toContain("/get/kidyfirst/my-agent-likes")
		expect(counterUrl("like", "get")).not.toContain("/hit/")
	})
})

describe("isFeedbackKind", () => {
	it("accepts exactly the two buttons", () => {
		expect(FEEDBACK_KINDS.filter(isFeedbackKind)).toEqual(["like", "dislike"])
	})

	it("rejects anything else the renderer might send", () => {
		for (const value of [undefined, null, "", "Like", "up", 1, {}]) {
			expect(isFeedbackKind(value)).toBe(false)
		}
	})
})

describe("README badges", () => {
	it("shows both counters as images", () => {
		for (const kind of FEEDBACK_KINDS) {
			expect(readme).toContain(FEEDBACK_BADGES[kind])
		}
	})

	it("renders them as markdown images, not links or raw URLs", () => {
		expect(readme).toContain("![Helpful](")
		expect(readme).toContain("![Bad response](")
	})

	it("keeps the badge keys in sync with the counter keys", () => {
		for (const kind of FEEDBACK_KINDS) {
			expect(FEEDBACK_BADGES[kind]).toContain(
				encodeURIComponent(`kidyfirst/${COUNTER_KEYS[kind]}`),
			)
		}
	})
})
