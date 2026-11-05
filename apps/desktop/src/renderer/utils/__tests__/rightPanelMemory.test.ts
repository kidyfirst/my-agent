import { describe, expect, it } from "vitest"
import {
	defaultRightPanelState,
	recallRightPanel,
	rememberRightPanel,
	type RightPanelState,
} from "../rightPanelMemory"
import {
	createRightSidebarTabs,
	openRightSidebarTab,
} from "../rightSidebarTabs"

const withTabs = (...tabs: Array<"files" | "terminal" | "browser">) =>
	tabs.reduce(
		(state, tab) => openRightSidebarTab(state, tab),
		createRightSidebarTabs(),
	)

describe("right panel memory", () => {
	it("hands back exactly what a session left behind", () => {
		const memory = new Map<string, RightPanelState>()
		const state: RightPanelState = { visible: true, tabs: withTabs("files") }
		rememberRightPanel(memory, "t1", state)

		const restored = recallRightPanel(memory, "t1")
		expect(restored?.visible).toBe(true)
		expect(restored?.tabs.open).toEqual(["files"])
		expect(restored?.tabs.active).toBe("files")
	})

	it("keeps sessions apart", () => {
		const memory = new Map<string, RightPanelState>()
		rememberRightPanel(memory, "t1", {
			visible: true,
			tabs: withTabs("files", "terminal"),
		})
		rememberRightPanel(memory, "t2", {
			visible: false,
			tabs: withTabs("browser"),
		})

		expect(recallRightPanel(memory, "t1")?.tabs.open).toEqual([
			"files",
			"terminal",
		])
		expect(recallRightPanel(memory, "t2")?.visible).toBe(false)
	})

	it("tells a never-opened session apart from a closed one", () => {
		const memory = new Map<string, RightPanelState>()
		rememberRightPanel(memory, "closed", {
			visible: false,
			tabs: createRightSidebarTabs(),
		})

		// Closed on purpose: remembered, so it comes back closed.
		expect(recallRightPanel(memory, "closed")?.visible).toBe(false)
		// Never seen: nothing to restore — the caller falls back.
		expect(recallRightPanel(memory, "unseen")).toBeNull()
	})

	it("defaults a never-opened session to no panel at all", () => {
		const state = defaultRightPanelState()
		expect(state.visible).toBe(false)
		expect(state.tabs.open).toEqual([])
		expect(state.tabs.active).toBe("menu")
	})

	it("overwrites a session's state when it is visited again", () => {
		const memory = new Map<string, RightPanelState>()
		rememberRightPanel(memory, "t1", {
			visible: true,
			tabs: withTabs("files"),
		})
		rememberRightPanel(memory, "t1", {
			visible: true,
			tabs: withTabs("files", "browser"),
		})
		expect(recallRightPanel(memory, "t1")?.tabs.open).toEqual([
			"files",
			"browser",
		])
	})
})
