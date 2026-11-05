import { describe, expect, it } from "vitest"
import {
	BLANK_PAGE,
	activateBrowserTab,
	activeBrowserTab,
	closeBrowserTab,
	createBrowserTabs,
	followAgentPage,
	navigateBrowserTab,
	normalizeBrowserUrl,
	openBrowserTab,
	setBrowserTabFollow,
	setBrowserTabTitle,
	setBrowserTabUrl,
	showBrowserUrl,
} from "../browserTabs"

const agentUrl = "https://example.com/login"

describe("createBrowserTabs", () => {
	it("starts on the page the agent is on, following it", () => {
		const state = createBrowserTabs(agentUrl)
		expect(state.tabs).toHaveLength(1)
		expect(state.tabs[0].url).toBe(agentUrl)
		expect(state.tabs[0].followAgent).toBe(true)
		expect(state.activeId).toBe(state.tabs[0].id)
	})

	it("opens a blank tab when the agent has not browsed yet, still following", () => {
		const state = createBrowserTabs("")
		expect(state.tabs[0].url).toBe(BLANK_PAGE)
		// The panel usually opens before the agent navigates: that first tab has
		// to pick the page up when it arrives.
		expect(state.tabs[0].followAgent).toBe(true)
	})
})

describe("tab list", () => {
	it("adds a tab and focuses it", () => {
		const state = openBrowserTab(createBrowserTabs(agentUrl))
		expect(state.tabs).toHaveLength(2)
		expect(state.activeId).toBe(state.tabs[1].id)
		expect(state.tabs[1].followAgent).toBe(false)
	})

	it("activates an existing tab only", () => {
		const first = createBrowserTabs(agentUrl)
		const both = openBrowserTab(first)
		expect(activateBrowserTab(both, first.activeId).activeId).toBe(
			first.activeId,
		)
		expect(activateBrowserTab(both, "nope")).toBe(both)
	})

	it("closes a tab and lands on its neighbour", () => {
		const first = createBrowserTabs(agentUrl)
		const both = openBrowserTab(first)
		const closed = closeBrowserTab(both, both.activeId)
		expect(closed.tabs).toHaveLength(1)
		expect(closed.activeId).toBe(first.activeId)
	})

	it("never leaves the browser without a tab", () => {
		const state = createBrowserTabs(agentUrl)
		const closed = closeBrowserTab(state, state.activeId)
		expect(closed.tabs).toHaveLength(1)
		expect(closed.tabs[0].url).toBe(BLANK_PAGE)
		expect(closed.tabs[0].followAgent).toBe(false)
		expect(closed.activeId).toBe(closed.tabs[0].id)
	})

	it("ignores closing an unknown tab", () => {
		const state = createBrowserTabs(agentUrl)
		expect(closeBrowserTab(state, "nope")).toBe(state)
	})

	it("reports the active tab, falling back to the first", () => {
		const state = createBrowserTabs(agentUrl)
		expect(activeBrowserTab(state)?.id).toBe(state.activeId)
		expect(activeBrowserTab({ ...state, activeId: "gone" })?.id).toBe(
			state.tabs[0].id,
		)
	})
})

