import { overviewMenuItems, type OverviewAction } from "../utils/overviewMenu"
import { OverviewIcon } from "./OverviewIcon"

interface RightSidebarMenuProps {
	hasGitRepo: boolean
	onSelect: (action: OverviewAction) => void
}

/**
 * Landing view of the right sidebar: a plain list of destinations, no search
 * field and no background-task list.
 *
 * Picking a row hands the action back to the app shell, which owns the sidebar
 * tab and the browser panel — this component only decides what the rows look
 * like.
 */
export function RightSidebarMenu({
	hasGitRepo,
	onSelect,
}: RightSidebarMenuProps) {
	return (
		<div
			data-testid="right-sidebar-menu"
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: "8px 8px 12px",
				display: "flex",
				flexDirection: "column",
				gap: 2,
				background: "var(--bg-surface)",
			}}
		>
			{overviewMenuItems(hasGitRepo).map((item) => (
				<button
					key={item.id}
					type="button"
					data-testid={`right-sidebar-menu-${item.id}`}
					onClick={() => onSelect(item.id)}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						width: "100%",
						padding: "8px 10px",
						border: "none",
						borderRadius: 8,
						background: "transparent",
						color: "var(--text)",
						fontSize: 13,
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
						<OverviewIcon id={item.id} size={15} />
					</span>
					<span>{item.label}</span>
				</button>
			))}
		</div>
	)
}
