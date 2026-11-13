import type { SkillHubPluginItem, SkillHubSource } from "@my-agent/core"
import { useEffect, useState } from "react"
import { CloseIcon, ExternalLinkIcon, StarIcon } from "../icons"
import { AsyncButton } from "../AsyncButton"

export interface SkillDetailModalProps {
	isOpen: boolean
	plugin: SkillHubPluginItem | null
	sourceUrl?: string
	source?: SkillHubSource | null
	onClose: () => void
	onInstall?: (plugin: SkillHubPluginItem) => void
	onUninstall?: (plugin: SkillHubPluginItem) => void
	installed?: boolean
	uninstalling?: boolean
	installing?: boolean
}

export function parsePluginIdentifiers(plugin: SkillHubPluginItem): {
	owner: string
	name: string
	fullName: string
} {
	const rawName = String(plugin.name || "").trim()
	let owner = String(plugin.owner || "").trim().replace(/^@/, "")
	let name = rawName

	// Handle @owner/package or owner/package in name or fullName
	const slashMatch = rawName.match(/^@?([^/]+)\/(.+)$/)
	if (slashMatch) {
		owner = owner || slashMatch[1]
		name = slashMatch[2]
	} else if (!owner && plugin.fullName) {
		const fullMatch = plugin.fullName.match(/^@?([^/]+)\/(.+)$/)
		if (fullMatch) {
			owner = fullMatch[1]
			name = name || fullMatch[2]
		}
	}

	name = name.replace(/^@/, "").replace(/^plugins\//, "")

	return {
		owner: owner || "unknown",
		name: name || rawName,
		fullName: plugin.fullName || (owner ? `${owner}/${name}` : name),
	}
}

/**
 * Known canonical namespaces for popular SkillHub skills when browsing from generic lists.
 */
export const KNOWN_SKILLHUB_NAMESPACES: Record<string, string> = {
	"huashu-design": "org-k6bcf2fv",
	"nuwa-skill": "clawhub_alchaincyf",
}

/**
 * Resolves the SkillHub namespace segment (intermediate URL path in /skills/:namespace/:slug).
 * In SkillHub's data model, this corresponds to:
 * - namespace.handle (e.g. "org-k6bcf2fv", "clawhub_alchaincyf", "user_xxx")
 * - publisher.orgId / publisher.handle (for enterprise/organization publishers)
 * - canonicalName (format: @<namespace>/<slug>)
 * - homepage (format: https://api.skillhub.cn/<namespace>/<slug>)
 */
export function resolveSkillNamespace(plugin: SkillHubPluginItem): string {
	// 1. From namespace object or string
	if (typeof plugin.namespace === "string" && plugin.namespace.trim()) {
		return plugin.namespace.trim().replace(/^@/, "")
	}
	if (plugin.namespace && typeof plugin.namespace === "object") {
		if (plugin.namespace.handle) {
			return plugin.namespace.handle.trim().replace(/^@/, "")
		}
		if (plugin.namespace.canonicalName) {
			const match = plugin.namespace.canonicalName.match(/^@?([^/]+)\//)
			if (match) return match[1]
		}
	}

	// 2. From canonicalName (format: @namespace/slug)
	if (plugin.canonicalName) {
		const match = plugin.canonicalName.match(/^@?([^/]+)\//)
		if (match) return match[1]
	}

	// 3. From publisher organization ID or handle
	if (plugin.publisher?.orgId) {
		return plugin.publisher.orgId.trim()
	}
	if (plugin.publisher?.handle) {
		return plugin.publisher.handle.trim().replace(/^@/, "")
	}
	if (plugin.orgId) {
		return plugin.orgId.trim()
	}

	// 4. From homepage if pointing to SkillHub pattern https://api.skillhub.cn/:namespace/:slug
	if (plugin.homepage) {
		const match = plugin.homepage.match(/skillhub\.cn\/([^/]+)\/([^/]+)/)
		if (
			match &&
			match[1] !== "skills" &&
			match[1] !== "plugins" &&
			match[1] !== "api"
		) {
			return match[1]
		}
	}

	// 5. If owner itself already represents a namespace handle (starts with org-, clawhub_, user_, indiv-)
	const rawOwner = String(plugin.owner || "").trim().replace(/^@/, "")
	if (
		rawOwner.startsWith("org-") ||
		rawOwner.startsWith("clawhub_") ||
		rawOwner.startsWith("user_") ||
		rawOwner.startsWith("indiv-")
	) {
		return rawOwner
	}

	// 6. Well-known canonical skill mapping fallback
	const rawName = String(plugin.name || "").trim().toLowerCase()
	if (KNOWN_SKILLHUB_NAMESPACES[rawName]) {
		return KNOWN_SKILLHUB_NAMESPACES[rawName]
	}

	return ""
}

export function getSkillExternalUrl(
	plugin: SkillHubPluginItem,
	sourceOrUrl?: SkillHubSource | string | null,
	overrideNamespace?: string,
): string {
	// 1. If plugin explicitly provides a custom external homepage URL (except internal api.skillhub.cn endpoint)
	if (
		plugin.homepage &&
		/^https?:\/\//i.test(plugin.homepage) &&
		!/^https?:\/\/api\.skillhub\.cn\//i.test(plugin.homepage)
	) {
		return plugin.homepage
	}

	const { owner, name, fullName } = parsePluginIdentifiers(plugin)

	let sourceUrl = ""
	let webUrl = ""
	let urlPattern = ""

	if (typeof sourceOrUrl === "string") {
		sourceUrl = sourceOrUrl
	} else if (sourceOrUrl) {
		sourceUrl = sourceOrUrl.url || ""
		webUrl = sourceOrUrl.webUrl || ""
		urlPattern = sourceOrUrl.urlPattern || ""
	}

	// Normalize domain: skillhub.cn (handle typo skillshub.cn gracefully)
	if (webUrl) {
		webUrl = webUrl.replace("skillshub.cn", "skillhub.cn")
	}

	// Determine base web URL if not set
	if (!webUrl) {
		let baseUrl = "https://skillhub.cn"
		if (sourceUrl) {
			try {
				const parsed = new URL(sourceUrl)
				let host = parsed.hostname
				if (
					host === "api.skillhub.cn" ||
					host === "api.skillshub.cn" ||
					host === "skillshub.cn"
				) {
					host = "skillhub.cn"
				} else {
					host = host.replace(/^api\./, "")
				}
				baseUrl = `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ""}`
			} catch {
				// keep default
			}
		}
		webUrl = baseUrl
	}

	webUrl = webUrl.replace("skillshub.cn", "skillhub.cn")

	// 2. Specific built-in source rules
	// A. ClawHub: https://clawhub.ai/{owner}/skills/{name}
	if (webUrl.includes("clawhub.ai") || sourceUrl.includes("clawhub.ai")) {
		const ownerSegment =
			owner && owner !== "unknown" ? encodeURIComponent(owner) : "openclaw"
		return `${webUrl}/${ownerSegment}/skills/${encodeURIComponent(name)}`
	}

	// B. SkillHub (skillhub.cn): https://skillhub.cn/skills/{namespace}/{name}
	if (
		webUrl.includes("skillhub.cn") ||
		sourceUrl.includes("skillhub.cn") ||
		webUrl.includes("skillshub.cn") ||
		sourceUrl.includes("skillshub.cn")
	) {
		// If homepage points to https://api.skillhub.cn/:namespace/:slug, translate to web url
		if (plugin.homepage) {
			const apiMatch = plugin.homepage.match(
				/https?:\/\/(?:api\.)?skillhub\.cn\/([^/]+)\/([^/]+)/,
			)
			if (
				apiMatch &&
				apiMatch[1] !== "skills" &&
				apiMatch[1] !== "plugins" &&
				apiMatch[1] !== "api"
			) {
				return `${webUrl}/skills/${encodeURIComponent(apiMatch[1])}/${encodeURIComponent(apiMatch[2])}`
			}
		}

		// Dynamically resolve namespace (e.g. org-k6bcf2fv, clawhub_alchaincyf, user_xxx, etc.)
		const namespace = overrideNamespace || resolveSkillNamespace(plugin)
		if (namespace) {
			return `${webUrl}/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(name.toLowerCase())}`
		}

		// If no namespace is resolved, fallback to SkillHub's official slug route:
		// https://skillhub.cn/skills/{slug}
		// (SkillHub's router natively resolves /skills/:slug and updates the URL to the canonical namespace)
		return `${webUrl}/skills/${encodeURIComponent(name.toLowerCase())}`
	}

	// 3. Custom urlPattern from source configuration
	if (urlPattern) {
		const namespace = overrideNamespace || resolveSkillNamespace(plugin)
		let pattern = urlPattern
		if (!namespace) {
			pattern = pattern.replace(/{namespace}\//g, "").replace(/{namespace}/g, "")
		}
		if (owner === "unknown") {
			pattern = pattern.replace(/{owner}\//g, "").replace(/{owner}/g, "")
		}
		return pattern
			.replace(/{webUrl}/g, webUrl)
			.replace(/{baseUrl}/g, webUrl)
			.replace(/{namespace}/g, encodeURIComponent(namespace.toLowerCase()))
			.replace(/{owner}/g, encodeURIComponent(owner.toLowerCase()))
			.replace(/{name}/g, encodeURIComponent(name.toLowerCase()))
			.replace(/{fullName}/g, encodeURIComponent(fullName.toLowerCase()))
	}

	// 4. Standard fallback for custom sources: https://domain/skills/{name}
	return `${webUrl}/skills/${encodeURIComponent(name || fullName)}`
}

export function SkillDetailModal({
	isOpen,
	plugin,
	sourceUrl,
	source,
	onClose,
	onInstall,
	onUninstall,
	installed,
	uninstalling = false,
	installing = false,
}: SkillDetailModalProps) {
	const [resolvedNamespace, setResolvedNamespace] = useState<string>("")

	useEffect(() => {
		if (!isOpen || !plugin) {
			setResolvedNamespace("")
			return
		}

		const immediateNs = resolveSkillNamespace(plugin)
		if (immediateNs) {
			setResolvedNamespace(immediateNs)
			return
		}

		// Asynchronously resolve namespace from SkillHub API if missing
		let cancelled = false
		const targetSourceUrl =
			typeof sourceUrl === "string"
				? sourceUrl
				: source?.url || "https://api.skillhub.cn"
		if (targetSourceUrl.includes("skillhub.cn")) {
			const apiBase = targetSourceUrl.replace(/\/+$/, "")
			fetch(`${apiBase}/api/v1/search?q=${encodeURIComponent(plugin.name)}`)
				.then((res) => (res.ok ? res.json() : null))
				.then((data) => {
					if (cancelled || !data) return
					const results = (data.results || []).filter(
						(r: any) => r.slug === plugin.name,
					)
					if (results.length === 0) return

					// 1. Direct match on owner
					const ownerMatch = results.find(
						(r: any) =>
							r.owner_name === plugin.owner ||
							r.namespace?.handle === `clawhub_${plugin.owner}` ||
							r.namespace?.handle === plugin.owner,
					)
					if (ownerMatch) {
						setResolvedNamespace(
							ownerMatch.namespace?.handle ||
								ownerMatch.publisher?.orgId ||
								"",
						)
						return
					}

					// 2. Org match (e.g. org-k6bcf2fv for huashu-design)
					const orgMatch = results.find(
						(r: any) =>
							r.publisher?.orgId ||
							r.namespace?.handle?.startsWith("org-"),
					)
					if (orgMatch) {
						setResolvedNamespace(
							orgMatch.namespace?.handle ||
								orgMatch.publisher?.orgId ||
								"",
						)
						return
					}

					// 3. Fallback to first matching slug
					const firstMatch = results[0]
					setResolvedNamespace(
						firstMatch.namespace?.handle ||
							firstMatch.publisher?.orgId ||
							"",
					)
				})
				.catch(() => {})
		}

		return () => {
			cancelled = true
		}
	}, [isOpen, plugin, source, sourceUrl])

	if (!isOpen || !plugin) return null

	const handleOpenExternal = async () => {
		const targetSource = source || sourceUrl
		const url = getSkillExternalUrl(plugin, targetSource, resolvedNamespace)
		if (url && (window as any).api?.invoke) {
			await (window as any).api.invoke({ type: "openExternal", url })
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				backgroundColor: "var(--scrim)",
				backdropFilter: "blur(4px)",
				zIndex: 1100,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 560,
					maxHeight: "85vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "14px 18px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<span
							style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}
						>
							{plugin.displayName || plugin.name}
						</span>
						{plugin.installability === "verified" && (
							<span
								style={{
									fontSize: 10,
									fontWeight: 500,
									color: "var(--success)",
									background: "var(--tool-success-bg)",
									border: "1px solid var(--tool-border-success)",
									padding: "2px 6px",
									borderRadius: 4,
								}}
							>
								Verified
							</span>
						)}
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<button
							type="button"
							onClick={handleOpenExternal}
							title="Browser the skills (Open in external browser)"
							aria-label="Browser the skills"
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 5,
								padding: "4px 10px",
								fontSize: 11,
								fontWeight: 500,
								fontFamily: "inherit",
								color: "var(--muted)",
								background: "transparent",
								border: "1px solid var(--border)",
								borderRadius: 6,
								cursor: "pointer",
								transition: "all 0.15s ease",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = "var(--text)"
								e.currentTarget.style.borderColor = "var(--border-accent)"
								e.currentTarget.style.backgroundColor = "var(--bg-elevated)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = "var(--muted)"
								e.currentTarget.style.borderColor = "var(--border)"
								e.currentTarget.style.backgroundColor = "transparent"
							}}
						>
							<ExternalLinkIcon size={12} />
							<span>Browser the skills</span>
						</button>

						<button
							type="button"
							onClick={onClose}
							title="Close"
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
							onMouseEnter={(e) => {
								e.currentTarget.style.color = "var(--text)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = "var(--muted)"
							}}
						>
							<CloseIcon size={16} strokeWidth={2} />
						</button>
					</div>
				</div>

				{/* Content */}
				<div
					style={{
						padding: 20,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						gap: 16,
						fontSize: 13,
						color: "var(--text)",
					}}
				>
					<div>
						<div
							style={{
								fontSize: 11,
								color: "var(--dim)",
								marginBottom: 4,
								textTransform: "uppercase",
								fontWeight: 600,
							}}
						>
							Description
						</div>
						<div style={{ lineHeight: 1.5, color: "var(--muted)" }}>
							{plugin.description || "No description available."}
						</div>
					</div>

					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
					>
						<div>
							<div
								style={{ fontSize: 11, color: "var(--dim)", marginBottom: 2 }}
							>
								Author / Owner
							</div>
							<div style={{ fontWeight: 500 }}>
								{plugin.owner && plugin.owner !== "unknown"
									? plugin.owner
									: "Community"}
							</div>
						</div>
						<div>
							<div
								style={{ fontSize: 11, color: "var(--dim)", marginBottom: 2 }}
							>
								Stars
							</div>
							<div
								style={{
									fontWeight: 500,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
								}}
							>
								<StarIcon size={12} filled color="var(--warning)" />
								<span>{plugin.stars ?? 0}</span>
							</div>
						</div>
						{plugin.license && (
							<div>
								<div
									style={{ fontSize: 11, color: "var(--dim)", marginBottom: 2 }}
								>
									License
								</div>
								<div style={{ fontWeight: 500 }}>{plugin.license}</div>
							</div>
						)}
						{plugin.repositoryUrl && (
							<div>
								<div
									style={{ fontSize: 11, color: "var(--dim)", marginBottom: 2 }}
								>
									Repository
								</div>
								<a
									href={plugin.repositoryUrl}
									target="_blank"
									rel="noreferrer"
									style={{
										color: "var(--accent)",
										textDecoration: "none",
										wordBreak: "break-all",
									}}
								>
									GitHub Link
								</a>
							</div>
						)}
					</div>

					{plugin.topics && plugin.topics.length > 0 && (
						<div>
							<div
								style={{
									fontSize: 11,
									color: "var(--dim)",
									marginBottom: 6,
									textTransform: "uppercase",
									fontWeight: 600,
								}}
							>
								Topics
							</div>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
								{plugin.topics.map((t) => (
									<span
										key={t}
										style={{
											fontSize: 11,
											padding: "2px 8px",
											background: "var(--bg-elevated)",
											border: "1px solid var(--border)",
											borderRadius: 4,
											color: "var(--muted)",
										}}
									>
										{t}
									</span>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "flex-end",
						gap: 10,
						padding: "12px 18px",
						borderTop: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
					}}
				>
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							color: "var(--text)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 6,
							cursor: "pointer",
						}}
					>
						Close
					</button>

					{installed ? (
						<button
							type="button"
							disabled={uninstalling || installing}
							onClick={() => onUninstall?.(plugin)}
							style={{
								padding: "6px 16px",
								fontSize: 12,
								fontWeight: 600,
								color: "var(--on-accent)",
								background: "var(--error)",
								border: "none",
								borderRadius: 6,
								cursor: uninstalling ? "default" : "pointer",
								opacity: uninstalling ? 0.7 : 1,
								transition: "opacity 0.15s",
							}}
						>
							Uninstall Skill
						</button>
					) : onInstall ? (
						<AsyncButton
							type="button"
							disabled={installing}
							onClick={() => onInstall(plugin)}
							style={{
								padding: "6px 16px",
								fontSize: 12,
								fontWeight: 600,
								color: "var(--on-accent)",
								background: "var(--accent)",
								border: "none",
								borderRadius: 6,
								cursor: "pointer",
								transition: "opacity 0.15s",
							}}
						>
							Install Skill
						</AsyncButton>
					) : null}
				</div>
			</div>
		</div>
	)
}
