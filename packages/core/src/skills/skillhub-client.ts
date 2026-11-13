import type {
	SkillHubCategory,
	SkillHubListResponse,
	SkillHubPluginItem,
	SkillHubSource,
} from "./types.js"
export {
	DEFAULT_SKILLHUB_API_BASE,
	DEFAULT_SKILLHUB_SOURCES,
} from "./market-sources.js"
import { DEFAULT_SKILLHUB_API_BASE } from "./market-sources.js"

export const CATEGORY_ENGLISH_NAMES: Record<string, string> = {
	all: "All",
	"office-efficiency": "Office & Efficiency",
	"content-creation": "Content Creation",
	"dev-programming": "Development & Coding",
	"data-analysis": "Data Analysis",
	"design-media": "Design & Media",
	"ai-agent": "AI Agent",
	"knowledge-management": "Knowledge Management",
	"business-ops": "Business & Operations",
	education: "Education & Learning",
	professional: "Professional Services",
	"it-ops-security": "IT & Security",
	"life-service": "Life & Services",
	"pay-skill": "Paid Skills",
	// ClawHub categories
	channels: "Channels",
	models: "Models",
	"agent-runtimes": "Agent runtimes",
	memory: "Memory",
	context: "Context",
	voice: "Voice",
	web: "Web",
	"computer-use": "Computer use",
	media: "Media",
	security: "Security",
	integrations: "Integrations",
	"developer-tools": "Developer tools",
	infrastructure: "Infrastructure",
	"documents-files": "Documents & files",
	"inbox-collaboration": "Inbox & collaboration",
	productivity: "Productivity",
	scheduling: "Scheduling",
	"finance-payments": "Finance & payments",
	"sales-marketing": "Sales & marketing",
	"data-analytics": "Data & analytics",
	"agent-orchestration": "Agent orchestration",
	research: "Research",
	other: "Other",
	// ClawHub legacy categories
	"model-inference": "Model Inference",
	"agent-workflow": "Workflow",
	"web-tools": "Web & Tools",
	client: "Client",
	"admin-security": "Security",
	"fun-dressup": "Styling & Personas",
	// Common ClawHub topics
	"self-improvement": "Self Improvement",
	"self-improving": "Self Improvement",
	"web-search": "Web Search",
	workflow: "Workflow",
	automation: "Automation",
	development: "Development",
	coding: "Coding",
	agents: "AI Agent",
	agent: "AI Agent",
}

export const CLAWHUB_CATEGORY_SEARCH_MAP: Record<string, string> = {
	models: "model",
	"agent-runtimes": "agent",
	memory: "memory",
	context: "context",
	voice: "voice",
	web: "web",
	"computer-use": "browser automation",
	media: "media",
	security: "security",
	integrations: "integration",
	"developer-tools": "developer",
	infrastructure: "infrastructure",
	"documents-files": "document",
	"inbox-collaboration": "collaboration",
	productivity: "productivity",
	scheduling: "calendar",
	"finance-payments": "finance",
	"sales-marketing": "marketing",
	"data-analytics": "data analytics",
	"agent-orchestration": "orchestration",
	research: "research",
	other: "tool",
	// Legacy
	"model-inference": "model",
	"agent-workflow": "workflow",
	"web-tools": "web",
	client: "client",
	"admin-security": "security",
	"fun-dressup": "persona",
}

export const FALLBACK_CATEGORIES: SkillHubCategory[] = [
	{ key: "all", displayName: "All" },
	{ key: "dev-programming", displayName: "Development & Coding" },
	{ key: "ai-agent", displayName: "AI Agent" },
	{ key: "design-media", displayName: "Design & Media" },
	{ key: "office-efficiency", displayName: "Office & Efficiency" },
	{ key: "content-creation", displayName: "Content Creation" },
	{ key: "data-analysis", displayName: "Data Analysis" },
	{ key: "knowledge-management", displayName: "Knowledge Management" },
	{ key: "business-ops", displayName: "Business & Operations" },
	{ key: "it-ops-security", displayName: "IT & Security" },
]

export interface SkillHubClientOptions {
	apiBase?: string
	timeoutMs?: number
}

export interface ListPluginsOptions {
	page?: number
	pageSize?: number
	categoryKey?: string
	search?: string
	sort?: string
	order?: "asc" | "desc"
}

