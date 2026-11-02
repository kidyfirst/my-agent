import { describe, expect, it } from "vitest"
import { resolveRightSidebarTab, rightSidebarTabs } from "../rightSidebarTabs"

describe("rightSidebarTabs", () => {
	it("lists Files, Git and Context for a git repo", () => {
		expect(rightSidebarTabs(true).map((t) => t.id)).toEqual([
			"files",
			"git",
			"context",
		])
	})

	it("drops the Git tab for a plain folder", () => {
		const ids = rightSidebarTabs(false).map((t) => t.id)
		expect(ids).toEqual(["files", "context"])
		expect(ids).not.toContain("git")
	})

	it("keeps the tab order stable so the strip does not reshuffle", () => {
		expect(rightSidebarTabs(true)[0].id).toBe("files")
		expect(rightSidebarTabs(false)[0].id).toBe("files")
	})
})

describe("resolveRightSidebarTab", () => {
	it("keeps Git when the project has a repo", () => {
		expect(resolveRightSidebarTab("git", true)).toBe("git")
	})

	it("falls back to Files when Git disappears", () => {
		expect(resolveRightSidebarTab("git", false)).toBe("files")
	})

	it("leaves the other tabs untouched", () => {
		expect(resolveRightSidebarTab("files", false)).toBe("files")
		expect(resolveRightSidebarTab("context", false)).toBe("context")
	})
})
