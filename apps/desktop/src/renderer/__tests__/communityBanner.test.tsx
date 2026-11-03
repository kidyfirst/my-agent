import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
	CommunityBanner,
	SharePill,
	labelsFitSidebar,
} from "../components/sidebar/CommunityBanner"
import {
	REPO_URL,
	SHARE_TITLE,
	STAR_TIERS,
	anchoredLeft,
	formatStarCount,
	shareTargets,
} from "../utils/community"

describe("formatStarCount", () => {
	// The banner reports a band, never the exact count: "7 stars" would argue
	// against clicking, and a live number invites watching it instead.
	it("reports the ceiling of the band, not the real number", () => {
		expect(formatStarCount(0)).toBe("99+")
		expect(formatStarCount(7)).toBe("99+")
		expect(formatStarCount(99)).toBe("99+")
		expect(formatStarCount(100)).toBe("999+")
		expect(formatStarCount(999)).toBe("999+")
		expect(formatStarCount(1000)).toBe("1k+")
		expect(formatStarCount(123_456)).toBe("1k+")
	})

	it("ignores values that are not a count", () => {
		expect(formatStarCount(null)).toBeNull()
		expect(formatStarCount(undefined)).toBeNull()
		expect(formatStarCount(Number.NaN)).toBeNull()
		expect(formatStarCount(-1)).toBeNull()
	})
})

describe("shareTargets", () => {
	it("lists exactly the four share sites, in order", () => {
		expect(shareTargets().map((t) => t.id)).toEqual([
			"wechat",
			"facebook",
			"twitter",
			"whatsapp",
		])
	})

	it("resolves the {{URL}} template of every link site", () => {
		const byId = new Map(shareTargets().map((t) => [t.id, t]))
		expect(byId.get("facebook")!.href).toBe(
			`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(REPO_URL)}`,
		)
		// Google+ is gone; WhatsApp took the fourth slot (its share template).
		expect(byId.get("whatsapp")!.href).toBe(
			`https://wa.me/?text=${encodeURIComponent(`${SHARE_TITLE} ${REPO_URL}`)}`,
		)
	})

	it("resolves {{TITLE}}, {{URL}} and {{ORIGIN}} for the tweet", () => {
		const byId = new Map(shareTargets().map((t) => [t.id, t]))
		const twitter = byId.get("twitter")!.href!
		expect(twitter).toContain("twitter.com/intent/tweet")
		expect(twitter).toContain(`url=${encodeURIComponent(REPO_URL)}`)
		expect(twitter).toContain(`via=${encodeURIComponent("kidyfirst")}`)
		// The em dash and the spaces have to be escaped, or the intent URL breaks.
		expect(twitter).not.toContain(" ")
	})

	it("leaves WeChat without a destination", () => {
		// Its share.js template is `javascript:` (the library opens a QR dialog),
		// which a desktop app cannot hand to a browser — the row copies instead.
		const byId = new Map(shareTargets().map((t) => [t.id, t]))
		expect(byId.get("wechat")!.href).toBeUndefined()
	})
})

describe("anchoredLeft", () => {
	it("centres the panel under the trigger", () => {
		// Trigger at 100..140, panel 200 wide → 20 keeps it centred.
		expect(anchoredLeft({ left: 100, width: 40 }, 200, 1000)).toBe(20)
	})

	it("keeps the panel inside the window", () => {
		expect(anchoredLeft({ left: 0, width: 20 }, 200, 1000)).toBe(8)
		expect(anchoredLeft({ left: 960, width: 20 }, 200, 1000)).toBe(792)
	})

	it("falls back to the left margin when the window is too narrow", () => {
		expect(anchoredLeft({ left: 10, width: 20 }, 200, 180)).toBe(8)
	})
})

describe("CommunityBanner", () => {
	it("renders the three actions", () => {
		const html = renderToStaticMarkup(<CommunityBanner />)
		expect(html).toContain('aria-label="Support MyAgent"')
		expect(html).toContain(">Star<")
		expect(html).toContain(">Tip<")
		expect(html).toContain(">Share<")
	})

	// The banner sits in a draggable sidebar and drops its captions rather
	// than letting them clip. 140 is measured: at that width the cells are
	// ~36px and the longest caption needs 34 with its padding, and a step
	// below they are already too narrow.
	it("keeps the captions while they still fit", () => {
		expect(labelsFitSidebar(260)).toBe(true) // default
		expect(labelsFitSidebar(150)).toBe(true) // narrowest usable sidebar
		expect(labelsFitSidebar(140)).toBe(true) // the cut-off itself
	})

	it("drops them once the slider is dragged narrower", () => {
		expect(labelsFitSidebar(139)).toBe(false)
		expect(labelsFitSidebar(100)).toBe(false)
	})

	it("renders no caption when the sidebar is that narrow", () => {
		const html = renderToStaticMarkup(<CommunityBanner sidebarWidth={80} />)
		expect(html).not.toContain(">Star<")
		expect(html).not.toContain(">Tip<")
		expect(html).not.toContain(">Share<")
		// The words are gone, the meaning is not: the tooltips carry it.
		expect(html).toContain('aria-label="Share MyAgent"')
	})

	it("points the star at the repository without embedding third-party JS", () => {
		const html = renderToStaticMarkup(<CommunityBanner />)
		expect(html).toContain('title="Star MyAgent on GitHub (99+)"')
		// The ghbtns.com iframe would need network and third-party script in the
		// renderer; the banner fetches the count through the main process instead.
		expect(html).not.toContain("<iframe")
		expect(html).not.toContain("ghbtns.com")
	})

	it("shows the lowest tier when the count cannot be read", () => {
		// No bridge in SSR, and the same happens in the app when the main
		// process is offline or has not been restarted with the new handler.
		// A missing badge reads as a broken button, so keep the floor tier.
		const html = renderToStaticMarkup(<CommunityBanner />)
		expect(html).toContain(`>${STAR_TIERS.under100}<`)
	})
	it("opens no popover until it is asked to", () => {
		const html = renderToStaticMarkup(<CommunityBanner />)
		expect(html).not.toContain("Alipay QR code")
		expect(html).not.toContain("Facebook")
		expect(html).not.toContain("Twitter")
	})
})

describe("SharePill", () => {
	const html = renderToStaticMarkup(
		<SharePill targets={shareTargets()} copied={null} onActivate={() => {}} />,
	)

	it("shows the product mark next to the destinations", () => {
		expect(html).toContain("logo.png")
		expect(html).toContain('alt="MyAgent"')
	})

	it("shows one brand badge per destination, logos not labels", () => {
		for (const label of ["WeChat", "Facebook", "X", "WhatsApp"]) {
			expect(html).toContain(`aria-label="${label}"`)
		}
		// A row of marks, not a menu of words: the visible text is the tooltip
		// only, so the badges themselves carry no text node.
		expect(html.match(/<button/g)?.length).toBe(4)
	})

	it("confirms the copy on the WeChat path", () => {
		const copied = renderToStaticMarkup(
			<SharePill
				targets={shareTargets()}
				copied="wechat"
				onActivate={() => {}}
			/>,
		)
		expect(copied).toContain("Link copied — paste it in WeChat")
		expect(html).not.toContain("Link copied")
	})
})
