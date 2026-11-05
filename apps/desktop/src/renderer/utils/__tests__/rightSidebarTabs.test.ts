import { describe, expect, it } from "vitest"
import {
	closeRightSidebarTab,
	createRightSidebarTabs,
	openRightSidebarTab,
	overviewActionToTab,
	resolveRightSidebarTab,
	resolveRightSidebarTabs,
	rightSidebarTabLabel,
	visibleRightSidebarTabs,
	type RightSidebarTabsState,
} from "../rightSidebarTabs"

describe("resolveRightSidebarTab", () => {
	it("keeps Git when the project has a repo", () => {
		expect(resolveRightSidebarTab("git", true)).toBe("git")
	})

	it("falls back to Files when Git disappears", () => {
		expect(resolveRightSidebarTab("git", false)).toBe("files")
	})

	it("leaves the other destinations untouched", () => {
		expect(resolveRightSidebarTab("files", false)).toBe("files")
		expect(resolveRightSidebarTab("context", false)).toBe("context")
		expect(resolveRightSidebarTab("browser", false)).toBe("browser")
		expect(resolveRightSidebarTab("terminal", false)).toBe("terminal")
	})

	it("keeps the landing menu even without a repo", () => {
		expect(resolveRightSidebarTab("menu", true)).toBe("menu")
		expect(resolveRightSidebarTab("menu", false)).toBe("menu")
	})
})

describe("rightSidebarTabLabel", () => {
	it("names each destination the way the landing list does", () => {
		expect(rightSidebarTabLabel("files")).toBe("Files")
		expect(rightSidebarTabLabel("git")).toBe("Review")
		expect(rightSidebarTabLabel("browser")).toBe("Browser")
		expect(rightSidebarTabLabel("terminal")).toBe("Terminal")
		expect(rightSidebarTabLabel("menu")).toBe("Overview")
	})
})

describe("overviewActionToTab", () => {
	it("opens Terminal as a real tab instead of the old bottom dock", () => {
		expect(overviewActionToTab("terminal")).toBe("terminal")
	})

	it("maps the remaining rows to their destinations", () => {
		expect(overviewActionToTab("files")).toBe("files")
		expect(overviewActionToTab("review")).toBe("git")
		expect(overviewActionToTab("browser")).toBe("browser")
	})
})

describe("right sidebar tab state", () => {
	it("starts on the landing list with no tabs at all", () => {
		const state = createRightSidebarTabs()
		expect(state.active).toBe("menu")
		expect(state.open).toEqual([])
		expect(visibleRightSidebarTabs(state, true)).toEqual([])
		expect(resolveRightSidebarTabs(state, true)).toBe("menu")
	})

	it("opens several destinations as tabs and keeps their order", () => {
		let state = createRightSidebarTabs()
		state = openRightSidebarTab(state, "files")
		state = openRightSidebarTab(state, "terminal")
		state = openRightSidebarTab(state, "browser")
		expect(state.open).toEqual(["files", "terminal", "browser"])
		expect(state.active).toBe("browser")
		expect(visibleRightSidebarTabs(state, true)).toEqual([
			"files",
			"terminal",
			"browser",
		])
	})

	it("focuses an already open destination instead of duplicating it", () => {
		let state = openRightSidebarTab(createRightSidebarTabs(), "files")
		state = openRightSidebarTab(state, "terminal")
		const focused = openRightSidebarTab(state, "files")
		expect(focused.open).toEqual(["files", "terminal"])
		expect(focused.active).toBe("files")
	})

	it("never turns the Overview landing page into a tab", () => {
		let state = openRightSidebarTab(createRightSidebarTabs(), "files")
		state = openRightSidebarTab(state, "menu")
		expect(state.active).toBe("menu")
		expect(state.open).toEqual(["files"])
		expect(visibleRightSidebarTabs(state, true)).toEqual(["files"])
		// The list still opens (it is the only way to reach Browser), but no
		// tab is highlighted while it is showing.
		expect(resolveRightSidebarTabs(state, true)).toBe("menu")
	})

	it("falls back to a neighbouring tab when the active one closes", () => {
		let state: RightSidebarTabsState = {
			open: ["files", "terminal", "browser"],
			active: "terminal",
		}
		state = closeRightSidebarTab(state, "terminal")
		expect(state.open).toEqual(["files", "browser"])
		expect(state.active).toBe("browser")
	})

	it("falls back to the landing list when the last destination closes", () => {
		let state = openRightSidebarTab(createRightSidebarTabs(), "terminal")
		state = closeRightSidebarTab(state, "terminal")
		expect(state.open).toEqual([])
		expect(state.active).toBe("menu")
	})

	it("keeps the current tab when closing an inactive one", () => {
		const state = closeRightSidebarTab(
			{ open: ["files", "terminal"], active: "terminal" },
			"files",
		)
		expect(state.open).toEqual(["terminal"])
		expect(state.active).toBe("terminal")
	})

	it("adds a tab for a destination a shortcut activates directly", () => {
		const state: RightSidebarTabsState = { open: [], active: "git" }
		expect(visibleRightSidebarTabs(state, true)).toEqual(["git"])
		expect(resolveRightSidebarTabs(state, true)).toBe("git")
	})

	it("drops Review from the strip for a plain folder", () => {
		const state: RightSidebarTabsState = {
			open: ["git", "terminal"],
			active: "git",
		}
		expect(visibleRightSidebarTabs(state, false)).toEqual(["terminal"])
		// Git is gone, so the next open tab takes over instead of an empty pane.
		expect(resolveRightSidebarTabs(state, false)).toBe("terminal")
	})
})
