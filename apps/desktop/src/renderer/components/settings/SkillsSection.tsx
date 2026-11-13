import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import type {
	SkillHubCategory,
	SkillHubPluginItem,
	SecurityAuditReport,
	Skill,
	ProjectSkillsConfig,
	SkillHubSource,
} from "@my-agent/core"
import {
	FALLBACK_CATEGORIES,
	DEFAULT_PROJECT_SKILL_DIRS,
	DEFAULT_SKILLHUB_SOURCES,
	DEFAULT_SKILLHUB_API_BASE,
	isPluginItem,
	normalizeSkillItem,
	compareSkillsByStars,
} from "@my-agent/core"
import {
	SearchIcon,
	RefreshIcon,
	CloseIcon,
	PlusIcon,
	MinusIcon,
	SpinnerIcon,
	GlobeIcon,
	ChevronDownIcon,
	ShieldAlertIcon,
} from "../icons"
import { SkillCard } from "../skills/SkillCard"
import { SkillDetailModal } from "../skills/SkillDetailModal"
import { SkillSecurityModal } from "../skills/SkillSecurityModal"
import { AddSourceModal } from "../skills/AddSourceModal"
import { ManageSourcesModal } from "../skills/ManageSourcesModal"

export interface SkillsSectionProps {
	initialTab?: "marketplace" | "project"
	showToast?: (message: string, type?: "info" | "success" | "error") => void
}