/**
 * Normalizes raw skill/plugin item from diverse SkillHub sources (SkillHub, ClawHub, custom).
 * Guarantees name, owner, stars, etc. are always defined and never nullish.
 */
export function normalizeSkillItem(
	rawItem: Partial<SkillHubPluginItem> & Record<string, any>,
): SkillHubPluginItem {
	const slug = String(
		rawItem.slug ||
			rawItem.native?.skill?.slug ||
			rawItem.name ||
			rawItem.id ||
			"",
	).trim()
	const name = slug
	const displayName = String(
		rawItem.displayName ||
			rawItem.native?.skill?.displayName ||
			rawItem.title ||
			rawItem.name ||
			slug,
	)
	const nsObj =
		typeof rawItem.namespace === "object" && rawItem.namespace !== null
			? rawItem.namespace
			: undefined
	const nsHandle =
		typeof rawItem.namespace === "string" ? rawItem.namespace : nsObj?.handle

	const pub = rawItem.publisher as Record<string, any> | undefined
	const ownerObj =
		typeof rawItem.owner === "object" && rawItem.owner !== null
			? (rawItem.owner as Record<string, any>)
			: undefined
	const nativeOwner = rawItem.native?.owner as Record<string, any> | undefined

	const owner = String(
		pub?.displayName ||
			pub?.handle ||
			pub?.name ||
			rawItem.ownerHandle ||
			ownerObj?.handle ||
			ownerObj?.displayName ||
			nativeOwner?.handle ||
			nativeOwner?.displayName ||
			nsObj?.displayName ||
			nsHandle ||
			(typeof rawItem.owner === "string" ? rawItem.owner : "") ||
			rawItem.ownerName ||
			rawItem.author ||
			(rawItem.fullName ? rawItem.fullName.split("/")[0] : "") ||
			"",
	).trim()
	const fullName = String(
		rawItem.fullName ||
			rawItem.install?.reference ||
			nsObj?.canonicalName ||
			(owner && name ? `${owner}/${name}` : name),
	)
	const description = String(
		rawItem.description_zh ||
			rawItem.description ||
			rawItem.summary_zh ||
			rawItem.summary ||
			rawItem.native?.skill?.summary ||
			rawItem.desc ||
			"",
	)
	const stars =
		typeof rawItem.stars === "number"
			? rawItem.stars
			: typeof rawItem.stats?.stars === "number"
				? rawItem.stats.stars
				: typeof rawItem.native?.skill?.stats?.stars === "number"
					? rawItem.native.skill.stats.stars
					: 0
	const downloads =
		typeof rawItem.downloads === "number"
			? rawItem.downloads
			: typeof rawItem.stats?.downloads === "number"
				? rawItem.stats.downloads
				: typeof rawItem.native?.skill?.stats?.downloads === "number"
					? rawItem.native.skill.stats.downloads
					: 0
	const forks =
		typeof rawItem.forks === "number"
			? rawItem.forks
			: typeof rawItem.stats?.forks === "number"
				? rawItem.stats.forks
				: typeof rawItem.native?.skill?.stats?.forks === "number"
					? rawItem.native.skill.stats.forks
					: 0
	const openIssues =
		typeof rawItem.openIssues === "number"
			? rawItem.openIssues
			: typeof rawItem.stats?.comments === "number"
				? rawItem.stats.comments
				: typeof rawItem.native?.skill?.stats?.comments === "number"
					? rawItem.native.skill.stats.comments
					: 0

	const rawTopics = Array.isArray(rawItem.topics)
		? rawItem.topics
		: Array.isArray(rawItem.native?.skill?.topics)
			? rawItem.native.skill.topics
			: Array.isArray(rawItem.tags)
				? rawItem.tags
				: []
	const topics = rawTopics.filter(Boolean).map(String)

	const rawCategories = Array.isArray(rawItem.categories)
		? rawItem.categories
		: Array.isArray(rawItem.native?.skill?.categories)
			? rawItem.native.skill.categories
			: []

	let categoryKey = String(rawItem.categoryKey || rawItem.category || "").trim()
	if (!categoryKey && rawCategories.length > 0) {
		categoryKey = String(rawCategories[0]).trim()
	}
	if (!categoryKey && topics.length > 0) {
		categoryKey = String(topics[0]).trim()
	}

	const avatarUrl = String(
		rawItem.avatarUrl ||
			rawItem.iconUrl ||
			pub?.image ||
			ownerObj?.image ||
			nativeOwner?.image ||
			"",
	)
	const homepage = String(rawItem.homepage || rawItem.upstream_url || "")
	const repositoryUrl = String(
		rawItem.repositoryUrl ||
			rawItem.repository ||
			rawItem.repoUrl ||
			rawItem.native?.skill?.repositoryUrl ||
			"",
	).trim()

	// Resolve namespace if present in namespace, publisher, canonicalName, or homepage
	let namespace = rawItem.namespace
	if (!namespace && rawItem.canonicalName) {
		const match = String(rawItem.canonicalName).match(/^@?([^/]+)\//)
		if (match) {
			namespace = {
				handle: match[1],
				canonicalName: rawItem.canonicalName,
			}
		}
	} else if (!namespace && rawItem.publisher?.orgId) {
		namespace = {
			handle: rawItem.publisher.orgId,
			canonicalName: `@${rawItem.publisher.orgId}/${name}`,
		}
	} else if (!namespace && rawItem.orgId) {
		namespace = {
			handle: rawItem.orgId,
			canonicalName: `@${rawItem.orgId}/${name}`,
		}
	} else if (!namespace && rawItem.homepage) {
		const match = String(rawItem.homepage).match(
			/skillhub\.cn\/([^/]+)\/([^/]+)/,
		)
		if (
			match &&
			match[1] !== "skills" &&
			match[1] !== "plugins" &&
			match[1] !== "api"
		) {
			namespace = {
				handle: match[1],
				canonicalName: `@${match[1]}/${name}`,
			}
		}
	}

	const orgId = rawItem.orgId || rawItem.publisher?.orgId

	return {
		...rawItem,
		name,
		slug,
		displayName,
		owner,
		fullName,
		description,
		stars,
		downloads,
		forks,
		openIssues,
		topics,
		categoryKey,
		avatarUrl,
		homepage,
		repositoryUrl,
		namespace,
		publisher: rawItem.publisher,
		canonicalName: rawItem.canonicalName,
		orgId,
	} as SkillHubPluginItem
}

/**
 * Safely sorts skill items with highest stars first, and alphabetically if stars are tied.
 * Never throws TypeError on undefined name.
 */
export function compareSkillsByStars(
	a: Partial<SkillHubPluginItem> & Record<string, any>,
	b: Partial<SkillHubPluginItem> & Record<string, any>,
): number {
	const starsA =
		typeof a?.stars === "number"
			? a.stars
			: typeof a?.stats?.stars === "number"
				? a.stats.stars
				: 0
	const starsB =
		typeof b?.stars === "number"
			? b.stars
			: typeof b?.stats?.stars === "number"
				? b.stats.stars
				: 0
	if (starsB !== starsA) {
		return starsB - starsA
	}
	const nameA = String(a?.displayName || a?.name || a?.slug || a?.id || "")
	const nameB = String(b?.displayName || b?.name || b?.slug || b?.id || "")
	return nameA.localeCompare(nameB)
}

/**
 * Detects whether an item from the marketplace represents a plugin rather than a skill.
 * Ensures that the skills list only displays actual skills, filtering out plugins.
 */
export function isPluginItem(
	item: Partial<SkillHubPluginItem> & Record<string, any>,
): boolean {
	if (!item) return false

	// Explicit type, kind, or family indicating a plugin
	const type = String(item.type || item.kind || "").toLowerCase()
	if (type === "plugin" || type === "channel" || type === "channel-plugin") {
		return true
	}
	if (item.isPlugin === true) return true
	if (item.family === "code-plugin") return true

	// Channel or plugin categories
	const categoryKey = String(
		item.categoryKey || item.category || "",
	).toLowerCase()
	if (
		categoryKey === "plugin" ||
		categoryKey === "plugins" ||
		categoryKey === "channels"
	) {
		return true
	}
	if (Array.isArray(item.categories)) {
		if (
			item.categories.some(
				(c: string) =>
					String(c).toLowerCase() === "channels" ||
					String(c).toLowerCase() === "plugins",
			)
		) {
			return true
		}
	}

	const topics = Array.isArray(item.topics)
		? item.topics.map((t) => String(t).toLowerCase().trim())
		: []
	const rawName = String(item.name || item.slug || "")
		.toLowerCase()
		.trim()

	// Direct channel/plugin topics
	if (
		topics.includes("channel-plugin") ||
		topics.includes("agent-plugin") ||
		topics.includes("channel")
	) {
		return true
	}

	// Skill topics or skill in name
	const hasSkillTopic = topics.some((t) => t.includes("skill"))
	const hasSkillName = rawName.includes("skill")

	// If marked with generic/dsh plugin topics but does not mention skill anywhere
	const hasPluginTopic = topics.some(
		(t) => t === "dsh-plugin" || t === "plugin" || t === "plugins",
	)
	if (hasPluginTopic && !hasSkillTopic && !hasSkillName) {
		return true
	}

	return false
}

/** Match a ClawHub category against the item's declared taxonomy. */
function matchesCategory(
	item: SkillHubPluginItem,
	categoryKey: string,
): boolean {
	const wanted = categoryKey.toLowerCase().trim()
	const aliases = new Set(
		[wanted, CLAWHUB_CATEGORY_SEARCH_MAP[wanted]]
			.filter(Boolean)
			.flatMap((value) => String(value).toLowerCase().split(/\s+/)),
	)
	const raw = item as any
	const values = [
		item.categoryKey,
		raw.category,
		...(Array.isArray(raw.categories) ? raw.categories : []),
		...(Array.isArray(raw.native?.skill?.categories)
			? raw.native.skill.categories
			: []),
		...(Array.isArray(item.topics) ? item.topics : []),
	].map((value) => String(value).toLowerCase().trim())
	return values.some(
		(value) =>
			value === wanted ||
			aliases.has(value) ||
			value.split(/[\s/_-]+/).some((part) => aliases.has(part)),
	)
}

export class SkillHubClient {
	readonly apiBase: string
	readonly timeoutMs: number
	private clawhubCursors = new Map<number, string>()
	private clawhubTotal: number | null = null

	constructor(options: SkillHubClientOptions = {}) {
		this.apiBase = (options.apiBase || DEFAULT_SKILLHUB_API_BASE).replace(
			/\/+$/,
			"",
		)
		this.timeoutMs = options.timeoutMs ?? 10000
	}

	async getCategories(): Promise<SkillHubCategory[]> {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

			// 1. Try SkillHub official /api/v1/categories endpoint first
			let response = await fetch(`${this.apiBase}/api/v1/categories`, {
				signal: controller.signal,
				headers: {
					Accept: "application/json",
				},
			}).catch(() => null)

			// 2. Fallback to /api/v1/skills/categories
			if (!response || !response.ok) {
				response = await fetch(`${this.apiBase}/api/v1/skills/categories`, {
					signal: controller.signal,
					headers: {
						Accept: "application/json",
					},
				}).catch(() => null)
			}

			// 3. Fallback to /api/v1/plugins/categories
			if (!response || !response.ok) {
				response = await fetch(`${this.apiBase}/api/v1/plugins/categories`, {
					signal: controller.signal,
					headers: {
						Accept: "application/json",
					},
				}).catch(() => null)
			}
			clearTimeout(timeoutId)

			if (!response || !response.ok) {
				return FALLBACK_CATEGORIES
			}

			const data = (await response.json()) as any
			const rawCategories = Array.isArray(data)
				? data
				: data?.items || data?.categories || data?.data || []

			if (!Array.isArray(rawCategories) || rawCategories.length === 0) {
				return FALLBACK_CATEGORIES
			}

			const mappedCategories: SkillHubCategory[] = rawCategories
				.filter((cat: any) => {
					const key = String(cat.key || cat.slug || "").toLowerCase()
					return key !== "plugin" && key !== "plugins" && key !== "channels"
				})
				.map((cat: any) => {
					const key = String(cat.key || cat.slug || "")
					const displayName =
						CATEGORY_ENGLISH_NAMES[key] ||
						cat.name ||
						cat.displayName ||
						cat.label ||
						key
					return { key, displayName }
				})

			return [{ key: "all", displayName: "All" }, ...mappedCategories]
		} catch {
			return FALLBACK_CATEGORIES
		}
	}

	async listPlugins(
		options: ListPluginsOptions = {},
	): Promise<SkillHubListResponse> {
		const page = options.page ?? 1
		const pageSize = options.pageSize ?? 24

		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

			const sort = options.sort || "stars"
			const order = options.order || "desc"

			const isClawHub =
				this.apiBase.includes("clawhub.ai") || this.apiBase.includes("clawhub")

			// Strategy 1: SkillHub official /api/skills endpoint (for skillhub.cn / api.skillhub.cn)
			// Strictly separates skills from plugins: returns clean skills with 228,000+ total
			if (!isClawHub) {
				const skillsParams = new URLSearchParams()
				skillsParams.set("page", String(page))
				skillsParams.set("pageSize", String(pageSize))
				skillsParams.set("sortBy", sort)
				skillsParams.set("order", order)

				if (options.categoryKey && options.categoryKey !== "all") {
					skillsParams.set("category", options.categoryKey)
				}
				if (options.search && options.search.trim()) {
					const term = options.search.trim()
					skillsParams.set("keyword", term)
				}

				const response = await fetch(
					`${this.apiBase}/api/skills?${skillsParams.toString()}`,
					{
						signal: controller.signal,
						headers: {
							Accept: "application/json",
						},
					},
				).catch(() => null)

				if (response && response.ok) {
					const data = (await response.json()) as any
					if (
						data &&
						data.code === 0 &&
						data.data &&
						Array.isArray(data.data.skills)
					) {
						clearTimeout(timeoutId)
						const rawSkills = data.data.skills
						const items = rawSkills.map(normalizeSkillItem)
						const total =
							typeof data.data.total === "number"
								? data.data.total
								: items.length

						return {
							items,
							page,
							pageSize,
							total,
						}
					}
				}
			}

			// Strategy 2: Specialized handler for ClawHub (clawhub.ai)
			if (isClawHub) {
				const hasSearch = Boolean(options.search && options.search.trim())
				const hasCategory = Boolean(
					options.categoryKey && options.categoryKey !== "all",
				)

				// When category or search query is specified on ClawHub, query /api/v1/search
				if (hasSearch || hasCategory) {
					let q = ""
					if (hasSearch && hasCategory) {
						const catTerm =
							CLAWHUB_CATEGORY_SEARCH_MAP[options.categoryKey!] ||
							options.categoryKey!
						q = `${options.search!.trim()} ${catTerm}`
					} else if (hasCategory) {
						q =
							CLAWHUB_CATEGORY_SEARCH_MAP[options.categoryKey!] ||
							options.categoryKey!
					} else {
						q = options.search!.trim()
					}

					const searchRes = await fetch(
						`${this.apiBase}/api/v1/search?q=${encodeURIComponent(q)}&limit=100`,
						{
							signal: controller.signal,
							headers: { Accept: "application/json" },
						},
					).catch(() => null)

					clearTimeout(timeoutId)

					if (!searchRes || !searchRes.ok) {
						return {
							items: [],
							page,
							pageSize,
							total: 0,
							error: searchRes
								? `HTTP ${searchRes.status} (${searchRes.statusText || "Request failed"})`
								: "Failed to connect to ClawHub server.",
						}
					}

					const searchData = (await searchRes.json()) as any
					const rawResults = Array.isArray(searchData?.results)
						? searchData.results
						: []
					const normalizedResults = rawResults.map((item: any) =>
						normalizeSkillItem(item),
					)
					const filteredSkills = normalizedResults
						.filter((item: SkillHubPluginItem) => !isPluginItem(item))
						.filter(
							(item: SkillHubPluginItem) =>
								!hasCategory || matchesCategory(item, options.categoryKey!),
						)
						.sort(compareSkillsByStars)

					const total = filteredSkills.length
					const startIndex = (page - 1) * pageSize
					const pagedItems = filteredSkills.slice(
						startIndex,
						startIndex + pageSize,
					)

					return {
						items: pagedItems,
						page,
						pageSize,
						total,
					}
				}

				// When category is 'all' and no search query on ClawHub:
				// Fetch total count if not yet cached
				if (this.clawhubTotal === null) {
					try {
						const trendingRes = await fetch(
							`${this.apiBase}/api/v1/trending?kind=skills`,
							{ headers: { Accept: "application/json" } },
						).catch(() => null)
						if (trendingRes && trendingRes.ok) {
							const trendingData = (await trendingRes.json()) as any
							if (typeof trendingData?.totalItems === "number") {
								this.clawhubTotal = trendingData.totalItems
							}
						}
					} catch {}
					if (this.clawhubTotal === null) {
						this.clawhubTotal = 2689
					}
				}

				if (page === 1) {
					this.clawhubCursors.clear()
				}
				const cursor = page > 1 ? this.clawhubCursors.get(page) : undefined
				const cursorParam = cursor
					? `&cursor=${encodeURIComponent(cursor)}`
					: ""

				const skillsRes = await fetch(
					`${this.apiBase}/api/v1/skills?sort=${sort === "stars" ? "stars" : sort}&limit=${pageSize}${cursorParam}`,
					{
						signal: controller.signal,
						headers: { Accept: "application/json" },
					},
				).catch(() => null)

				clearTimeout(timeoutId)

				if (!skillsRes || !skillsRes.ok) {
					return {
						items: [],
						page,
						pageSize,
						total: 0,
						error: skillsRes
							? `HTTP ${skillsRes.status} (${skillsRes.statusText || "Request failed"})`
							: "Failed to connect to ClawHub server.",
					}
				}

				const skillsData = (await skillsRes.json()) as any
				let nextCursor =
					skillsData?.nextCursor ||
					skillsData?.next_cursor ||
					skillsData?.pagination?.nextCursor ||
					skillsData?.pagination?.next_cursor
				if (typeof nextCursor === "object" && nextCursor !== null) {
					nextCursor = nextCursor.cursor || nextCursor.token || nextCursor.value
				}
				const nextUrl =
					typeof skillsData?.pagination?.next === "string"
						? skillsData.pagination.next
						: typeof skillsData?.next === "string"
							? skillsData.next
							: ""
				if (!nextCursor && nextUrl) {
					try {
						nextCursor = new URL(nextUrl, this.apiBase).searchParams.get(
							"cursor",
						)
					} catch {}
				}
				if (typeof nextCursor === "string" && nextCursor.length > 0) {
					this.clawhubCursors.set(page + 1, nextCursor)
				}

				const rawItems = Array.isArray(skillsData?.items)
					? skillsData.items
					: []
				const items = rawItems
					.map(normalizeSkillItem)
					.filter((item: SkillHubPluginItem) => !isPluginItem(item))
					.sort(compareSkillsByStars)

				const total = this.clawhubTotal ?? items.length

				return {
					items,
					page,
					pageSize,
					total,
				}
			}

			// Strategy 3: Generic fallback for other custom sources
			const fallbackParams = new URLSearchParams()
			fallbackParams.set("page", String(page))
			fallbackParams.set("pageSize", String(pageSize))
			fallbackParams.set("page_size", String(pageSize))
			fallbackParams.set("limit", String(pageSize))

			if (options.categoryKey && options.categoryKey !== "all") {
				fallbackParams.set("category", options.categoryKey)
				fallbackParams.set("categoryKey", options.categoryKey)
			}
			if (options.search && options.search.trim()) {
				const term = options.search.trim()
				fallbackParams.set("q", term)
				fallbackParams.set("keyword", term)
			}

			fallbackParams.set("sort", sort)
			fallbackParams.set("sortBy", sort)
			fallbackParams.set("sort_by", sort)
			fallbackParams.set("order", order)
			fallbackParams.set("sort_order", order)

			// Try /api/v1/skills endpoint (returns skills, not plugins)
			let response = await fetch(
				`${this.apiBase}/api/v1/skills?${fallbackParams.toString()}`,
				{
					signal: controller.signal,
					headers: {
						Accept: "application/json",
					},
				},
			).catch(() => null)

			// If /api/v1/skills returns 404/405 or fails, fallback to /api/v1/plugins
			if (!response || !response.ok) {
				const fallbackRes = await fetch(
					`${this.apiBase}/api/v1/plugins?${fallbackParams.toString()}`,
					{
						signal: controller.signal,
						headers: {
							Accept: "application/json",
						},
					},
				).catch(() => null)
				if (fallbackRes && fallbackRes.ok) {
					response = fallbackRes
				}
			}
			clearTimeout(timeoutId)

			if (!response || !response.ok) {
				return {
					items: [],
					page,
					pageSize,
					total: 0,
					error: response
						? `HTTP ${response.status} (${response.statusText || "Request failed"})`
						: "Failed to connect to SkillHub server.",
				}
			}

			const data = (await response.json()) as any
			const rawList = Array.isArray(data)
				? data
				: data?.items || data?.skills || data?.plugins || data?.data || []

			const normalizedItems = (Array.isArray(rawList) ? rawList : []).map(
				normalizeSkillItem,
			)

			// Strictly filter out plugins when falling back to plugin endpoints
			const nonPluginItems = normalizedItems.filter(
				(item) => !isPluginItem(item),
			)

			const items = [...nonPluginItems].sort(compareSkillsByStars)
			const total =
				typeof data?.total === "number"
					? data.total
					: typeof data?.pagination?.total === "number"
						? data.pagination.total
						: items.length

			return {
				items,
				page: data?.page ?? page,
				pageSize: data?.pageSize ?? pageSize,
				total,
			}
		} catch (err: any) {
			return {
				items: [],
				page,
				pageSize,
				total: 0,
				error: err?.message || "Failed to connect to SkillHub server.",
			}
		}
	}
}

