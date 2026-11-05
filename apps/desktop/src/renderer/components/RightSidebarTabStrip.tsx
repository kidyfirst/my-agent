import type { OverviewAction } from "../utils/overviewMenu"
import {
	rightSidebarTabLabel,
	type RightSidebarPanel,
	type RightSidebarTab,
} from "../utils/rightSidebarTabs"
import { OverviewPanelGlyph } from "./OverviewMenu"
import { OverviewIcon } from "./OverviewIcon"
import { PanelSizeIcon } from "./PanelSizeIcon"
import { ShortcutTooltip } from "./ShortcutTooltip"
import { WindowToggleIcon } from "./WindowToggleIcon"

const TAB_ICONS: Partial<Record<RightSidebarPanel, OverviewAction>> = {
	files: "files",
	git: "review",
	browser: "browser",
	terminal: "terminal",
}

function TabGlyph({ tab }: { tab: RightSidebarPanel }) {
	const id = TAB_ICONS[tab]
	return id ? <OverviewIcon id={id} size={13} /> : null
}

interface TabButtonProps {
	tab: RightSidebarPanel
	active: boolean
	onSelect: (tab: RightSidebarPanel) => void
	onClose?: (tab: RightSidebarPanel) => void
}

function TabButton({ tab, active, onSelect, onClose }: TabButtonProps) {
	const label = rightSidebarTabLabel(tab)
	const closable = !!onClose
	return (
		<div
			role="tab"
			aria-selected={active}
			data-testid={`right-sidebar-tab-${tab}`}
			className="titlebar-no-drag"
			onClick={() => onSelect(tab)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "0 6px 0 10px",
				flexShrink: 0,
				cursor: "pointer",
				userSelect: "none",
				fontSize: 11,
				fontWeight: 600,
				letterSpacing: 0.3,
				color: active ? "var(--text)" : "var(--muted)",
				background: active ? "var(--bg-hover)" : "transparent",
				borderBottom: active
					? "2px solid var(--accent)"
					: "2px solid transparent",
				transition: "background-color 0.12s",
			}}
			onMouseEnter={(event) => {
				if (!active)
					event.currentTarget.style.backgroundColor = "var(--bg-hover)"
			}}
			onMouseLeave={(event) => {
				if (!active) event.currentTarget.style.backgroundColor = "transparent"
			}}
		>
			<span
				style={{
					display: "flex",
					color: active ? "var(--text)" : "var(--muted)",
				}}
			>
				<TabGlyph tab={tab} />
			</span>
			<span data-testid={active ? "right-sidebar-title" : undefined}>
				{label}
			</span>
			{closable && (
				<button
					type="button"
					aria-label={`Close ${label}`}
					title={`Close ${label}`}
					onClick={(event) => {
						event.stopPropagation()
						onClose?.(tab as RightSidebarPanel)
					}}
					style={{
						width: 16,
						height: 16,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						color: "var(--muted)",
						fontSize: 13,
						lineHeight: 1,
						cursor: "pointer",
					}}
					onMouseEnter={(event) => {
						event.currentTarget.style.backgroundColor = "var(--bg-hover)"
					}}
					onMouseLeave={(event) => {
						event.currentTarget.style.backgroundColor = "transparent"
					}}
				>
					×
				</button>
			)}
		</div>
	)
}

interface RightSidebarTabStripProps {
	tabs: RightSidebarPanel[]
	activeTab: RightSidebarTab
	onTabChange: (tab: RightSidebarTab) => void
	onCloseTab?: (tab: RightSidebarPanel) => void
	/** The panel currently fills the whole window (chat hidden). */
	maximized?: boolean
	onToggleMaximize?: () => void
	/** Slide the panel away; the conversation takes the space back. */
	onHide?: () => void
}

/**
 * The Overview entry is a header, not a tab: it never closes, never counts as
 * a destination, and keeps its place at the far left while real destinations
 * come and go beside it. Clicking it returns to the landing list.
 */
