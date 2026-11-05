/**
 * Tabs of the browser embedded in the right sidebar.
 *
 * The panel itself has no tabs any more — this is the *browser's* tab model.
 * Every tab is a real page view; the first one follows the page the agent is
 * driving until the user navigates it somewhere else.
 *
 * Pure functions with identity-preserving updates: React can compare by
 * reference, and every transition is testable without a DOM.
 */

export const BLANK_PAGE = "about:blank"

export interface BrowserTab {
	id: string
	url: string
	title: string
	/**
	 * True while this tab mirrors the page the agent is on. Any navigation the
	 * user starts clears it, so the panel never yanks a page out from under them.
	 */
	followAgent: boolean
}

export interface BrowserTabsState {
	tabs: BrowserTab[]
	activeId: string
}

let sequence = 0

function nextTabId(): string {
	sequence += 1
	return `panel-tab-${sequence}`
}

function makeTab(url: string, followAgent: boolean): BrowserTab {
	return { id: nextTabId(), url: url || BLANK_PAGE, title: "", followAgent }
}

/**
 * A browser always has one tab — even before the agent has opened a page, so
 * the address bar is usable from the start.
 */
export function createBrowserTabs(
	agentUrl?: string | null,
	followAgent = true,
): BrowserTabsState {
	const url = agentUrl ? normalizeBrowserUrl(agentUrl) : ""
	// Even a blank first tab follows the agent: it is the agent's tab, and the
	// agent usually has not opened a page yet when the panel is first shown.
	const tab = makeTab(url, followAgent)
	return { tabs: [tab], activeId: tab.id }
}

export function openBrowserTab(
	state: BrowserTabsState,
	url: string = BLANK_PAGE,
	followAgent = false,
): BrowserTabsState {
	const tab = makeTab(url, followAgent)
	return { tabs: [...state.tabs, tab], activeId: tab.id }
}

/** Closing the last tab leaves a blank one: a browser is never tab-less. */
export function closeBrowserTab(
	state: BrowserTabsState,
	id: string,
): BrowserTabsState {
	const index = state.tabs.findIndex((tab) => tab.id === id)
	if (index < 0) return state

	const remaining = state.tabs.filter((tab) => tab.id !== id)
	// A fresh blank tab the user did not ask for must not chase the agent.
	if (remaining.length === 0) return createBrowserTabs(null, false)

	const activeId =
		state.activeId === id
			? remaining[Math.min(index, remaining.length - 1)].id
			: state.activeId
	return { tabs: remaining, activeId }
}

export function activateBrowserTab(
	state: BrowserTabsState,
	id: string,
): BrowserTabsState {
	if (state.activeId === id) return state
	if (!state.tabs.some((tab) => tab.id === id)) return state
	return { ...state, activeId: id }
}

/** The user typed an address: it lands in that tab and stops following. */
export function navigateBrowserTab(
	state: BrowserTabsState,
	id: string,
	input: string,
	followAgent = false,
): BrowserTabsState {
	const url = normalizeBrowserUrl(input)
	if (!url) return state
	return patchTab(state, id, (tab) =>
		tab.url === url && tab.followAgent === followAgent
			? tab
			: { ...tab, url, title: "", followAgent },
	)
}

/**
 * Bring the panel to a page the user asked for from elsewhere in the app
 * (a browser-preview card, say).
 *
 * Never duplicates a page that is already open, and prefers taking over the
 * agent's tab over adding one: the point of the request is "show me this page
 * here", not "give me another tab". A tab the user has navigated themselves is
 * left alone — a new tab is the only thing that cannot lose their work.
 */
export function showBrowserUrl(
	state: BrowserTabsState,
	input: string,
): BrowserTabsState {
	const url = normalizeBrowserUrl(input)
	if (!url) return state

	const existing = state.tabs.find((tab) => tab.url === url)
	if (existing) {
		// Showing the page already open still means the user took it over: a
		// tab that keeps following would leave on the agent's next click.
		const next = existing.followAgent
			? patchTab(state, existing.id, (tab) => ({ ...tab, followAgent: false }))
			: state
		return next.activeId === existing.id
			? next
			: { ...next, activeId: existing.id }
	}

	const active = activeBrowserTab(state)
	if (active && (active.url === BLANK_PAGE || active.followAgent)) {
		return navigateBrowserTab(state, active.id, url)
	}
	return openBrowserTab(state, url)
}

/**
 * The page reported a new address (redirect, in-page navigation, link click).
 * Only the URL changes — whether the tab still follows the agent is a user
 * decision, not a page's.
 */
export function setBrowserTabUrl(
	state: BrowserTabsState,
	id: string,
	url: string,
): BrowserTabsState {
	const next = normalizeBrowserUrl(url)
	if (!next) return state
	return patchTab(state, id, (tab) =>
		tab.url === next ? tab : { ...tab, url: next },
	)
}

export function setBrowserTabTitle(
	state: BrowserTabsState,
	id: string,
	title: string,
): BrowserTabsState {
	return patchTab(state, id, (tab) =>
		tab.title === title ? tab : { ...tab, title },
	)
}

export function setBrowserTabFollow(
	state: BrowserTabsState,
	id: string,
	followAgent: boolean,
): BrowserTabsState {
	return patchTab(state, id, (tab) =>
		tab.followAgent === followAgent ? tab : { ...tab, followAgent },
	)
}

/** The agent moved to another page: every following tab goes with it. */
export function followAgentPage(
	state: BrowserTabsState,
	agentUrl: string,
): BrowserTabsState {
	const url = normalizeBrowserUrl(agentUrl)
	if (!url) return state
	let changed = false
	const tabs = state.tabs.map((tab) => {
		if (!tab.followAgent || tab.url === url) return tab
		changed = true
		return { ...tab, url }
	})
	return changed ? { ...state, tabs } : state
}

export function activeBrowserTab(
	state: BrowserTabsState,
): BrowserTab | undefined {
	return state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0]
}

/**
 * Address-bar friendly input: bare hosts get https, loopback gets http, and
 * anything already carrying a web scheme is left alone.
 */
export function normalizeBrowserUrl(input: string): string {
	const trimmed = (input ?? "").trim()
	if (!trimmed) return ""
	if (/^(https?|file|data|about):/i.test(trimmed)) return trimmed
	if (
		/^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|\[::1\])(:\d+)?([/?#]|$)/i.test(
			trimmed,
		)
	) {
		return `http://${trimmed}`
	}
	return `https://${trimmed}`
}

function patchTab(
	state: BrowserTabsState,
	id: string,
	patch: (tab: BrowserTab) => BrowserTab,
): BrowserTabsState {
	const index = state.tabs.findIndex((tab) => tab.id === id)
	if (index < 0) return state
	const current = state.tabs[index]
	const next = patch(current)
	if (next === current) return state
	const tabs = state.tabs.slice()
	tabs[index] = next
	return { ...state, tabs }
}
