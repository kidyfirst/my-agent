import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import tipQr from "../../assets/alipay-qr.png"
import appLogo from "../../assets/logo.png"
import { BRAND_MARKS } from "./brandMarks"
import { claimMenu, releaseMenu } from "../../utils/menuRegistry"
import { SIDEBAR_DEFAULT_WIDTH } from "../../utils/sidebarResize"
import {
	REPO_URL,
	STAR_TIERS,
	anchoredLeft,
	formatStarCount,
	shareTargets,
	type ShareTarget,
	type ShareTargetId,
} from "../../utils/community"

/** Panel widths — they drive the anchoring maths and the box itself. */
const TIP_WIDTH = 196
/** One row of brand badges plus the product mark. */
const SHARE_WIDTH = 214

/**
 * Sidebar width under which the captions are dropped.
 *
 * 140 is the last width where nothing is clipped: at 140 the cells are ~36px
 * and "Share" needs 34 including padding, while at 120 they are 29px. Below
 * that the words would have to be cut mid-glyph, so they go instead. Nothing
 * is lost for the reader — the buttons keep their tooltip and aria-label.
 */
const LABEL_MIN_SIDEBAR_WIDTH = 140

/** True while the sidebar is wide enough to keep the captions under the icons. */
export function labelsFitSidebar(sidebarWidth: number): boolean {
	return sidebarWidth >= LABEL_MIN_SIDEBAR_WIDTH
}

/** The three captions, kept in one place so the buttons stay in sync. */
const LABELS = { star: "Star", tip: "Tip", share: "Share" } as const

/** Typography shared by every caption. */
const LABEL_TEXT: React.CSSProperties = {
	fontSize: 10,
	fontWeight: 600,
	letterSpacing: "0.01em",
	whiteSpace: "nowrap",
}

type PanelKind = "tip" | "share"

interface PanelState {
	kind: PanelKind
	left: number
	top: number
	/** Narrower than the design width when the sidebar is dragged very thin. */
	width: number
}

/**
 * Community banner above the Agents entry: star, tip and share.
 *
 * The star is the "one click to GitHub" pattern — the count is read from the
 * GitHub API (through the main process, see `repo-handlers.ts`) and the click
 * opens the repository in the default browser. An embedded ghbtns.com iframe
 * would need third-party JS and network in a window we deliberately keep
 * offline-capable, so the number is fetched once and cached instead.
 *
 * Tip reveals the Alipay QR on hover; Share reveals the brand marks of the
 * places the link can be sent to — hovering is enough, nothing to click open.
 */