describe("navigation", () => {
	it("navigating a tab stops it from following the agent", () => {
		const state = createBrowserTabs(agentUrl)
		const next = navigateBrowserTab(state, state.activeId, "docs.example.org")
		expect(next.tabs[0].url).toBe("https://docs.example.org")
		expect(next.tabs[0].followAgent).toBe(false)
		// A typed address replaces the old page: its title no longer applies.
		expect(next.tabs[0].title).toBe("")
	})

	it("normalises address bar input", () => {
		expect(normalizeBrowserUrl("example.com")).toBe("https://example.com")
		expect(normalizeBrowserUrl("https://a.b/c")).toBe("https://a.b/c")
		expect(normalizeBrowserUrl("localhost:5173")).toBe("http://localhost:5173")
		expect(normalizeBrowserUrl("about:blank")).toBe("about:blank")
		expect(normalizeBrowserUrl("  ")).toBe("")
	})

	it("ignores an empty address", () => {
		const state = createBrowserTabs(agentUrl)
		expect(navigateBrowserTab(state, state.activeId, "   ")).toBe(state)
	})

	it("a page-reported url keeps the following flag untouched", () => {
		const state = createBrowserTabs(agentUrl)
		const next = setBrowserTabUrl(
			state,
			state.activeId,
			"https://example.com/home",
		)
		expect(next.tabs[0].url).toBe("https://example.com/home")
		expect(next.tabs[0].followAgent).toBe(true)
	})

	it("keeps identity when nothing changed", () => {
		const state = createBrowserTabs(agentUrl)
		expect(setBrowserTabUrl(state, state.activeId, agentUrl)).toBe(state)
		expect(setBrowserTabTitle(state, state.activeId, "")).toBe(state)
		expect(setBrowserTabFollow(state, state.activeId, true)).toBe(state)
	})

	it("records page titles", () => {
		const state = createBrowserTabs(agentUrl)
		const next = setBrowserTabTitle(state, state.activeId, "Sign in")
		expect(next.tabs[0].title).toBe("Sign in")
	})
})

describe("followAgentPage", () => {
	it("moves following tabs to the agent's new page", () => {
		const state = createBrowserTabs(agentUrl)
		const next = followAgentPage(state, "https://example.com/step-2")
		expect(next.tabs[0].url).toBe("https://example.com/step-2")
	})

	it("leaves tabs the user took over alone", () => {
		const state = createBrowserTabs(agentUrl)
		const taken = navigateBrowserTab(state, state.activeId, "https://mine.test")
		expect(followAgentPage(taken, "https://example.com/step-2")).toBe(taken)
	})

	it("ignores an empty agent url", () => {
		const state = createBrowserTabs(agentUrl)
		expect(followAgentPage(state, "")).toBe(state)
	})

	it("only touches following tabs in a multi-tab browser", () => {
		const first = createBrowserTabs(agentUrl)
		// A tab the user opened by hand does not follow the agent.
		const both = openBrowserTab(first, "https://docs.test")
		const next = followAgentPage(both, "https://example.com/step-2")
		expect(next.tabs[0].url).toBe("https://example.com/step-2")
		expect(next.tabs[1].url).toBe("https://docs.test")
	})
})

describe("showBrowserUrl", () => {
	// "Open in browser panel" from a preview card: show the page here, without
	// stacking a duplicate of a tab the panel already has.
	it("takes over the agent's tab instead of opening a second one", () => {
		const state = createBrowserTabs(agentUrl)
		const next = showBrowserUrl(state, agentUrl)
		expect(next.tabs).toHaveLength(1)
		// The user navigated, so the agent no longer drags the tab along.
		expect(next.tabs[0].followAgent).toBe(false)
	})

	it("takes over an empty tab", () => {
		const state = createBrowserTabs("")
		const next = showBrowserUrl(state, "https://msn.com/weather")
		expect(next.tabs).toHaveLength(1)
		expect(next.tabs[0].url).toBe("https://msn.com/weather")
	})

	it("focuses a tab that already shows the page", () => {
		const first = createBrowserTabs(agentUrl)
		const both = openBrowserTab(first)
		const next = showBrowserUrl(both, agentUrl)
		expect(next.tabs).toHaveLength(2)
		expect(next.activeId).toBe(first.activeId)
	})

	it("opens a new tab rather than replacing the user's own page", () => {
		const state = createBrowserTabs(agentUrl)
		const mine = navigateBrowserTab(state, state.activeId, "https://mine.test")
		const next = showBrowserUrl(mine, "https://msn.com/weather")
		expect(next.tabs).toHaveLength(2)
		expect(next.tabs[0].url).toBe("https://mine.test")
		expect(next.tabs[1].url).toBe("https://msn.com/weather")
		expect(next.activeId).toBe(next.tabs[1].id)
	})

	it("ignores an empty request", () => {
		const state = createBrowserTabs(agentUrl)
		expect(showBrowserUrl(state, "  ")).toBe(state)
	})
})
