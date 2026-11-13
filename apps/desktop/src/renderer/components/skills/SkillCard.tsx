import type { SkillHubPluginItem } from "@my-agent/core"
import { CATEGORY_ENGLISH_NAMES } from "@my-agent/core"
import { CheckIcon, StarIcon } from "../icons"
import { AsyncButton } from "../AsyncButton"

export interface SkillCardProps {
	plugin: SkillHubPluginItem
	installed: boolean
	hasUpdate: boolean
	onDetails: (plugin: SkillHubPluginItem) => void
	onInstall: (plugin: SkillHubPluginItem) => void
	onUninstall?: (plugin: SkillHubPluginItem) => void
	uninstalling?: boolean
	installing?: boolean
}

export function SkillCard({
	plugin,
	installed,
	hasUpdate,
	onDetails,
	onInstall,
	onUninstall,
	uninstalling = false,
	installing = false,
}: SkillCardProps) {
	const categoryLabel =
		(plugin.categoryKey && CATEGORY_ENGLISH_NAMES[plugin.categoryKey]) ||
		plugin.categoryKey ||
		"General"

	const initial = (plugin.name || "S").charAt(0).toUpperCase()

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 10,
				padding: "12px 14px",
				background: "var(--bg-surface)",
				border: "1px solid var(--border)",
				borderRadius: 8,
				transition: "border-color 0.15s, background-color 0.15s",
				contentVisibility: "auto",
				containIntrinsicSize: "0 156px",
			}}
		>
			{/* Top Header */}
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				{plugin.avatarUrl ? (
					<img
						src={plugin.avatarUrl}
						alt={plugin.name}
						style={{
							width: 32,
							height: 32,
							borderRadius: 6,
							objectFit: "cover",
							background: "var(--bg-elevated)",
							flexShrink: 0,
						}}
						onError={(e) => {
							;(e.currentTarget as HTMLImageElement).style.display = "none"
						}}
					/>
				) : (
					<div
						style={{
							width: 32,
							height: 32,
							borderRadius: 6,
							background: "var(--selected-bg)",
							color: "var(--accent)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontWeight: 600,
							fontSize: 13,
							flexShrink: 0,
							border: "1px solid var(--border-accent)",
						}}
					>
						{initial}
					</div>
				)}

				<div style={{ flex: 1, minWidth: 0 }}>
					{plugin.owner && (
						<div
							style={{
								fontSize: 11,
								color: "var(--dim)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{plugin.owner}
						</div>
					)}
					<div
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: "var(--text)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
						title={plugin.displayName || plugin.name}
					>
						{plugin.displayName || plugin.name}
					</div>
				</div>

				{plugin.installability === "verified" ? (
					<span
						style={{
							fontSize: 10,
							fontWeight: 500,
							color: "var(--success)",
							background: "var(--tool-success-bg)",
							border: "1px solid var(--tool-border-success)",
							padding: "1px 6px",
							borderRadius: 4,
							flexShrink: 0,
							display: "inline-flex",
							alignItems: "center",
							gap: 3,
						}}
					>
						<CheckIcon size={10} strokeWidth={2.5} />
						Verified
					</span>
				) : (
					<span
						style={{
							fontSize: 10,
							fontWeight: 500,
							color: "var(--dim)",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							padding: "1px 6px",
							borderRadius: 4,
							flexShrink: 0,
						}}
					>
						Community
					</span>
				)}
			</div>

			{/* Description */}
			<div
				style={{
					fontSize: 12,
					color: "var(--muted)",
					lineHeight: 1.45,
					height: 35,
					display: "-webkit-box",
					WebkitLineClamp: 2,
					WebkitBoxOrient: "vertical",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
				title={plugin.description}
			>
				{plugin.description || "No description provided."}
			</div>

			{/* Category & Stars Metadata */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: 11,
					marginTop: "auto",
				}}
			>
				<span
					style={{
						fontSize: 10,
						fontWeight: 500,
						color: "var(--muted)",
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						padding: "1px 6px",
					}}
				>
					{categoryLabel}
				</span>
				<div
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 3,
						color: "var(--muted)",
						fontSize: 11,
						fontWeight: 500,
					}}
				>
					<StarIcon size={12} filled color="var(--warning)" />
					<span>{plugin.stars ?? 0}</span>
				</div>
			</div>

			{/* Action Buttons */}
			<div style={{ display: "flex", gap: 8, marginTop: 4 }}>
				<button
					type="button"
					onClick={() => onDetails(plugin)}
					style={{
						flex: 1,
						padding: "5px 10px",
						fontSize: 11,
						fontWeight: 500,
						color: "var(--text)",
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 5,
						cursor: "pointer",
						transition: "background 0.15s, border-color 0.15s",
					}}
				>
					Details
				</button>

				{installed && hasUpdate ? (
					<AsyncButton
						type="button"
						disabled={installing}
						onClick={() => onInstall(plugin)}
						style={{
							flex: 1,
							padding: "5px 12px",
							fontSize: 11,
							fontWeight: 600,
							color: "var(--on-accent)",
							background: "var(--accent)",
							border: "1px solid var(--border-accent)",
							borderRadius: 5,
							cursor: "pointer",
							transition: "opacity 0.15s",
						}}
					>
						Update
					</AsyncButton>
				) : installed ? (
					<AsyncButton
						type="button"
						disabled={installing || uninstalling}
						onClick={() => onUninstall?.(plugin)}
						style={{
							flex: 1,
							padding: "5px 12px",
							fontSize: 11,
							fontWeight: 500,
							color: "var(--on-accent)",
							background: "var(--error)",
							border: "1px solid var(--error)",
							borderRadius: 5,
							cursor: uninstalling ? "default" : "pointer",
							opacity: uninstalling ? 0.7 : 1,
							transition: "opacity 0.15s, background-color 0.15s",
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 4,
						}}
						onMouseEnter={(e) => {
							if (!uninstalling) e.currentTarget.style.opacity = "0.88"
						}}
						onMouseLeave={(e) => {
							if (!uninstalling) e.currentTarget.style.opacity = "1"
						}}
					>
						Uninstall
					</AsyncButton>
				) : (
					<AsyncButton
						type="button"
						onClick={() => onInstall(plugin)}
						style={{
							flex: 1,
							padding: "5px 12px",
							fontSize: 11,
							fontWeight: 500,
							color: "var(--on-accent)",
							background: "var(--accent)",
							border: "1px solid var(--border-accent)",
							borderRadius: 5,
							cursor: "pointer",
							transition: "opacity 0.15s",
						}}
					>
						Install
					</AsyncButton>
				)}
			</div>
		</div>
	)
}
