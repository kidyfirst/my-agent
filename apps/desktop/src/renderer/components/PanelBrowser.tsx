import { useCallback, useEffect, useRef, useState } from "react"
import { useBrowserPreviewFrames } from "../hooks/useComputerUsePreview"
import {
	BLANK_PAGE,
	activateBrowserTab,
	activeBrowserTab,
	closeBrowserTab,
	createBrowserTabs,
	followAgentPage,
	navigateBrowserTab,
	openBrowserTab,
	setBrowserTabFollow,
	setBrowserTabTitle,
	setBrowserTabUrl,
	showBrowserUrl,
	type BrowserTab,
	type BrowserTabsState,
} from "../utils/browserTabs"

/**
 * The subset of Electron's `<webview>` element this panel uses. Declared
 * locally because the renderer has no DOM typings for the custom element.
 */
interface WebviewElement extends HTMLElement {
	src: string
	loadURL(url: string): Promise<void>
	reload(): void
	stop(): void
	goBack(): void
	goForward(): void
	canGoBack(): boolean
	canGoForward(): boolean
	getURL(): string
}

interface PanelBrowserProps {
	worktreePath: string | null
	/**
	 * A page some other surface asked for (the browser-preview card's open
	 * button, say). `seq` makes a repeated request for the same url act again.
	 */
	openRequest?: { url: string; seq: number } | null
}

/**
 * A real browser, embedded in the right sidebar.
 *
 * Screenshots could only ever show what the agent did; this is a live page the
 * user can scroll, click and type in — with its own tab strip, because tabs are
 * a property of a browser, not of the panel that happens to host it.
 *
 * Each tab is one `<webview>` kept mounted while the panel is open, so switching
 * tabs preserves scroll position and form state instead of reloading.
 */
