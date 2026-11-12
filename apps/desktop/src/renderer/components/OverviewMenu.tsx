import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { claimMenu, releaseMenu } from "../utils/menuRegistry"
import { overviewPanelItems, type OverviewAction } from "../utils/overviewMenu"
import { OverviewIcon } from "./OverviewIcon"
import { ShortcutTooltip } from "./ShortcutTooltip"

interface OverviewMenuProps {
	hasGitRepo: boolean
	/** Rows are right-sidebar panels; the shell decides what each one opens. */
	onSelect: (action: OverviewAction) => void
}

/**
 * The title-bar "Overview Panel" entry point: a light list glyph that opens a
 * shortcut menu into the right sidebar.
 *
 * It is not a second navigation model — picking a row does exactly what the
 * same row in the sidebar's landing list does.
 */
export function OverviewMenu({ hasGitRepo, onSelect }: OverviewMenuProps) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	const menuRef = useRef<HTMLDivElement>(null)
	const menuId = useId()
	// The menu is a fixed-position portal, so it carries its own anchor point
	// — captured from the trigger at the moment it opens.
	const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
		null,
	)

	const toggle = () => {
		if (!open) {
			const rect = ref.current?.getBoundingClientRect()
			if (rect) {
				setAnchor({
					top: rect.bottom + 6,
					right: window.innerWidth - rect.right,
				})
			}
		}
		setOpen((value) => !value)
	}

	// One menu at a time app-wide, so this does not stack with "Open in…".
	useEffect(() => {
		if (!open) return
		claimMenu(menuId, () => setOpen(false))
		return () => releaseMenu(menuId)
	}, [open, menuId])

	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node
			// The menu itself lives in a portal now, so it counts as "inside"
			// too — otherwise picking a row would close it before the click.
			if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
				return
			}
			setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false)
		}
		// A fixed-position menu goes stale the moment the layout shifts.
		const dismiss = () => setOpen(false)
		// Capture: the tab bar stops some mousedown events from bubbling.
		document.addEventListener("mousedown", onPointerDown, true)
		document.addEventListener("keydown", onKeyDown)
		window.addEventListener("resize", dismiss)
		window.addEventListener("scroll", dismiss, true)
		return () => {
			document.removeEventListener("mousedown", onPointerDown, true)
			document.removeEventListener("keydown", onKeyDown)
			window.removeEventListener("resize", dismiss)
			window.removeEventListener("scroll", dismiss, true)
		}
	}, [open])

	const items = overviewPanelItems(hasGitRepo)

	return (
		<div
			ref={ref}
			className="titlebar-no-drag"
			style={{
				position: "relative",
				display: "flex",
				alignItems: "center",
				height: "100%",
			}}
		>
			<ShortcutTooltip
				label="Toggle Overview Panel"
				shortcut="⌥⌘O"
				align="end"
				className="titlebar-no-drag"
				disabled={open}
			>
				<button
					type="button"
					data-testid="overview-menu-trigger"
					onClick={toggle}
					aria-label="Overview Panel"
					aria-expanded={open}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						height: 28,
						width: 28,
						borderRadius: 6,
						border: "none",
						background: open ? "var(--bg-hover)" : "none",
						// Deliberately muted: a near-black glyph reads as a heavy
						// filled button next to the rest of the title bar.
						color: "var(--muted)",
						cursor: "pointer",
						transition: "background-color 0.15s",
					}}
					onMouseEnter={(event) => {
						event.currentTarget.style.backgroundColor = "var(--bg-hover)"
					}}
					onMouseLeave={(event) => {
						event.currentTarget.style.backgroundColor = open
							? "var(--bg-hover)"
							: "transparent"
					}}
				>
					<OverviewPanelGlyph />
				</button>
			</ShortcutTooltip>

			{/* Portalled: the tab bar clips its overflow (tabs must not wrap), so
			    an in-flow dropdown would be cut off at the 38px bar. */}
			{open &&
				anchor &&
				createPortal(
					<div
						ref={menuRef}
						data-testid="overview-menu"
						style={{
							position: "fixed",
							top: anchor.top,
							right: anchor.right,
							zIndex: 400,
							minWidth: 196,
							padding: 6,
							display: "flex",
							flexDirection: "column",
							gap: 2,
							background: "var(--bg)",
							border: "1px solid var(--border)",
							borderRadius: 12,
							boxShadow: "var(--shadow-popover)",
						}}
					>
						<div
							style={{
								padding: "4px 10px 6px",
								fontSize: 11,
								fontWeight: 600,
								letterSpacing: 0.3,
								color: "var(--dim)",
							}}
						>
							Overview
						</div>
						{items.map((item) => (
							<button
								key={item.id}
								type="button"
								data-testid={`overview-menu-${item.id}`}
								onClick={() => {
									setOpen(false)
									onSelect(item.id)
								}}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									width: "100%",
									padding: "7px 10px",
									borderRadius: 8,
									border: "none",
									background: "transparent",
									color: "var(--text)",
									fontSize: 12,
									textAlign: "left",
									cursor: "pointer",
									transition: "background-color 0.1s",
								}}
								onMouseEnter={(event) => {
									event.currentTarget.style.backgroundColor = "var(--bg-hover)"
								}}
								onMouseLeave={(event) => {
									event.currentTarget.style.backgroundColor = "transparent"
								}}
							>
								<span style={{ color: "var(--muted)", display: "flex" }}>
									<OverviewIcon id={item.id} size={14} />
								</span>
								{item.label}
							</button>
						))}
					</div>,
					document.body,
				)}
		</div>
	)
}

/**
 * A rounded document frame with three lines — the "Overview Panel" glyph.
 * Thin outline + soft fills keep it light instead of a solid dark block.
 */
export function OverviewPanelGlyph({ size = 16 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1"
			style={{ display: "block" }}
		>
			<rect x="2.3" y="2.5" width="11.4" height="11" rx="2.2" />
			<rect
				x="4.7"
				y="5.4"
				width="6.6"
				height="1.3"
				rx="0.65"
				fill="currentColor"
				fillOpacity="0.5"
				stroke="none"
			/>
			<rect
				x="4.7"
				y="7.9"
				width="6.6"
				height="1.3"
				rx="0.65"
				fill="currentColor"
				fillOpacity="0.5"
				stroke="none"
			/>
			<rect
				x="4.7"
				y="10.4"
				width="4.1"
				height="1.3"
				rx="0.65"
				fill="currentColor"
				fillOpacity="0.5"
				stroke="none"
			/>
		</svg>
	)
}