export function CommunityBanner({
	sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
}: {
	/** Live width of the sidebar this banner sits in (see the Sidebar props). */
	sidebarWidth?: number
} = {}) {
	const [stars, setStars] = useState<number | null>(null)
	const [panel, setPanel] = useState<PanelState | null>(null)
	const [copied, setCopied] = useState<ShareTargetId | null>(null)
	const [hovered, setHovered] = useState<"star" | "tip" | "share" | null>(null)
	/** Captions drop out when the sidebar is too narrow to show them. */
	const showLabels = labelsFitSidebar(sidebarWidth)

	const bannerRef = useRef<HTMLDivElement>(null)
	const tipRef = useRef<HTMLButtonElement>(null)
	const shareRef = useRef<HTMLButtonElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const menuId = useId()
	const isOpen = panel !== null
	const targets = shareTargets()

	// Live star count, bucketed into a tier. A failed read (offline, rate limit,
	// main process not restarted) leaves `stars` null and the badge shows the
	// lowest tier instead of disappearing.
	useEffect(() => {
		let cancelled = false
		try {
			window.api
				?.invoke({ type: "getRepoStars" })
				.then((result) => {
					const value = (result as { stars?: unknown } | null)?.stars
					if (!cancelled && typeof value === "number") setStars(value)
				})
				.catch(() => {})
		} catch {
			// No bridge (tests, plain browser): keep the icon-only button.
		}
		return () => {
			cancelled = true
		}
	}, [])

	const clearCloseTimer = useCallback(() => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
	}, [])

	const openPanel = useCallback(
		(kind: PanelKind) => {
			clearCloseTimer()
			const anchor = kind === "tip" ? tipRef.current : shareRef.current
			if (!anchor) return
			const rect = anchor.getBoundingClientRect()
			const design = kind === "tip" ? TIP_WIDTH : SHARE_WIDTH
			// Stay inside the sidebar: a popover floating half over the chat area
			// reads as a glitch. The panel may be a little wider than the card so
			// it never looks cramped, but not wider than its container allows.
			const band = bannerRef.current?.getBoundingClientRect()
			const width = band
				? Math.min(design, Math.max(168, band.width + 8))
				: design
			const left = band
				? Math.min(
						Math.max(
							band.left - 4,
							anchoredLeft(rect, width, window.innerWidth),
						),
						band.right + 4 - width,
					)
				: anchoredLeft(rect, width, window.innerWidth)
			setPanel({ kind, left, top: rect.bottom + 8, width })
		},
		[clearCloseTimer],
	)

	/**
	 * Hover cards close on a short delay so moving the pointer from the button
	 * into the panel (or between the two) does not make them flicker.
	 */
	const scheduleClose = useCallback(
		(kind: PanelKind) => {
			clearCloseTimer()
			closeTimer.current = setTimeout(() => {
				setPanel((current) => (current?.kind === kind ? null : current))
			}, 180)
		},
		[clearCloseTimer],
	)

	// Only one popover may be open anywhere in the app, same registry as the
	// context menus: opening a menu closes this panel and vice versa.
	useEffect(() => {
		if (!isOpen) return
		claimMenu(menuId, () => setPanel(null))
		return () => releaseMenu(menuId)
	}, [isOpen, menuId])

	useEffect(() => {
		if (!isOpen) return
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node
			if (panelRef.current?.contains(target)) return
			if (tipRef.current?.contains(target)) return
			if (shareRef.current?.contains(target)) return
			setPanel(null)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setPanel(null)
		}
		// Capture: the buttons stop mousedown from bubbling to keep their own
		// click handling intact, so a bubbling listener would never fire.
		window.addEventListener("mousedown", onPointerDown, true)
		window.addEventListener("keydown", onKeyDown)
		return () => {
			window.removeEventListener("mousedown", onPointerDown, true)
			window.removeEventListener("keydown", onKeyDown)
		}
	}, [isOpen])

	useEffect(
		() => () => {
			if (closeTimer.current) clearTimeout(closeTimer.current)
			if (copyTimer.current) clearTimeout(copyTimer.current)
		},
		[],
	)

	const copy = useCallback(async (id: ShareTargetId) => {
		try {
			await navigator.clipboard.writeText(REPO_URL)
		} catch {
			// Clipboard denied — the label still confirms, the user can select
			// the URL from the tooltip.
		}
		setCopied(id)
		if (copyTimer.current) clearTimeout(copyTimer.current)
		copyTimer.current = setTimeout(() => setCopied(null), 1800)
	}, [])

	const activate = useCallback(
		(target: ShareTarget) => {
			if (target.href) {
				void window.api.invoke({ type: "openExternal", url: target.href })
				setPanel(null)
				return
			}
			void copy(target.id)
		},
		[copy],
	)

	const starLabel = formatStarCount(stars) ?? STAR_TIERS.under100

	return (
		<>
			<div
				ref={bannerRef}
				role="group"
				aria-label="Support MyAgent"
				style={{
					margin: "8px 10px 10px",
					padding: 4,
					borderRadius: 10,
					border: "1px solid var(--border)",
					background:
						"linear-gradient(160deg, color-mix(in srgb, var(--accent) 8%, var(--bg-surface)), var(--bg-surface) 72%)",
					display: "grid",
					gridTemplateColumns: "1fr 1fr 1fr",
					gap: 2,
					flexShrink: 0,
				}}
			>
				<Action
					label={LABELS.star}
					showLabel={showLabels}
					title={
						starLabel
							? `Star MyAgent on GitHub (${starLabel})`
							: "Star MyAgent on GitHub"
					}
					active={hovered === "star"}
					onMouseEnter={() => setHovered("star")}
					onMouseLeave={() => setHovered(null)}
					onClick={() =>
						void window.api.invoke({ type: "openExternal", url: REPO_URL })
					}
					lead={
						<>
							<span
								style={{
									display: "inline-flex",
									color: "var(--warning)",
									flexShrink: 0,
								}}
							>
								<StarIcon />
							</span>
							{starLabel && (
								<span
									style={{
										fontSize: 10,
										fontWeight: 700,
										color: "var(--muted)",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									{starLabel}
								</span>
							)}
						</>
					}
				/>

				<Action
					ref={tipRef}
					label={LABELS.tip}
					showLabel={showLabels}
					title="Buy me a coffee"
					active={hovered === "tip" || panel?.kind === "tip"}
					onMouseEnter={() => {
						setHovered("tip")
						openPanel("tip")
					}}
					onMouseLeave={() => {
						setHovered(null)
						scheduleClose("tip")
					}}
					onClick={() =>
						panel?.kind === "tip" ? setPanel(null) : openPanel("tip")
					}
					lead={<CoffeeIcon />}
				/>

				<Action
					ref={shareRef}
					label={LABELS.share}
					showLabel={showLabels}
					title="Share MyAgent"
					active={hovered === "share" || panel?.kind === "share"}
					onMouseEnter={() => {
						setHovered("share")
						openPanel("share")
					}}
					onMouseLeave={() => {
						setHovered(null)
						scheduleClose("share")
					}}
					onClick={() =>
						panel?.kind === "share" ? setPanel(null) : openPanel("share")
					}
					lead={<ShareIcon />}
				/>
			</div>

			{panel &&
				createPortal(
					<div
						ref={panelRef}
						role="dialog"
						aria-label={panel.kind === "tip" ? "Tip" : "Share MyAgent"}
						onMouseEnter={clearCloseTimer}
						onMouseLeave={() => scheduleClose(panel.kind)}
						style={{
							position: "fixed",
							left: panel.left,
							top: panel.top,
							width: panel.width,
							padding: panel.kind === "tip" ? 10 : 8,
							background: "var(--bg)",
							border: "1px solid var(--border)",
							borderRadius: 12,
							boxShadow: "var(--shadow-popover)",
							zIndex: 1000,
							animation: "community-panel-in 120ms ease-out",
						}}
					>
						{panel.kind === "tip" ? (
							<TipCard />
						) : (
							<SharePill
								targets={targets}
								copied={copied}
								onActivate={activate}
							/>
						)}
					</div>,
					document.body,
				)}

			<style>{`
				@keyframes community-panel-in {
					from { opacity: 0; transform: translateY(-4px); }
					to { opacity: 1; transform: none; }
				}
			`}</style>
		</>
	)
}

function TipCard() {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
			<img
				src={tipQr}
				alt="Alipay QR code"
				style={{ display: "block", width: "100%", borderRadius: 8 }}
			/>
			<div style={{ textAlign: "center", lineHeight: 1.25 }}>
				<div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
					Buy me a coffee. Thanks for your support!
				</div>
			</div>
		</div>
	)
}