export function PanelBrowser({ worktreePath, openRequest }: PanelBrowserProps) {
	const preview = useBrowserPreviewFrames(worktreePath)
	const agentUrl = preview.frame?.url ?? ""

	const [state, setState] = useState<BrowserTabsState>(() =>
		createBrowserTabs(agentUrl),
	)
	const active = activeBrowserTab(state)
	const activeId = active?.id ?? ""
	const activeUrl = active?.url ?? ""

	const containerRef = useRef<HTMLDivElement>(null)
	const viewsRef = useRef(new Map<string, WebviewElement>())
	// What each view was last told to load: the panel state also changes for
	// titles and tab focus, and re-issuing loadURL for those would reload pages.
	const loadedRef = useRef(new Map<string, string>())
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId

	const [address, setAddress] = useState(
		activeUrl === BLANK_PAGE ? "" : activeUrl,
	)
	const [loadingId, setLoadingId] = useState<string | null>(null)
	const [history, setHistory] = useState({ back: false, forward: false })

	// The agent's page is the starting point; it keeps driving the tab until the
	// user takes over.
	useEffect(() => {
		if (!agentUrl) return
		setState((current) => followAgentPage(current, agentUrl))
	}, [agentUrl])

	// A page requested from elsewhere in the app. Reusing the agent's tab keeps
	// this from stacking identical tabs when the card points at the page the
	// agent is already on.
	const requestedUrl = openRequest?.url ?? ""
	const requestSeq = openRequest?.seq ?? 0
	useEffect(() => {
		if (!requestedUrl) return
		setState((current) => showBrowserUrl(current, requestedUrl))
	}, [requestSeq, requestedUrl])

	// A blank page is not worth showing in the bar — the placeholder says more.
	useEffect(() => {
		setAddress(activeUrl === BLANK_PAGE ? "" : activeUrl)
	}, [activeUrl])

	const refreshHistory = useCallback(() => {
		const view = viewsRef.current.get(activeIdRef.current)
		setHistory({
			back: view ? safely(() => view.canGoBack(), false) : false,
			forward: view ? safely(() => view.canGoForward(), false) : false,
		})
	}, [])

	// Create, hide and retire the page views to match the tab list.
	useEffect(() => {
		const container = containerRef.current
		if (!container) return
		const views = viewsRef.current
		const live = new Set(state.tabs.map((tab) => tab.id))

		for (const [id, view] of views) {
			if (live.has(id)) continue
			view.remove()
			views.delete(id)
			loadedRef.current.delete(id)
		}

		for (const tab of state.tabs) {
			let view = views.get(tab.id)
			if (!view) {
				view = createWebview()
				views.set(tab.id, view)
				container.appendChild(view)
				attachEvents(tab.id, view)
				loadedRef.current.set(tab.id, tab.url)
				view.src = tab.url || BLANK_PAGE
			} else if (loadedRef.current.get(tab.id) !== tab.url) {
				loadedRef.current.set(tab.id, tab.url)
				try {
					void view.loadURL(tab.url || BLANK_PAGE).catch(() => {})
				} catch {
					// The guest is not ready yet; the next change retries.
					loadedRef.current.delete(tab.id)
				}
			}
			// Hidden tabs are still laid out: a webview collapsed to zero size
			// comes back blank, so the guest keeps its box and only loses paint.
			view.style.visibility = tab.id === state.activeId ? "visible" : "hidden"
			view.style.pointerEvents = tab.id === state.activeId ? "auto" : "none"
		}

		refreshHistory()
	}, [state, refreshHistory])

	function attachEvents(id: string, view: WebviewElement) {
		// The guest's DOM events are Electron-specific; the element's own event
		// map does not know about them.
		const page = view as unknown as {
			addEventListener(type: string, listener: (event: any) => void): void
		}
		page.addEventListener("did-navigate", (event) => {
			commit((current) => setBrowserTabUrl(current, id, event.url))
			refreshHistory()
		})
		page.addEventListener("did-navigate-in-page", (event) => {
			// Sub-frames fire too; only the top document owns the address bar.
			if (event.isMainFrame === false) return
			commit((current) => setBrowserTabUrl(current, id, event.url))
			refreshHistory()
		})
		// A navigation the page or the user started — not one we issued.
		page.addEventListener("will-navigate", () => {
			commit((current) => setBrowserTabFollow(current, id, false))
		})
		page.addEventListener("page-title-updated", (event) => {
			commit((current) =>
				setBrowserTabTitle(current, id, String(event.title ?? "")),
			)
		})
		page.addEventListener("did-start-loading", () => setLoadingId(id))
		page.addEventListener("did-stop-loading", () => {
			setLoadingId((current) => (current === id ? null : current))
			refreshHistory()
		})
	}

	// Pages outlive renders, not the panel: dropping the panel closes them.
	useEffect(
		() => () => {
			for (const view of viewsRef.current.values()) view.remove()
			viewsRef.current.clear()
			loadedRef.current.clear()
		},
		[],
	)

	// Every tab transition is a pure function of the previous state, so the
	// updater form keeps long-lived page listeners off stale snapshots.
	const commit = useCallback(
		(update: (current: BrowserTabsState) => BrowserTabsState) => {
			setState(update)
		},
		[],
	)

	const go = useCallback(
		(input: string) => {
			if (!activeId) return
			commit((current) => navigateBrowserTab(current, activeId, input))
		},
		[activeId, commit],
	)

	const viewOfActive = () => viewsRef.current.get(activeId)

	const openExternal = () => {
		if (!/^https?:/i.test(activeUrl)) return
		void window.api.invoke({ type: "openExternal", url: activeUrl })
	}

	return (
		<div
			data-testid="panel-browser"
			style={{
				flex: 1,
				minWidth: 0,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-surface)",
			}}
		>
			{/* Tab strip: the browser's own tabs, not the panel's */}
			<div
				className="titlebar-drag"
				style={{
					height: 34,
					flexShrink: 0,
					boxSizing: "border-box",
					display: "flex",
					alignItems: "center",
					gap: 2,
					padding: "0 4px",
					borderBottom: "1px solid var(--border-muted)",
					background: "var(--bg-surface)",
				}}
			>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						alignItems: "center",
						gap: 2,
						overflowX: "auto",
					}}
				>
					{state.tabs.map((tab) => (
						<TabChip
							key={tab.id}
							tab={tab}
							active={tab.id === state.activeId}
							loading={loadingId === tab.id}
							onActivate={() =>
								commit((current) => activateBrowserTab(current, tab.id))
							}
							onClose={() =>
								commit((current) => closeBrowserTab(current, tab.id))
							}
						/>
					))}
				</div>
				<ChromeButton
					label="New browser tab"
					icon="plus"
					onClick={() => commit((current) => openBrowserTab(current))}
				/>
			</div>

			{/* Address bar */}
			<div
				style={{
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					gap: 2,
					padding: "4px 6px",
					borderBottom: "1px solid var(--border-muted)",
					background: "var(--bg-surface)",
				}}
			>
				<ChromeButton
					label="Back"
					icon="back"
					disabled={!history.back}
					onClick={() => safely(() => viewOfActive()?.goBack(), undefined)}
				/>
				<ChromeButton
					label="Forward"
					icon="forward"
					disabled={!history.forward}
					onClick={() => safely(() => viewOfActive()?.goForward(), undefined)}
				/>
				<ChromeButton
					label="Reload"
					icon="reload"
					onClick={() => safely(() => viewOfActive()?.reload(), undefined)}
				/>
				<input
					value={address}
					onChange={(event) => setAddress(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter") return
						event.preventDefault()
						go(address)
					}}
					spellCheck={false}
					placeholder="Enter an address"
					aria-label="Address"
					style={{
						flex: 1,
						minWidth: 0,
						height: 24,
						padding: "0 8px",
						borderRadius: 6,
						border: "1px solid var(--border)",
						background: "var(--bg)",
						color: "var(--text)",
						fontSize: 12,
						outline: "none",
					}}
				/>
				<ChromeButton
					label="Open in system browser"
					icon="external"
					disabled={!/^https?:/i.test(activeUrl)}
					onClick={openExternal}
				/>
			</div>

			{loadingId === activeId && (
				<div
					style={{
						height: 2,
						flexShrink: 0,
						background: "var(--accent)",
						animation: "panel-browser-loading 1.4s ease-in-out infinite",
					}}
				/>
			)}

			{/* One live page per tab; hidden tabs stay mounted and keep their box. */}
			<div
				ref={containerRef}
				data-testid="panel-browser-views"
				style={{
					flex: 1,
					minHeight: 0,
					position: "relative",
					overflow: "hidden",
					background: "var(--bg)",
				}}
			/>
			<style>{`
				@keyframes panel-browser-loading {
					0% { width: 0%; margin-left: 0; }
					50% { width: 55%; margin-left: 20%; }
					100% { width: 0%; margin-left: 100%; }
				}
			`}</style>
		</div>
	)
}

