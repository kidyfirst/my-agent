import { useState, useEffect, useRef, useId } from "react"
import { claimMenu, releaseMenu } from "../utils/menuRegistry"
import {
	FinderIcon,
	CursorIcon,
	VSCodeIcon,
	TerminalIcon,
	GlobeIcon,
	ExternalLinkIcon,
	ChevronDownIcon,
} from "./icons"

const openTargets = [
	{
		id: "finder",
		label: "Finder",
		icon: <FinderIcon size={14} />,
	},
	{
		id: "cursor",
		label: "Cursor",
		icon: <CursorIcon size={14} />,
	},
	{
		id: "vscode",
		label: "VS Code",
		icon: <VSCodeIcon size={14} />,
	},
	{
		id: "terminal",
		label: "Terminal",
		icon: <TerminalIcon size={14} strokeWidth={1.3} viewBox="0 0 16 16" />,
	},
	{
		id: "browser",
		label: "Browser",
		icon: <GlobeIcon size={14} strokeWidth={1.8} />,
	},
	{
		id: "defaultApp",
		label: "Default App",
		icon: <ExternalLinkIcon size={14} strokeWidth={1.8} />,
	},
]

export function OpenInDropdown({
	projectPath,
	filePath,
	buttonStyle,
}: {
	projectPath?: string | null
	filePath?: string | null
	buttonStyle?: React.CSSProperties
}) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	const menuId = useId()

	// Joins the app-wide single-menu rule, so a sidebar menu opening elsewhere
	// does not leave this dropdown floating next to it.
	useEffect(() => {
		if (!open) return
		claimMenu(menuId, () => setOpen(false))
		return () => releaseMenu(menuId)
	}, [open, menuId])

	useEffect(() => {
		if (!open) return
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		// Capture: sidebar triggers stop mousedown from bubbling.
		document.addEventListener("mousedown", handler, true)
		return () => document.removeEventListener("mousedown", handler, true)
	}, [open])

	if (!projectPath && !filePath) return null

	const isFile = Boolean(filePath)
	const headerTitle = isFile ? "Open file in" : "Open in"

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
			<button
				onClick={() => setOpen((v) => !v)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "2px 10px",
					fontSize: 11,
					fontWeight: 500,
					color: "var(--text)",
					cursor: "pointer",
					transition: "all 0.1s",
					borderRadius: 4,
					border: "1px solid var(--border)",
					background: "transparent",
					...buttonStyle,
				}}
				title={isFile ? "Open file in..." : "Open project in..."}
			>
				Open in...
				<ChevronDownIcon size={8} strokeWidth={1.5} viewBox="0 0 8 8" />
			</button>
			{open && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						// Above the sticky user message (zIndex 20) so the menu isn't
						// painted over when it drops into the chat area.
						zIndex: 400,
						background: "var(--bg)",
						border: "1px solid var(--border)",
						borderRadius: 12,
						padding: 6,
						marginTop: 6,
						minWidth: 160,
						boxShadow: "var(--shadow-popover)",
						display: "flex",
						flexDirection: "column",
						gap: 2,
					}}
				>
					<div
						style={{
							padding: "4px 8px 2px",
							fontSize: 11,
							color: "var(--dim)",
							fontWeight: 600,
							textTransform: "uppercase",
							letterSpacing: "0.5px",
						}}
					>
						{headerTitle}
					</div>
					{openTargets.map((target) => (
						<button
							key={target.id}
							type="button"
							onClick={() => {
								if (isFile) {
									window.api.invoke({
										type: "openFileIn",
										target: target.id,
										filePath,
									})
								} else {
									window.api.invoke({
										type: "openProjectIn",
										target: target.id,
										projectPath,
									})
								}
								setOpen(false)
							}}
							title={target.label}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								width: "100%",
								padding: "7px 10px",
								fontSize: 12,
								color: "var(--text)",
								cursor: "pointer",
								borderRadius: 8,
								background: "transparent",
								border: "none",
								textAlign: "left",
								transition: "background-color 0.1s, color 0.1s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = "transparent"
							}}
						>
							<span
								style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
							>
								{target.icon}
							</span>
							<span
								style={{
									flex: 1,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{target.label}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}