/**
 * The share row: the product mark, then one badge per destination.
 *
 * Hovering the Share button is enough to get here — there is no menu to open,
 * which is the point: one movement to the brand you want, one click to land on
 * its share page in the default browser.
 */
export function SharePill({
	targets,
	copied,
	onActivate,
}: {
	targets: ShareTarget[]
	copied: ShareTargetId | null
	onActivate: (target: ShareTarget) => void
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<img
					src={appLogo}
					alt="MyAgent"
					width={22}
					height={22}
					style={{ display: "block", borderRadius: 6, flexShrink: 0 }}
				/>
				<span
					aria-hidden="true"
					style={{
						width: 1,
						height: 18,
						background: "var(--border)",
						flexShrink: 0,
					}}
				/>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginLeft: "auto",
					}}
				>
					{targets.map((target) => (
						<BrandBadge
							key={target.id}
							target={target}
							onClick={() => onActivate(target)}
						/>
					))}
				</div>
			</div>
			{copied === "wechat" && (
				<div
					style={{
						fontSize: 10,
						color: "var(--success)",
						paddingLeft: 2,
						whiteSpace: "nowrap",
					}}
				>
					Link copied — paste it in WeChat
				</div>
			)}
		</div>
	)
}

function BrandBadge({
	target,
	onClick,
}: {
	target: ShareTarget
	onClick: () => void
}) {
	const mark = BRAND_MARKS[target.id]
	return (
		<button
			type="button"
			onClick={onClick}
			title={target.hint}
			aria-label={target.label}
			style={{
				width: 30,
				height: 30,
				padding: 0,
				border: target.id === "twitter" ? "1px solid var(--border)" : "none",
				borderRadius: "50%",
				background: mark.background,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				cursor: "pointer",
				flexShrink: 0,
				transition: "transform 0.12s ease, box-shadow 0.12s ease",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.transform = "translateY(-1px)"
				e.currentTarget.style.boxShadow = "var(--shadow-sm)"
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.transform = "none"
				e.currentTarget.style.boxShadow = "none"
			}}
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill={mark.glyphColor}
				aria-hidden="true"
			>
				{mark.glyph}
			</svg>
		</button>
	)
}