export function RightSidebarTabStrip({
	tabs,
	activeTab,
	onTabChange,
	onCloseTab,
	maximized = false,
	onToggleMaximize,
	onHide,
}: RightSidebarTabStripProps) {
	const overviewActive = activeTab === "menu"
	return (
		<div
			className="titlebar-drag"
			style={{
				height: 38,
				boxSizing: "border-box",
				display: "flex",
				alignItems: "stretch",
				paddingLeft: 6,
				borderBottom: "1px solid var(--border-muted)",
				background: "var(--bg-surface)",
				flexShrink: 0,
			}}
		>
			<button
				type="button"
				className="titlebar-no-drag"
				data-testid="right-sidebar-overview-header"
				aria-current={overviewActive ? "page" : undefined}
				title="Overview"
				onClick={() => onTabChange("menu")}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 6px",
					flexShrink: 0,
					border: "none",
					background: "transparent",
					color: overviewActive ? "var(--text)" : "var(--muted)",
					fontSize: 11,
					fontWeight: 600,
					letterSpacing: 0.3,
					cursor: "pointer",
				}}
				onMouseEnter={(event) => {
					event.currentTarget.style.color = "var(--text)"
				}}
				onMouseLeave={(event) => {
					event.currentTarget.style.color = overviewActive
						? "var(--text)"
						: "var(--muted)"
				}}
			>
				<OverviewPanelGlyph size={13} />
				<span>Overview</span>
			</button>

			{/* A hairline instead of a tab edge: the header is not a tab. */}
			<div
				aria-hidden
				style={{
					width: 1,
					height: 14,
					alignSelf: "center",
					margin: "0 6px 0 4px",
					background: "var(--border-muted)",
					flexShrink: 0,
				}}
			/>

			<div
				role="tablist"
				data-testid="right-sidebar-tabs"
				style={{
					display: "flex",
					alignItems: "stretch",
					flex: 1,
					minWidth: 0,
					overflowX: "auto",
					overflowY: "hidden",
					scrollbarWidth: "none",
				}}
			>
				{tabs.map((tab) => (
					<TabButton
						key={tab}
						tab={tab}
						active={activeTab === tab}
						onSelect={onTabChange}
						onClose={onCloseTab}
					/>
				))}
			</div>

			{/* Pane controls: grow to fill the window, or slide the panel away.
			    Both live here because they act on the panel as a whole, not on
			    the tab that happens to be selected. Styled exactly like the
			    title-bar icons: bare glyphs, one hover fill, no container. */}
			{(onToggleMaximize || onHide) && (
				<div
					data-testid="right-sidebar-pane-controls"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 2,
						alignSelf: "center",
						flexShrink: 0,
						margin: "0 6px 0 10px",
					}}
				>
					{onToggleMaximize && (
						<PaneControlButton
							label={maximized ? "Restore Pane Size" : "Maximize Pane"}
							shortcut="⇧⌘M"
							ariaLabel={maximized ? "Restore pane size" : "Maximize pane"}
							testId="right-sidebar-maximize"
							onClick={onToggleMaximize}
						>
							<PanelSizeIcon maximized={maximized} />
						</PaneControlButton>
					)}
					{onHide && (
						<PaneControlButton
							label="Toggle Side Panel"
							shortcut="⇧⌘B"
							ariaLabel="Hide panel"
							testId="right-sidebar-hide"
							onClick={onHide}
						>
							<WindowToggleIcon side="right" open soft />
						</PaneControlButton>
					)}
				</div>
			)}
		</div>
	)
}

interface PaneControlButtonProps {
	label: string
	/** Keys that reach the same control — shown in the hover bubble. */
	shortcut?: string
	ariaLabel: string
	testId: string
	onClick: () => void
	children: React.ReactNode
}

function PaneControlButton({
	label,
	shortcut,
	ariaLabel,
	testId,
	onClick,
	children,
}: PaneControlButtonProps) {
	return (
		<ShortcutTooltip
			label={label}
			shortcut={shortcut}
			align="end"
			className="titlebar-no-drag"
		>
			<button
				type="button"
				className="titlebar-no-drag"
				data-testid={testId}
				aria-label={ariaLabel}
				onClick={onClick}
				style={{
					width: 28,
					height: 28,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 0,
					border: "none",
					// A 6px rounded square, like the title-bar icons — a pill would
					// read as a different control family.
					borderRadius: 6,
					background: "none",
					color: "var(--muted)",
					cursor: "pointer",
					transition: "background-color 0.15s",
				}}
				onMouseEnter={(event) => {
					event.currentTarget.style.backgroundColor = "var(--bg-hover)"
				}}
				onMouseLeave={(event) => {
					event.currentTarget.style.backgroundColor = "transparent"
				}}
			>
				{children}
			</button>
		</ShortcutTooltip>
	)
}