export function SkillsSection({
	initialTab = "marketplace",
	showToast,
}: SkillsSectionProps = {}) {
	// Top tab state
	const [activeTab, setActiveTab] = useState<"marketplace" | "project">(initialTab)

	// Project custom skills configuration
	const [projectSkillsEnabled, setProjectSkillsEnabled] =
		useState<boolean>(true)
	const [customDirs, setCustomDirs] = useState<string[]>([])
	const [newDirInput, setNewDirInput] = useState<string>("")

	// SkillHub Sources state
	const [sources, setSources] = useState<SkillHubSource[]>(DEFAULT_SKILLHUB_SOURCES)
	const [activeSourceUrl, setActiveSourceUrl] = useState<string>(DEFAULT_SKILLHUB_API_BASE)
	const [isAddSourceOpen, setIsAddSourceOpen] = useState(false)
	const [isManageSourcesOpen, setIsManageSourcesOpen] = useState(false)
	const [sourceError, setSourceError] = useState<string | null>(null)

	const [categories, setCategories] =
		useState<SkillHubCategory[]>(FALLBACK_CATEGORIES)
	const [selectedCategory, setSelectedCategory] = useState<string>("all")
	const [searchQuery, setSearchQuery] = useState<string>("")
	const [committedSearch, setCommittedSearch] = useState<string>("")
	const [displayedPlugins, setDisplayedPlugins] = useState<
		SkillHubPluginItem[]
	>([])
	const [installedSkills, setInstalledSkills] = useState<Skill[]>([])
	const [displayedTotal, setDisplayedTotal] = useState<number>(0)
	const [paginationEnded, setPaginationEnded] = useState(false)
	const [loading, setLoading] = useState<boolean>(false)
	const [fadeState, setFadeState] = useState<"visible" | "fading-out">("visible")

	// Infinite pagination state
	const [currentPage, setCurrentPage] = useState<number>(1)
	const [loadingMore, setLoadingMore] = useState<boolean>(false)
	const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
	const PAGE_SIZE = 30
	const sentinelRef = useRef<HTMLDivElement>(null)
	const loadingMoreRef = useRef(false)

	const displayedPluginsRef = useRef<SkillHubPluginItem[]>([])
	displayedPluginsRef.current = displayedPlugins

	const requestIdRef = useRef(0)
	const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return () => {
			if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
		}
	}, [])

	// Modals state
	const [detailPlugin, setDetailPlugin] = useState<SkillHubPluginItem | null>(
		null,
	)
	const [securityPlugin, setSecurityPlugin] =
		useState<SkillHubPluginItem | null>(null)
	const [securityReport, setSecurityReport] =
		useState<SecurityAuditReport | null>(null)
	const [installing, setInstalling] = useState<boolean>(false)
	const [uninstallingSkill, setUninstallingSkill] = useState<string | null>(null)

	// Load categories, installed skills & project skills config on mount
	useEffect(() => {
		async function init() {
			try {
				const [cats, installed, projConfig, sourcesRes] = await Promise.all([
					window.api.invoke({ type: "getSkillHubCategories" }) as Promise<
						SkillHubCategory[]
					>,
					window.api.invoke({ type: "getInstalledSkills" }) as Promise<Skill[]>,
					window.api.invoke({ type: "getProjectSkillsConfig" }) as Promise<
						ProjectSkillsConfig | null
					>,
					window.api.invoke({ type: "getSkillHubSources" }) as Promise<{
						sources: SkillHubSource[]
						activeSourceUrl: string
					}>,
				])
				if (sourcesRes && Array.isArray(sourcesRes.sources) && sourcesRes.sources.length > 0) {
					setSources(sourcesRes.sources)
					// Do not restore the previous selection; use dropdown order.
					setActiveSourceUrl(sourcesRes.sources[0].url)
				}
				if (Array.isArray(cats) && cats.length > 0) setCategories(cats)
				if (Array.isArray(installed)) setInstalledSkills(installed)
				if (projConfig) {
					if (typeof projConfig.enabled === "boolean") {
						setProjectSkillsEnabled(projConfig.enabled)
					}
					if (Array.isArray(projConfig.customDirs)) {
						setCustomDirs(projConfig.customDirs)
					}
				}
			} catch {
				// use fallbacks
			}
		}
		init()
	}, [])

	const handleSelectSource = useCallback(
		async (newUrl: string) => {
			if (!newUrl || newUrl === activeSourceUrl) return
			setActiveSourceUrl(newUrl)
			setSourceError(null)
			setSelectedCategory("all")
			setSearchQuery("")
			setCommittedSearch("")
			try {
				await window.api.invoke({
					type: "setActiveSkillHubSource",
					url: newUrl,
				})
			} catch {}

			// Load categories for new source
			try {
				const cats = (await window.api.invoke({
					type: "getSkillHubCategories",
					sourceUrl: newUrl,
				})) as SkillHubCategory[]
				if (Array.isArray(cats) && cats.length > 0) {
					setCategories(cats)
				} else {
					setCategories(FALLBACK_CATEGORIES)
				}
			} catch {
				setCategories(FALLBACK_CATEGORIES)
			}
		},
		[activeSourceUrl],
	)

	const handleAddCustomDir = async (e: React.FormEvent) => {
		e.preventDefault()
		const dir = newDirInput.trim().replace(/^[/\\]+|[/\\]+$/g, "")
		if (!dir) return
		if (customDirs.includes(dir) || DEFAULT_PROJECT_SKILL_DIRS.includes(dir)) {
			setNewDirInput("")
			return
		}
		const updated = [...customDirs, dir]
		setCustomDirs(updated)
		setNewDirInput("")
		try {
			await window.api.invoke({
				type: "saveProjectSkillsConfig",
				config: { enabled: projectSkillsEnabled, customDirs: updated },
			})
		} catch {}
	}

	const handleRemoveCustomDir = async (dirToRemove: string) => {
		const updated = customDirs.filter((d) => d !== dirToRemove)
		setCustomDirs(updated)
		try {
			await window.api.invoke({
				type: "saveProjectSkillsConfig",
				config: { enabled: projectSkillsEnabled, customDirs: updated },
			})
		} catch {}
	}

	// Load plugins based on category, search, and active source (resets to page 1)
	const fetchPlugins = useCallback(async (overrideSourceUrl?: string) => {
		const currentRequestId = ++requestIdRef.current
		const currentUrl = overrideSourceUrl || activeSourceUrl
		setLoading(true)
		setLoadMoreError(null)
		setSourceError(null)
		setCurrentPage(1)
		setPaginationEnded(false)
		try {
			const res = (await window.api.invoke({
				type: "getSkillHubPlugins",
				page: 1,
				pageSize: PAGE_SIZE,
				categoryKey: selectedCategory,
				search: committedSearch,
				sourceUrl: currentUrl,
				sort: "stars",
				order: "desc",
			})) as { items: SkillHubPluginItem[]; total: number; error?: string }

			if (requestIdRef.current !== currentRequestId) return

			if (res?.error && (!res.items || res.items.length === 0)) {
				setSourceError(res.error)
				setDisplayedPlugins([])
				setDisplayedTotal(0)
				setLoading(false)
				setFadeState("visible")
				return
			}

			const rawItems = Array.isArray(res?.items) ? res.items : []
			const newItems = rawItems
				.map(normalizeSkillItem)
				.filter((item) => !isPluginItem(item))
				.sort(compareSkillsByStars)
			const newTotal = res?.total ?? newItems.length

			// If old content exists, cross-fade: fade out old content, swap, and fade in new content
			if (displayedPluginsRef.current.length > 0) {
				setFadeState("fading-out")
				if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
				fadeTimeoutRef.current = setTimeout(() => {
					if (requestIdRef.current !== currentRequestId) return
					setDisplayedPlugins(newItems)
					setDisplayedTotal(newTotal)
					setFadeState("visible")
					setLoading(false)
				}, 150)
			} else {
				setDisplayedPlugins(newItems)
				setDisplayedTotal(newTotal)
				setFadeState("visible")
				setLoading(false)
			}

			// Check updates for installed skills
			try {
				const updated = (await window.api.invoke({
					type: "checkSkillUpdates",
					plugins: newItems,
				})) as Skill[]
				if (Array.isArray(updated)) setInstalledSkills(updated)
			} catch {}
		} catch (err: any) {
			if (requestIdRef.current === currentRequestId) {
				setSourceError(err?.message || "Failed to load skills from server.")
				setDisplayedPlugins([])
				setDisplayedTotal(0)
				setLoading(false)
				setFadeState("visible")
			}
		}
	}, [selectedCategory, committedSearch, activeSourceUrl, PAGE_SIZE])

	const hasMore = !paginationEnded && displayedPlugins.length < displayedTotal

	// Load next page of skills
	const handleLoadMore = useCallback(async () => {
		if (loading || loadingMore || loadingMoreRef.current || !hasMore) return
		loadingMoreRef.current = true
		const nextPage = currentPage + 1
		setLoadingMore(true)
		setLoadMoreError(null)
		const currentRequestId = requestIdRef.current

		try {
			const res = (await window.api.invoke({
				type: "getSkillHubPlugins",
				page: nextPage,
				pageSize: PAGE_SIZE,
				categoryKey: selectedCategory,
				search: committedSearch,
				sourceUrl: activeSourceUrl,
				sort: "stars",
				order: "desc",
			})) as { items: SkillHubPluginItem[]; total: number }

			if (requestIdRef.current !== currentRequestId) return

			const newItems = Array.isArray(res?.items) ? res.items : []
			if (newItems.length > 0) {
				setDisplayedPlugins((prev) => {
					const existingKeys = new Set(
						prev.map((p) =>
							(p.fullName || `${p.owner}/${p.name}`).toLowerCase(),
						),
					)
					const uniqueNew = newItems
						.map(normalizeSkillItem)
						.filter((item) => !isPluginItem(item))
						.filter(
							(p) =>
								!existingKeys.has(
									(p.fullName || `${p.owner}/${p.name}`).toLowerCase(),
								),
						)
					if (uniqueNew.length === 0) {
						// The source returned a repeated page or exhausted cursor. Stop
						// observing the sentinel instead of requesting forever.
						setPaginationEnded(true)
						return prev
					}
					return [...prev, ...uniqueNew].sort(compareSkillsByStars)
				})
				setCurrentPage((current) => (newItems.length > 0 ? nextPage : current))
				if (typeof res?.total === "number") {
					setDisplayedTotal(res.total)
				}

				// Check updates for newly fetched skills
				try {
					const updated = (await window.api.invoke({
						type: "checkSkillUpdates",
						plugins: newItems,
					})) as Skill[]
					if (Array.isArray(updated)) setInstalledSkills(updated)
				} catch {}
			} else {
				// No more items returned from server
				setPaginationEnded(true)
			}
		} catch (err) {
			if (requestIdRef.current === currentRequestId) {
				setLoadMoreError(
					(err as Error)?.message ||
						"Failed to load more skills. Click to retry.",
				)
			}
		} finally {
			loadingMoreRef.current = false
			if (requestIdRef.current === currentRequestId) {
				setLoadingMore(false)
			}
		}
	}, [
		loading,
		loadingMore,
		hasMore,
		currentPage,
		PAGE_SIZE,
		selectedCategory,
		committedSearch,
		activeSourceUrl,
		displayedPlugins.length,
	])

	// Infinite scroll auto-trigger using IntersectionObserver
	useEffect(() => {
		const sentinel = sentinelRef.current
		if (!sentinel) return
		if (loading || loadingMore || !hasMore || loadMoreError) return

		const scrollContainer =
			sentinel.closest<HTMLElement>(".settings-content-scroll") ||
			sentinel.closest<HTMLElement>("[style*='overflow']")

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0]
				if (entry?.isIntersecting) {
					handleLoadMore()
				}
			},
			{
				root: scrollContainer || null,
				rootMargin: "300px",
				threshold: 0.01,
			},
		)

		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [loading, loadingMore, hasMore, loadMoreError, handleLoadMore])

	// Scroll container fallback listener
	useEffect(() => {
		const sentinel = sentinelRef.current
		if (!sentinel) return
		const scrollContainer =
			sentinel.closest<HTMLElement>(".settings-content-scroll") ||
			sentinel.closest<HTMLElement>("[style*='overflow']")
		if (!scrollContainer) return

		const onScroll = () => {
			if (loading || loadingMore || !hasMore || loadMoreError) return
			const { scrollTop, scrollHeight, clientHeight } = scrollContainer
			if (scrollHeight - scrollTop - clientHeight < 300) {
				handleLoadMore()
			}
		}

		scrollContainer.addEventListener("scroll", onScroll, { passive: true })
		return () => scrollContainer.removeEventListener("scroll", onScroll)
	}, [loading, loadingMore, hasMore, loadMoreError, handleLoadMore])

	useEffect(() => {
		fetchPlugins()
	}, [fetchPlugins])

	// Lookup maps for installed and update statuses
	const installedMap = useMemo(() => {
		const map = new Map<string, Skill>()
		for (const s of installedSkills) {
			map.set(s.name.toLowerCase(), s)
			if (s.owner) map.set(`${s.owner}/${s.name}`.toLowerCase(), s)
		}
		return map
	}, [installedSkills])

	// Debounce auto-search on typing or clearing
	useEffect(() => {
		const trimmed = searchQuery.trim()
		if (trimmed === committedSearch) return

		// Immediate search when input is cleared; 300ms debounce when typing
		const delay = trimmed === "" ? 0 : 300
		const timer = setTimeout(() => {
			setCommittedSearch(trimmed)
		}, delay)

		return () => clearTimeout(timer)
	}, [searchQuery, committedSearch])

	const handleClearSearch = () => {
		setSearchQuery("")
		setCommittedSearch("")
	}

	const handleOpenInstallAudit = async (plugin: SkillHubPluginItem) => {
		try {
			const manifestContent = `---
name: ${plugin.name}
description: ${plugin.description}
author: ${plugin.owner}
category: ${plugin.categoryKey || "agent-workflow"}
permissions: []
---

# ${plugin.name}
${plugin.description}
`
			const report = (await window.api.invoke({
				type: "auditSkill",
				manifestContent,
				files: { "SKILL.md": manifestContent },
			})) as SecurityAuditReport

			setSecurityPlugin(plugin)
			setSecurityReport(report)
		} catch {
			alert("Failed to perform security audit on skill.")
		}
	}

	const handleConfirmInstall = async () => {
		if (!securityPlugin) return
		// Different marketplaces can publish the same owner/name. They share one
		// global directory, so make the overwrite explicit before downloading.
		const installed = (await window.api.invoke({
			type: "getInstalledSkills",
		})) as Skill[]
		const existing = Array.isArray(installed)
			? installed.find(
					(skill) =>
						skill.name.toLowerCase() === securityPlugin.name.toLowerCase() &&
						(skill.owner || "").toLowerCase() ===
							securityPlugin.owner.toLowerCase(),
					)
				: undefined
		if (existing) {
			const confirmed = window.confirm(
				`Skill ${securityPlugin.owner}/${securityPlugin.name} is already installed. Overwrite it?`,
			)
			if (!confirmed) return
		}
		setInstalling(true)
		try {
			const manifestContent = `---
name: ${securityPlugin.name}
description: ${securityPlugin.description}
author: ${securityPlugin.owner}
category: ${securityPlugin.categoryKey || "agent-workflow"}
permissions: []
---

# ${securityPlugin.name}
${securityPlugin.description}
`
			const result = (await window.api.invoke({
				type: "installSkill",
				name: securityPlugin.name,
				owner: securityPlugin.owner,
				repositoryUrl: securityPlugin.repositoryUrl,
				sourceUrl: activeSourceUrl,
				// The card's owner/name is the public SkillHub identity. `fullName`
				// can be an internal alias (e.g. indiv-guipi) and must not determine
				// the download package or local install directory.
				slug: securityPlugin.owner && securityPlugin.name
					? `@${securityPlugin.owner}/${securityPlugin.name}`
					: securityPlugin.fullName || securityPlugin.slug || securityPlugin.name,
				headSha: securityPlugin.headSha,
				manifestContent,
				files: { "SKILL.md": manifestContent },
				force: true,
			})) as { success?: boolean; reason?: string }
			if (result?.success === false) {
				throw new Error(result.reason || "Failed to install skill.")
			}

			// Refresh installed skills
			const installed = (await window.api.invoke({
				type: "getInstalledSkills",
			})) as Skill[]
			if (Array.isArray(installed)) setInstalledSkills(installed)

			setSecurityPlugin(null)
			setSecurityReport(null)
			showToast?.(`${securityPlugin.name} installed successfully.`, "success")
		} catch (error) {
			showToast?.(error instanceof Error ? error.message : "Failed to install skill.", "error")
		} finally {
			setInstalling(false)
		}
	}

	const handleUninstallSkill = async (plugin: SkillHubPluginItem) => {
		setUninstallingSkill(plugin.name)
		try {
			const matchedSkill =
				installedMap.get(plugin.name.toLowerCase()) ||
				(plugin.owner
					? installedMap.get(`${plugin.owner}/${plugin.name}`.toLowerCase())
					: undefined)

			await window.api.invoke({
				type: "uninstallSkill",
				name: matchedSkill?.name || plugin.name,
			})

			// Refresh installed skills
			const installed = (await window.api.invoke({
				type: "getInstalledSkills",
			})) as Skill[]
			if (Array.isArray(installed)) setInstalledSkills(installed)
			if (detailPlugin?.name === plugin.name) {
				setDetailPlugin(null)
			}
			showToast?.(`${plugin.name} uninstalled successfully.`, "success")
		} catch (error) {
			showToast?.(error instanceof Error ? error.message : "Failed to uninstall skill.", "error")
		} finally {
			setUninstallingSkill(null)
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{/* Top Navigation Tab Bar */}
			<div
				role="tablist"
				aria-label="Skills Navigation"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 20,
					borderBottom: "1px solid var(--border-muted)",
					marginBottom: 0,
				}}
			>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "marketplace"}
					onClick={() => setActiveTab("marketplace")}
					style={{
						padding: "4px 2px 8px",
						fontSize: 13,
						fontWeight: activeTab === "marketplace" ? 600 : 500,
						color: activeTab === "marketplace" ? "var(--text)" : "var(--muted)",
						background: "transparent",
						border: "none",
						borderBottom:
							activeTab === "marketplace"
								? "2px solid var(--accent)"
								: "2px solid transparent",
						cursor: "pointer",
						transition: "all 0.15s ease",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<span>Skills Marketplace</span>
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={activeTab === "project"}
					onClick={() => setActiveTab("project")}
					style={{
						padding: "4px 2px 8px",
						fontSize: 13,
						fontWeight: activeTab === "project" ? 600 : 500,
						color: activeTab === "project" ? "var(--text)" : "var(--muted)",
						background: "transparent",
						border: "none",
						borderBottom:
							activeTab === "project"
								? "2px solid var(--accent)"
								: "2px solid transparent",
						cursor: "pointer",
						transition: "all 0.15s ease",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<span>Project Skills</span>
				</button>
			</div>

			{activeTab === "project" ? (
				/* Project Skills Tab Content */
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							lineHeight: 1.4,
						}}
					>
						Configure directory paths to scan for project-specific skills and SKILL.md definitions.
					</div>

					<div
						style={{
							padding: "4px 0 10px",
								borderBottom: "1px solid var(--border-muted)",
								display: "flex",
								flexDirection: "column",
								gap: 10,
							}}
						>
							<div>
								<div
									style={{
										fontSize: 13,
										fontWeight: 500,
										color: "var(--text)",
										marginBottom: 4,
									}}
								>
									Skills Directories
								</div>
								<div
									style={{
										fontSize: 11,
										color: "var(--muted)",
										marginBottom: 8,
										lineHeight: 1.4,
									}}
								>
									Configured directory paths (relative to project root) to scan for custom skills and SKILL.md definitions.
								</div>

								{/* Directory badges list */}
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 6,
										marginBottom: 8,
										alignItems: "center",
									}}
								>
									{DEFAULT_PROJECT_SKILL_DIRS.map((dir) => (
										<span
											key={dir}
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 4,
												padding: "3px 8px",
												fontSize: 11,
												fontFamily: "monospace",
												color: "var(--muted)",
												background: "var(--bg-surface)",
												border: "1px solid var(--border)",
												borderRadius: 4,
											}}
										>
											{dir}
											<span style={{ fontSize: 9, color: "var(--dim)" }}>(default)</span>
										</span>
									))}

									{customDirs.map((dir) => (
										<span
											key={dir}
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 6,
												padding: "3px 8px",
												fontSize: 11,
												fontFamily: "monospace",
												color: "var(--accent)",
												background: "var(--selected-bg)",
												border: "1px solid var(--border-accent)",
												borderRadius: 4,
											}}
										>
											{dir}
											<button
												type="button"
												onClick={() => handleRemoveCustomDir(dir)}
												title={`Remove ${dir}`}
												aria-label={`Remove ${dir}`}
												style={{
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													background: "transparent",
													border: "none",
													color: "var(--accent)",
													cursor: "pointer",
													padding: 0,
													width: 14,
													height: 14,
												}}
											>
												<CloseIcon size={10} />
											</button>
										</span>
									))}
								</div>

								{/* Input to add a new custom directory */}
								<form
									onSubmit={handleAddCustomDir}
									style={{ display: "flex", gap: 6, alignItems: "center" }}
								>
									<input
										type="text"
										value={newDirInput}
										onChange={(e) => setNewDirInput(e.target.value)}
										placeholder="Add custom skills directory (e.g. skills or custom-skills)..."
										style={{
											flex: 1,
											maxWidth: 360,
											padding: "5px 10px",
											fontSize: 12,
											fontFamily: "inherit",
											background: "var(--bg-elevated)",
											border: "1px solid var(--border)",
											borderRadius: 6,
											color: "var(--text)",
											outline: "none",
										}}
									/>
									<button
										type="submit"
										disabled={!newDirInput.trim()}
										style={{
											padding: "5px 12px",
											fontSize: 11,
											fontWeight: 500,
											fontFamily: "inherit",
											color: "var(--on-accent)",
											background: "var(--accent)",
											border: "1px solid var(--border-accent)",
											borderRadius: 6,
											cursor: newDirInput.trim() ? "pointer" : "default",
											opacity: newDirInput.trim() ? 1 : 0.6,
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
										}}
									>
										<PlusIcon size={12} />
										Add
									</button>
								</form>
							</div>
						</div>
					</div>
			) : (
				/* Skills Marketplace Tab Content */
				<>
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							lineHeight: 1.4,
						}}
					>
						Discover, install, and audit skills from SkillHub and manage project skill extensions.
					</div>

			{/* Toolbar: Source Selector + Add/Remove buttons + Search Bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					width: "100%",
				}}
			>
				{/* Source Dropdown */}
				<div
					style={{
						position: "relative",
						display: "inline-flex",
						alignItems: "center",
						flexShrink: 0,
					}}
				>
					<span
						style={{
							position: "absolute",
							left: 8,
							display: "flex",
							alignItems: "center",
							pointerEvents: "none",
							color: "var(--accent)",
							zIndex: 1,
						}}
					>
						<GlobeIcon size={13} />
					</span>
					<select
						value={activeSourceUrl}
						onChange={(e) => handleSelectSource(e.target.value)}
						title="Select SkillHub source"
						aria-label="Select SkillHub source"
						style={{
							height: 32,
							padding: "0 24px 0 26px",
							fontSize: 12,
							fontWeight: 500,
							fontFamily: "inherit",
							color: "var(--text)",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							cursor: "pointer",
							outline: "none",
							appearance: "none",
							WebkitAppearance: "none",
						}}
					>
						{sources.map((s) => (
							<option key={s.url} value={s.url}>
								{s.name}
							</option>
						))}
					</select>
					<span
						style={{
							position: "absolute",
							right: 8,
							display: "flex",
							alignItems: "center",
							pointerEvents: "none",
							color: "var(--muted)",
						}}
					>
						<ChevronDownIcon size={12} />
					</span>
				</div>

				{/* Add Source Button */}
				<button
					type="button"
					onClick={() => setIsAddSourceOpen(true)}
					title="Add custom SkillHub source"
					aria-label="Add custom SkillHub source"
					style={{
						width: 32,
						height: 32,
						flexShrink: 0,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						color: "var(--text)",
						cursor: "pointer",
						transition: "all 0.15s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor = "var(--bg-hover)"
						e.currentTarget.style.color = "var(--accent)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = "var(--bg-elevated)"
						e.currentTarget.style.color = "var(--text)"
					}}
				>
					<PlusIcon size={13} />
				</button>

				{/* Remove Source Button */}
				<button
					type="button"
					onClick={() => setIsManageSourcesOpen(true)}
					title="Manage / remove custom SkillHub sources"
					aria-label="Manage / remove custom SkillHub sources"
					style={{
						width: 32,
						height: 32,
						flexShrink: 0,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						color: "var(--muted)",
						cursor: "pointer",
						transition: "all 0.15s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor = "var(--bg-hover)"
						e.currentTarget.style.color = "var(--error)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = "var(--bg-elevated)"
						e.currentTarget.style.color = "var(--muted)"
					}}
				>
					<MinusIcon size={13} />
				</button>

				{/* Search Bar */}
				<div
					style={{
						position: "relative",
						flex: 1,
						display: "flex",
						alignItems: "center",
					}}
				>
					<span
						style={{
							position: "absolute",
							left: 10,
							display: "flex",
							alignItems: "center",
							pointerEvents: "none",
							color: "var(--muted)",
						}}
					>
						<SearchIcon size={14} />
					</span>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault()
								setCommittedSearch(searchQuery.trim())
							} else if (e.key === "Escape") {
								handleClearSearch()
							}
						}}
						placeholder="Search skills by keyword or author..."
						style={{
							width: "100%",
							height: 32,
							padding: searchQuery ? "0 32px 0 32px" : "0 12px 0 32px",
							fontSize: 12,
							fontFamily: "inherit",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							outline: "none",
							boxSizing: "border-box",
						}}
					/>
					{searchQuery.length > 0 && (
						<button
							type="button"
							onClick={handleClearSearch}
							title="Clear search"
							aria-label="Clear search"
							style={{
								position: "absolute",
								right: 8,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 20,
								height: 20,
								padding: 0,
								background: "transparent",
								border: "none",
								color: "var(--muted)",
								cursor: "pointer",
								borderRadius: "50%",
							}}
						>
							<CloseIcon size={12} />
						</button>
					)}
				</div>
			</div>

			{/* Category Filter Pills */}
			<div
				style={{
					display: "flex",
					gap: 6,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				{categories.map((cat) => {
					const isSelected = selectedCategory === cat.key
					return (
						<button
							key={cat.key}
							type="button"
							onClick={() => setSelectedCategory(cat.key)}
							style={{
								padding: "4px 10px",
								fontSize: 11,
								fontFamily: "inherit",
								fontWeight: isSelected ? 600 : 500,
								color: isSelected ? "var(--accent)" : "var(--muted)",
								background: isSelected ? "var(--selected-bg)" : "var(--bg-surface)",
								border: `1px solid ${isSelected ? "var(--border-accent)" : "var(--border)"}`,
								borderRadius: 6,
								cursor: "pointer",
								transition: "background 0.15s, color 0.15s, border-color 0.15s",
							}}
						>
							{cat.displayName}
						</button>
					)
				})}
			</div>

			{/* Subtitle count banner & refresh action */}
			<div
				style={{
					fontSize: 11,
					color: "var(--muted)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "2px 0",
				}}
			>
				<span>
					Found {displayedTotal} open source skills from{" "}
					{sources.find((s) => s.url === activeSourceUrl)?.name || "SkillHub"}
				</span>
				<button
					type="button"
					onClick={() => fetchPlugins()}
					disabled={loading}
					title={loading ? "Refreshing skills..." : "Refresh skills"}
					aria-label="Refresh skills"
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 24,
						height: 24,
						background: "transparent",
						border: "none",
						color: loading ? "var(--accent)" : "var(--muted)",
						fontSize: 11,
						fontFamily: "inherit",
						cursor: loading ? "default" : "pointer",
						padding: 0,
						borderRadius: 4,
						transition: "color 0.15s ease",
					}}
				>
					<RefreshIcon
						size={13}
						style={{
							animation: loading ? "spin 0.8s linear infinite" : undefined,
						}}
					/>
				</button>
			</div>

			{/* Plugin Cards Grid with smooth cross-fade transitions */}
			<div
				style={{
					opacity: fadeState === "fading-out" ? 0 : 1,
					transform:
						fadeState === "fading-out" ? "translateY(4px)" : "translateY(0)",
					transition: "opacity 0.16s ease-in-out, transform 0.16s ease-in-out",
				}}
			>
				{displayedPlugins.length === 0 && !loading ? (
					sourceError ? (
						<div
							style={{
								padding: "36px 20px",
								textAlign: "center",
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 10,
								background: "var(--bg-surface)",
								borderRadius: 8,
								border: "1px dashed var(--error)",
							}}
						>
							<ShieldAlertIcon size={24} stroke="var(--error)" />
							<div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
								Failed to load skills from{" "}
								{sources.find((s) => s.url === activeSourceUrl)?.name || activeSourceUrl}
							</div>
							<div
								style={{
									fontSize: 12,
									color: "var(--error)",
									maxWidth: 460,
									lineHeight: 1.4,
								}}
							>
								{sourceError}
							</div>
							<div style={{ display: "flex", gap: 10, marginTop: 4 }}>
								<button
									type="button"
									onClick={() => fetchPlugins()}
									style={{
										padding: "5px 14px",
										fontSize: 11,
										fontWeight: 500,
										color: "var(--on-accent)",
										background: "var(--accent)",
										border: "none",
										borderRadius: 6,
										cursor: "pointer",
									}}
								>
									Retry
								</button>
								{activeSourceUrl !== DEFAULT_SKILLHUB_API_BASE && (
									<button
										type="button"
										onClick={() => handleSelectSource(DEFAULT_SKILLHUB_API_BASE)}
										style={{
											padding: "5px 14px",
											fontSize: 11,
											color: "var(--text)",
											background: "var(--bg-elevated)",
											border: "1px solid var(--border)",
											borderRadius: 6,
											cursor: "pointer",
										}}
									>
										Switch to skillhub.cn
									</button>
								)}
							</div>
						</div>
					) : (
						<div
							style={{
								padding: 36,
								textAlign: "center",
								color: "var(--dim)",
								fontSize: 12,
								background: "var(--bg-surface)",
								borderRadius: 8,
								border: "1px dashed var(--border)",
							}}
						>
							No skills found matching the criteria.
						</div>
					)
				) : (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
							gap: 12,
						}}
					>
						{displayedPlugins.map((plugin) => {
							const key = `${plugin.owner}/${plugin.name}`.toLowerCase()
							const installed =
								installedMap.has(key) ||
								installedMap.has(plugin.name.toLowerCase())
							const matchedSkill =
								installedMap.get(key) ||
								installedMap.get(plugin.name.toLowerCase())
							const hasUpdate = Boolean(matchedSkill?.hasUpdate)

							return (
								<SkillCard
									key={plugin.fullName || plugin.name}
									plugin={plugin}
									installed={installed}
									hasUpdate={hasUpdate}
									uninstalling={uninstallingSkill === plugin.name}
									installing={installing && securityPlugin?.name === plugin.name}
									onDetails={(p) => setDetailPlugin(p)}
									onInstall={(p) => handleOpenInstallAudit(p)}
									onUninstall={(p) => handleUninstallSkill(p)}
								/>
							)
						})}
					</div>
				)}

				{/* Sentinel for Infinite Scroll Auto-Loading */}
				{hasMore && (
					<div
						ref={sentinelRef}
						data-testid="skills-infinite-sentinel"
						style={{ height: 10, margin: "6px 0" }}
					/>
				)}

				{/* Loading More Spinner Indicator */}
				{loadingMore && (
					<div
						data-testid="skills-loading-more"
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							padding: "6px 0",
							color: "var(--muted)",
							fontSize: 11,
						}}
					>
						<SpinnerIcon size={12} strokeWidth={2} />
						<span>Loading more skills...</span>
					</div>
				)}

				{/* Error State with Load More / Retry Button */}
				{loadMoreError && (
					<div
						data-testid="skills-load-more-error"
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							padding: "16px 0",
						}}
					>
						<span style={{ fontSize: 12, color: "var(--error)" }}>
							{loadMoreError}
						</span>
						<button
							type="button"
							onClick={() => handleLoadMore()}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "5px 14px",
								fontSize: 12,
								fontWeight: 500,
								color: "var(--text)",
								background: "var(--bg-elevated)",
								border: "1px solid var(--border)",
								borderRadius: 6,
								cursor: "pointer",
								transition: "background 0.15s, border-color 0.15s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = "var(--bg-elevated)"
							}}
						>
							<RefreshIcon size={12} />
							<span>Load More</span>
						</button>
					</div>
				)}

				{/* End of list reached */}
				{!hasMore && displayedPlugins.length > 0 && !loading && (
					<div
						data-testid="skills-all-loaded"
						style={{
							textAlign: "center",
							padding: "16px 0 6px",
							color: "var(--dim)",
							fontSize: 11,
						}}
					>
						{paginationEnded && displayedPlugins.length < displayedTotal
							? `Loaded ${displayedPlugins.length} of ${displayedTotal} skills`
							: `All ${displayedTotal} skills loaded`}
					</div>
				)}
			</div>
				</>
			)}

			{/* Modals */}
			<SkillDetailModal
				isOpen={detailPlugin !== null}
				plugin={detailPlugin}
				sourceUrl={activeSourceUrl}
				source={sources.find((s) => s.url === activeSourceUrl) || null}
				onClose={() => setDetailPlugin(null)}
				onInstall={(p) => {
					setDetailPlugin(null)
					handleOpenInstallAudit(p)
				}}
				onUninstall={(p) => handleUninstallSkill(p)}
				uninstalling={
					detailPlugin ? uninstallingSkill === detailPlugin.name : false
				}
								installing={installing}
				installed={
					detailPlugin
						? installedMap.has(
								`${detailPlugin.owner}/${detailPlugin.name}`.toLowerCase(),
							) || installedMap.has(detailPlugin.name.toLowerCase())
						: false
				}
			/>

			<SkillSecurityModal
				isOpen={securityPlugin !== null}
				plugin={securityPlugin}
				report={securityReport}
				onConfirm={handleConfirmInstall}
				installing={installing}
				onCancel={() => {
					setSecurityPlugin(null)
					setSecurityReport(null)
				}}
			/>

			<AddSourceModal
				isOpen={isAddSourceOpen}
				onClose={() => setIsAddSourceOpen(false)}
				onSuccess={(newUrl, domainName) => {
					const newSource: SkillHubSource = {
						id: newUrl,
						name: domainName,
						url: newUrl,
						isBuiltin: false,
						createdAt: Date.now(),
					}
					setSources((prev) => {
						const exists = prev.some(
							(s) => s.url.toLowerCase() === newUrl.toLowerCase(),
						)
						return exists ? prev : [...prev, newSource]
					})
					handleSelectSource(newUrl)
				}}
				showToast={showToast}
			/>

			<ManageSourcesModal
				isOpen={isManageSourcesOpen}
				onClose={() => setIsManageSourcesOpen(false)}
				sources={sources}
				activeSourceUrl={activeSourceUrl}
				onSourcesUpdated={(updatedSources, newActiveUrl) => {
					setSources(updatedSources)
					if (newActiveUrl !== activeSourceUrl) {
						handleSelectSource(newActiveUrl)
					}
				}}
				showToast={showToast}
			/>
		</div>
	)
}