interface ActionProps {
	label: string
	/** False once the sidebar is too narrow for the caption (see the banner). */
	showLabel: boolean
	title: string
	lead: React.ReactNode
	active: boolean
	onClick: () => void
	onMouseEnter: () => void
	onMouseLeave: () => void
}

function Action({
	label,
	showLabel,
	title,
	lead,
	active,
	onClick,
	onMouseEnter,
	onMouseLeave,
	ref,
}: ActionProps & { ref?: React.Ref<HTMLButtonElement> }) {
	return (
		<button
			ref={ref}
			type="button"
			onClick={onClick}
			title={title}
			aria-label={title}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 3,
				padding: "6px 2px",
				border: "none",
				borderRadius: 8,
				background: active
					? "color-mix(in srgb, var(--accent) 12%, transparent)"
					: "transparent",
				color: active ? "var(--text)" : "var(--muted)",
				cursor: "pointer",
				transition: "background-color 0.12s, color 0.12s",
				minWidth: 0,
			}}
		>
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 3,
					height: 15,
				}}
			>
				{lead}
			</span>
			{showLabel && (
				<span
					style={{
						...LABEL_TEXT,
						color: active ? "var(--text)" : "var(--muted)",
					}}
				>
					{label}
				</span>
			)}
		</button>
	)
}

function StarIcon({ size = 13 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M12 2.6l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.42 6.2 20.47l1.11-6.46-4.7-4.58 6.49-.95z" />
		</svg>
	)
}

function CoffeeIcon({ size = 14 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.5"
			aria-hidden="true"
		>
			<path d="M3.75 9.75h11.5v5.75A5.25 5.25 0 0 1 10 20.75H9a5.25 5.25 0 0 1-5.25-5.25Z" />
			<path d="M15.25 11H17a2.5 2.5 0 0 1 0 5h-1.9M7.75 2.75c-.6.6-.6 1.6 0 2.25s.6 1.6 0 2.25m3.5-4.5c-.6.6-.6 1.6 0 2.25s.6 1.6 0 2.25" />
		</svg>
	)
}

function ShareIcon({ size = 14 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M4 13.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5.5" />
			<path d="M12 15.5V3.5" />
			<path d="M8.25 7.25 12 3.5l3.75 3.75" />
		</svg>
	)
}