function createWebview(): WebviewElement {
	const view = document.createElement("webview") as unknown as WebviewElement
	// A persistent partition makes the embedded browser behave like a browser:
	// logins survive tab switches and app restarts.
	view.setAttribute("partition", "persist:panel-browser")
	view.style.cssText =
		"position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg);visibility:hidden"
	return view
}

interface TabChipProps {
	tab: BrowserTab
	active: boolean
	loading: boolean
	onActivate: () => void
	onClose: () => void
}

function TabChip({ tab, active, loading, onActivate, onClose }: TabChipProps) {
	const [hovered, setHovered] = useState(false)
	const label = tab.title || hostOf(tab.url) || "New tab"

	return (
		<div
			// The strip is a window-drag region; without this the chip would
			// swallow its own clicks instead of switching tabs.
			className="titlebar-no-drag"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 4,
				maxWidth: 150,
				minWidth: 0,
				height: 24,
				padding: "0 4px 0 8px",
				borderRadius: 6,
				// Elevated reads as "selected" in both themes: darker than the
				// strip on light, lighter than it on dark.
				background: active ? "var(--bg-elevated)" : "transparent",
				flexShrink: 0,
			}}
		>
			<button
				type="button"
				onClick={onActivate}
				title={tab.url}
				style={{
					border: "none",
					background: "transparent",
					padding: 0,
					minWidth: 0,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					fontSize: 11,
					color: active ? "var(--text)" : "var(--muted)",
					cursor: "pointer",
					textAlign: "left",
				}}
			>
				{loading ? "Loading…" : label}
			</button>
			<button
				type="button"
				aria-label={`Close ${label}`}
				onClick={(event) => {
					event.stopPropagation()
					onClose()
				}}
				style={{
					width: 16,
					height: 16,
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					border: "none",
					borderRadius: 4,
					background: "transparent",
					color: "var(--muted)",
					cursor: "pointer",
					padding: 0,
					opacity: hovered || active ? 1 : 0,
					transition: "opacity 120ms ease-out",
				}}
			>
				<svg
					width="9"
					height="9"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
				>
					<line x1="4" y1="4" x2="12" y2="12" />
					<line x1="12" y1="4" x2="4" y2="12" />
				</svg>
			</button>
		</div>
	)
}