export interface ValidateSkillHubSourceResult {
	valid: boolean
	normalizedUrl?: string
	domain?: string
	step?: "domain" | "categories" | "plugins" | "schema"
	error?: string
}

/**
 * Validates whether a given URL points to a compliant open-source SkillHub service.
 * Performs progressive inspection:
 * 1. Domain format and network reachability
 * 2. REST API categories endpoint (/api/v1/plugins/categories)
 * 3. REST API plugins endpoint (/api/v1/plugins) and response structure
 */
export async function validateSkillHubSource(
	rawUrl: string,
	timeoutMs: number = 8000,
): Promise<ValidateSkillHubSourceResult> {
	let trimmed = String(rawUrl || "").trim()
	if (!trimmed) {
		return {
			valid: false,
			step: "domain",
			error: "Source URL cannot be empty.",
		}
	}
	if (!/^https?:\/\//i.test(trimmed)) {
		trimmed = `https://${trimmed}`
	}

	let parsedUrl: URL
	try {
		parsedUrl = new URL(trimmed)
		if (!parsedUrl.hostname) throw new Error("Invalid domain")
	} catch {
		return {
			valid: false,
			step: "domain",
			error: "Invalid URL or domain format.",
		}
	}

	const normalizedUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname.replace(/\/+$/, "")}`
	const domain = parsedUrl.hostname

	// Step 1: Check Domain / Accessibility
	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
		await fetch(normalizedUrl, {
			method: "HEAD",
			signal: controller.signal,
		}).catch(() => null)
		clearTimeout(timeoutId)
	} catch (err: any) {
		return {
			valid: false,
			step: "domain",
			error: `Domain accessibility check failed: ${err?.message || "Unable to reach server."}`,
		}
	}

	// Step 2: Check REST Endpoints (Categories)
	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
		const categoriesRes = await fetch(
			`${normalizedUrl}/api/v1/plugins/categories`,
			{
				signal: controller.signal,
				headers: { Accept: "application/json" },
			},
		)
		clearTimeout(timeoutId)

		if (!categoriesRes.ok && categoriesRes.status !== 404) {
			return {
				valid: false,
				step: "categories",
				error: `Categories endpoint returned HTTP ${categoriesRes.status} (${categoriesRes.statusText || "Error"}).`,
			}
		}
	} catch (err: any) {
		return {
			valid: false,
			step: "categories",
			error: `Failed to query categories endpoint: ${err?.message || "Request failed."}`,
		}
	}

	// Step 3: Check Plugins list endpoint & Schema
	const client = new SkillHubClient({ apiBase: normalizedUrl, timeoutMs })
	try {
		const pluginsRes = await client.listPlugins({ page: 1, pageSize: 5 })
		if (pluginsRes.error) {
			return {
				valid: false,
				step: "plugins",
				error: `Plugins API check failed: ${pluginsRes.error}`,
			}
		}
		if (!Array.isArray(pluginsRes.items)) {
			return {
				valid: false,
				step: "schema",
				error: "Server response does not contain a valid SkillHub items array.",
			}
		}
	} catch (err: any) {
		return {
			valid: false,
			step: "plugins",
			error: `Failed to query plugins API: ${err?.message || "Request failed."}`,
		}
	}

	return {
		valid: true,
		normalizedUrl,
		domain,
	}
}
