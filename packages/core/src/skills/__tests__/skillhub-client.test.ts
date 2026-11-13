import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
	SkillHubClient,
	DEFAULT_SKILLHUB_API_BASE,
} from "../skillhub-client.js"

describe("SkillHubClient", () => {
	let client: SkillHubClient
	const originalFetch = globalThis.fetch

	beforeEach(() => {
		client = new SkillHubClient({ apiBase: "https://api.skillhub.cn" })
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
		vi.restoreAllMocks()
	})

	it("uses default production API base", () => {
		const defaultClient = new SkillHubClient()
		expect(defaultClient.apiBase).toBe(DEFAULT_SKILLHUB_API_BASE)
	})

	it("fetches and maps categories with English display labels", async () => {
		const mockCategoriesResponse = {
			items: [
				{ key: "fun-dressup", displayName: "趣味换装" },
				{ key: "web-tools", displayName: "联网工具" },
				{ key: "memory", displayName: "记忆" },
				{ key: "agent-workflow", displayName: "工作流" },
				{ key: "model-inference", displayName: "模型推理" },
				{ key: "client", displayName: "客户端" },
				{ key: "admin-security", displayName: "安全管理" },
			],
		}

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockCategoriesResponse,
		} as Response)

		const categories = await client.getCategories()
		expect(categories.length).toBe(8) // "all" + 7 categories
		expect(categories[0]).toEqual({ key: "all", displayName: "All" })
		expect(
			categories.find((c) => c.key === "model-inference")?.displayName,
		).toBe("Model Inference")
		expect(
			categories.find((c) => c.key === "agent-workflow")?.displayName,
		).toBe("Workflow")
		expect(categories.find((c) => c.key === "web-tools")?.displayName).toBe(
			"Web & Tools",
		)
		expect(
			categories.find((c) => c.key === "admin-security")?.displayName,
		).toBe("Security")
	})

	it("fetches plugins list with pagination and search query", async () => {
		const mockSkillsResponse = {
			code: 0,
			message: "success",
			data: {
				total: 1,
				skills: [
					{
						slug: "huashu-design",
						name: "画术设计 HTML原型 高保真 幻灯片",
						ownerName: "alchaincyf",
						description:
							"HTML-native design skill for UI, PPTX, and prototypes",
						stars: 29305,
						verified: true,
						category: "design-media",
						homepage: "https://api.skillhub.cn/org-k6bcf2fv/huashu-design",
						namespace: {
							handle: "org-k6bcf2fv",
							canonicalName: "@org-k6bcf2fv/huashu-design",
						},
						publisher: {
							orgId: "org-k6bcf2fv",
							name: "skill训练营",
						},
					},
				],
			},
		}

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockSkillsResponse,
		} as Response)
		globalThis.fetch = fetchSpy

		const result = await client.listPlugins({
			page: 1,
			pageSize: 20,
			categoryKey: "design-media",
			search: "huashu",
		})

		expect(result.total).toBe(1)
		expect(result.items[0].name).toBe("huashu-design")
		expect(result.items[0].displayName).toBe("画术设计 HTML原型 高保真 幻灯片")
		expect(result.items[0].namespace).toEqual({
			handle: "org-k6bcf2fv",
			canonicalName: "@org-k6bcf2fv/huashu-design",
		})

		const calledUrl = fetchSpy.mock.calls[0][0] as string
		expect(calledUrl).toContain("/api/skills")
		expect(calledUrl).toContain("category=design-media")
		expect(calledUrl).toContain("keyword=huashu")
	})

	it("gracefully falls back on network errors", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"))

		const result = await client.listPlugins({ page: 1 })
		expect(result.items).toEqual([])
		expect(result.total).toBe(0)

		const categories = await client.getCategories()
		expect(categories.length).toBeGreaterThan(0)
		expect(categories[0].key).toBe("all")
	})

	it("uses /api/v1/search for ClawHub when category or search is specified", async () => {
		const clawClient = new SkillHubClient({ apiBase: "https://clawhub.ai" })
		const mockSearchResponse = {
			results: [
				{
					slug: "skill-vetter",
					displayName: "Skill Vetter",
					summary: "Security-first skill vetting for AI agents.",
					ownerHandle: "spclaudehome",
					downloads: 282413,
					native: {
						skill: {
							stats: { stars: 1316, downloads: 282413 },
							topics: ["GitHub", "Permission"],
							categories: ["security"],
						},
					},
				},
			],
		}

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockSearchResponse,
		} as Response)
		globalThis.fetch = fetchSpy

		const result = await clawClient.listPlugins({
			page: 1,
			pageSize: 10,
			categoryKey: "security",
		})

		expect(result.total).toBe(1)
		expect(result.items.length).toBe(1)
		expect(result.items[0].name).toBe("skill-vetter")
		expect(result.items[0].stars).toBe(1316)
		expect(result.items[0].categoryKey).toBe("security")
		expect(result.items[0].owner).toBe("spclaudehome")

		const calledUrl = fetchSpy.mock.calls[0][0] as string
		expect(calledUrl).toContain("/api/v1/search")
		expect(calledUrl).toContain("q=security")
	})

	it("filters ClawHub search results by declared category instead of labeling all hits", async () => {
		const clawClient = new SkillHubClient({ apiBase: "https://clawhub.ai" })
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [
					{
						slug: "security-skill",
						categories: ["security"],
						stats: { stars: 10 },
					},
					{
						slug: "calendar-skill",
						categories: ["scheduling"],
						stats: { stars: 99 },
					},
				],
			}),
		} as Response)

		const result = await clawClient.listPlugins({ categoryKey: "security" })
		expect(result.items.map((item) => item.name)).toEqual(["security-skill"])
		expect(result.total).toBe(1)
	})

	it("queries /api/v1/skills and /api/v1/trending for ClawHub 'all' category", async () => {
		const clawClient = new SkillHubClient({ apiBase: "https://clawhub.ai" })
		const mockTrendingResponse = { totalItems: 2689 }
		const mockSkillsResponse = {
			items: [
				{
					slug: "self-improving-agent",
					displayName: "self-improving agent",
					ownerHandle: "pskoett",
					stats: { stars: 4018 },
					topics: ["self-improvement"],
				},
			],
			nextCursor: "cursor_page_2",
		}

		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes("/api/v1/trending")) {
				return { ok: true, json: async () => mockTrendingResponse } as Response
			}
			return { ok: true, json: async () => mockSkillsResponse } as Response
		})

		const result = await clawClient.listPlugins({
			page: 1,
			pageSize: 30,
			categoryKey: "all",
		})

		expect(result.total).toBe(2689)
		expect(result.items.length).toBe(1)
		expect(result.items[0].name).toBe("self-improving-agent")
		expect(result.items[0].stars).toBe(4018)
		expect(result.items[0].categoryKey).toBe("self-improvement")
	})
})