type ChromeIcon = "plus" | "back" | "forward" | "reload" | "external"

interface ChromeButtonProps {
	label: string
	icon: ChromeIcon
	disabled?: boolean
	onClick: () => void
}

function ChromeButton({ label, icon, disabled, onClick }: ChromeButtonProps) {
	return (
		<button
			type="button"
			className="titlebar-no-drag"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			style={{
				width: 24,
				height: 24,
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				border: "none",
				borderRadius: 5,
				background: "transparent",
				color: disabled ? "var(--dim)" : "var(--muted)",
				cursor: disabled ? "default" : "pointer",
				padding: 0,
				opacity: disabled ? 0.6 : 1,
			}}
			onMouseEnter={(event) => {
				if (disabled) return
				event.currentTarget.style.color = "var(--text)"
				event.currentTarget.style.background = "var(--bg-hover)"
			}}
			onMouseLeave={(event) => {
				if (disabled) return
				event.currentTarget.style.color = "var(--muted)"
				event.currentTarget.style.background = "transparent"
			}}
		>
			<ChromeIconSvg icon={icon} />
		</button>
	)
}

function ChromeIconSvg({ icon }: { icon: ChromeIcon }) {
	const common = {
		width: 13,
		height: 13,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.5,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
	}

	if (icon === "plus") {
		return (
			<svg {...common}>
				<line x1="8" y1="3.5" x2="8" y2="12.5" />
				<line x1="3.5" y1="8" x2="12.5" y2="8" />
			</svg>
		)
	}
	if (icon === "back") {
		return (
			<svg {...common}>
				<polyline points="10 3.5 5.5 8 10 12.5" />
			</svg>
		)
	}
	if (icon === "forward") {
		return (
			<svg {...common}>
				<polyline points="6 3.5 10.5 8 6 12.5" />
			</svg>
		)
	}
	if (icon === "reload") {
		return (
			<svg {...common}>
				<path d="M12.5 8a4.5 4.5 0 1 1-1.6-3.4" />
				<polyline points="12.5 3 12.5 5.6 9.9 5.6" />
			</svg>
		)
	}
	return (
		<svg {...common}>
			<path d="M9 3.5h3.5V7" />
			<path d="M12.5 3.5L8.5 7.5" />
			<path d="M11 9.5v2.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1H7" />
		</svg>
	)
}

/** Electron throws from the view's API when the guest is not ready yet. */
function safely<T>(fn: () => T, fallback: T): T {
	try {
		return fn()
	} catch {
		return fallback
	}
}

/** Tab labels fall back to the address: an untitled page still needs a name. */
function hostOf(url: string): string {
	if (!url || url === BLANK_PAGE) return ""
	try {
		const parsed = new URL(url)
		const path = parsed.pathname === "/" ? "" : parsed.pathname
		return `${parsed.host}${path}`
	} catch {
		return url
	}
}
