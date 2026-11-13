import { useState } from "react"
import type { SkillHubSource } from "@my-agent/core"
import { CloseIcon, TrashIcon, GlobeIcon, ShieldAlertIcon } from "../icons"

export interface ManageSourcesModalProps {
	isOpen: boolean
	onClose: () => void
	sources: SkillHubSource[]
	activeSourceUrl: string
	onSourcesUpdated: (newSources: SkillHubSource[], newActiveUrl: string) => void
	showToast?: (message: string, type?: "info" | "success" | "error") => void
}

export function ManageSourcesModal({
	isOpen,
	onClose,
	sources,
	activeSourceUrl,
	onSourcesUpdated,
	showToast,
}: ManageSourcesModalProps) {
	const [confirmDeleteUrl, setConfirmDeleteUrl] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	if (!isOpen) return null

	const customSources = sources.filter((s) => !s.isBuiltin)

	const handleDelete = async (targetUrl: string) => {
		setDeleting(true)
		try {
			const res = (await window.api.invoke({
				type: "removeSkillHubSource",
				url: targetUrl,
			})) as {
				success: boolean
				sources: SkillHubSource[]
				activeSourceUrl: string
			}

			if (res && res.success) {
				if (showToast) {
					showToast("SkillHub source removed successfully.", "info")
				}
				onSourcesUpdated(res.sources, res.activeSourceUrl)
				setConfirmDeleteUrl(null)
			}
		} catch (err: any) {
			if (showToast) {
				showToast(err?.message || "Failed to remove source.", "error")
			}
		} finally {
			setDeleting(false)
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--scrim)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 200,
				padding: 16,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget && !deleting) onClose()
			}}
		>
			<div
				style={{
					background: "var(--bg-surface)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					boxShadow: "var(--shadow-popover)",
					width: "100%",
					maxWidth: 520,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "14px 18px",
						borderBottom: "1px solid var(--border-muted)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<GlobeIcon size={16} stroke="var(--accent)" />
						<span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
							Manage Custom SkillHub Sources
						</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={deleting}
						aria-label="Close"
						style={{
							background: "transparent",
							border: "none",
							color: "var(--muted)",
							cursor: "pointer",
							padding: 4,
							display: "flex",
							alignItems: "center",
							borderRadius: 4,
						}}
					>
						<CloseIcon size={14} />
					</button>
				</div>

				{/* Body */}
				<div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
					<div style={{ fontSize: 12, color: "var(--muted)" }}>
						Custom SkillHub sources added to this environment. Built-in sources (skillhub.cn, clawhub.ai) are permanent and cannot be deleted.
					</div>

					{customSources.length === 0 ? (
						<div
							style={{
								padding: "24px 16px",
								textAlign: "center",
								fontSize: 12,
								color: "var(--muted)",
								background: "var(--bg-elevated)",
								borderRadius: 8,
								border: "1px dashed var(--border)",
							}}
						>
							No custom SkillHub sources have been added yet. Click &quot;+&quot; to add one.
						</div>
					) : (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 8,
								maxHeight: 280,
								overflowY: "auto",
							}}
						>
							{customSources.map((source) => {
								const isSelected = activeSourceUrl === source.url
								const isConfirming = confirmDeleteUrl === source.url

								return (
									<div
										key={source.url}
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											padding: "10px 12px",
											background: "var(--bg-elevated)",
											border: `1px solid ${isSelected ? "var(--border-accent)" : "var(--border)"}`,
											borderRadius: 8,
											gap: 12,
										}}
									>
										<div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
											<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
												<span
													style={{
														fontSize: 12,
														fontWeight: 600,
														color: "var(--text)",
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
													}}
												>
													{source.name}
												</span>
												{isSelected && (
													<span
														style={{
															fontSize: 10,
															fontWeight: 500,
															color: "var(--accent)",
															background: "var(--selected-bg)",
															border: "1px solid var(--border-accent)",
															padding: "1px 6px",
															borderRadius: 4,
														}}
													>
														Active
													</span>
												)}
											</div>
											<span
												style={{
													fontSize: 11,
													color: "var(--muted)",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
												title={source.url}
											>
												{source.url}
											</span>
										</div>

										{/* Action / Secondary Confirmation */}
										<div>
											{isConfirming ? (
												<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
													<span style={{ fontSize: 11, color: "var(--error)" }}>
														Delete?
													</span>
													<button
														type="button"
														disabled={deleting}
														onClick={() => handleDelete(source.url)}
														style={{
															padding: "3px 8px",
															fontSize: 11,
															fontWeight: 500,
															color: "var(--on-accent)",
															background: "var(--error)",
															border: "none",
															borderRadius: 4,
															cursor: "pointer",
														}}
													>
														Confirm
													</button>
													<button
														type="button"
														disabled={deleting}
														onClick={() => setConfirmDeleteUrl(null)}
														style={{
															padding: "3px 8px",
															fontSize: 11,
															color: "var(--muted)",
															background: "transparent",
															border: "1px solid var(--border)",
															borderRadius: 4,
															cursor: "pointer",
														}}
													>
														Cancel
													</button>
												</div>
											) : (
												<button
													type="button"
													title="Delete custom source"
													aria-label={`Delete source ${source.name}`}
													onClick={() => setConfirmDeleteUrl(source.url)}
													style={{
														display: "inline-flex",
														alignItems: "center",
														justifyContent: "center",
														padding: 6,
														borderRadius: 6,
														background: "transparent",
														border: "1px solid var(--border)",
														color: "var(--muted)",
														cursor: "pointer",
														transition: "all 0.15s ease",
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.color = "var(--error)"
														e.currentTarget.style.borderColor = "var(--error)"
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.color = "var(--muted)"
														e.currentTarget.style.borderColor = "var(--border)"
													}}
												>
													<TrashIcon size={14} />
												</button>
											)}
										</div>
									</div>
								)
							})}
						</div>
					)}

					{/* Close Action */}
					<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
						<button
							type="button"
							onClick={onClose}
							style={{
								padding: "6px 16px",
								fontSize: 12,
								fontFamily: "inherit",
								background: "var(--bg-elevated)",
								border: "1px solid var(--border)",
								borderRadius: 6,
								color: "var(--text)",
								cursor: "pointer",
							}}
						>
							Done
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
