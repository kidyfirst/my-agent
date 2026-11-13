import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SkillCard } from "../components/skills/SkillCard"
import { SkillSecurityModal } from "../components/skills/SkillSecurityModal"
import { ProjectSkillsGuideModal } from "../components/skills/ProjectSkillsGuideModal"
import { AddSourceModal } from "../components/skills/AddSourceModal"
import { ManageSourcesModal } from "../components/skills/ManageSourcesModal"
import {
	SkillDetailModal,
	getSkillExternalUrl,
	resolveSkillNamespace,
} from "../components/skills/SkillDetailModal"
import { SkillsSection } from "../components/settings/SkillsSection"
import type {
	SkillHubPluginItem,
	SecurityAuditReport,
	Skill,
} from "@my-agent/core"
import {
	isPluginItem,
	normalizeSkillItem,
	compareSkillsByStars,
} from "@my-agent/core"

describe("Skill UI Components", () => {
	beforeEach(() => {
		// Mock window.api for SkillsSection
		;(globalThis as any).window = (globalThis as any).window || {}
		;(globalThis as any).window.api = {
			invoke: vi.fn(async ({ type }) => {
				if (type === "getSkillHubCategories") return []
				if (type === "getInstalledSkills") return []
				if (type === "getProjectSkillsConfig")
					return {
						prompted: true,
						enabled: true,
						customDirs: ["custom-skills"],
						knownSkills: [],
					}
				if (type === "saveProjectSkillsConfig") return true
				if (type === "getSkillHubPlugins") return { items: [], total: 0 }
				return null
			}),
		}
	})

	const samplePlugin: SkillHubPluginItem = {
		name: "huashu-design",
		fullName: "alchaincyf/huashu-design",
		owner: "alchaincyf",
		description: "HTML-native design skill for UI, PPTX, and prototypes",
		stars: 2988,
		categoryKey: "agent-workflow",
		installability: "verified",
		headSha: "abc123sha",
	}

	it("SkillCard renders plugin details and Install action", () => {
		const html = renderToStaticMarkup(
			<SkillCard
				plugin={samplePlugin}
				installed={false}
				hasUpdate={false}
				onDetails={() => {}}
				onInstall={() => {}}
			/>,
		)

		expect(html).toContain("huashu-design")
		expect(html).toContain("alchaincyf")
		expect(html).toContain("HTML-native design skill")
		expect(html).toContain("Verified")
		expect(html).toContain("2988")
		expect(html).toContain("Details")
		expect(html).toContain("Install")
	})

	it("SkillCard renders red Uninstall button for installed skills or Update button if update available", () => {
		const installedHtml = renderToStaticMarkup(
			<SkillCard
				plugin={samplePlugin}
				installed={true}
				hasUpdate={false}
				onDetails={() => {}}
				onInstall={() => {}}
				onUninstall={() => {}}
			/>,
		)
		expect(installedHtml).toContain("Uninstall")
		expect(installedHtml).toContain("var(--error)")

		const updateHtml = renderToStaticMarkup(
			<SkillCard
				plugin={samplePlugin}
				installed={true}
				hasUpdate={true}
				onDetails={() => {}}
				onInstall={() => {}}
				onUninstall={() => {}}
			/>,
		)
		expect(updateHtml).toContain("Update")
	})

	it("SkillSecurityModal displays audit score, permissions, and inspection results", () => {
		const sampleReport: SecurityAuditReport = {
			safe: true,
			score: 95,
			scannedFilesCount: 2,
			declaredPermissions: ["calculate"],
			detectedPermissions: [],
			issues: [],
			summary: "No critical security risks detected. Safe to install.",
		}

		const html = renderToStaticMarkup(
			<SkillSecurityModal
				isOpen={true}
				plugin={samplePlugin}
				report={sampleReport}
				onConfirm={() => {}}
				onCancel={() => {}}
			/>,
		)

		expect(html).toContain("Security Audit Report")
		expect(html).toContain("95/100")
		expect(html).toContain("Safe to install")
		expect(html).toContain("Proceed with Install")
	})

	it("ProjectSkillsGuideModal renders detected skills and action buttons", () => {
		const detectedSkills: Skill[] = [
			{
				name: "workspace-helper",
				description: "Custom project helper",
				scope: "project",
				path: "/workspace/.agent/skills/helper/SKILL.md",
				directory: "/workspace/.agent/skills/helper",
				enabled: true,
			},
		]

		const html = renderToStaticMarkup(
			<ProjectSkillsGuideModal
				isOpen={true}
				mode="onboarding"
				projectPath="/workspace"
				skills={detectedSkills}
				onEnable={() => {}}
				onDisable={() => {}}
			/>,
		)

		expect(html).toContain("Custom Skills Detected")
		expect(html).toContain("workspace-helper")
		expect(html).toContain("Enable Skills")
		expect(html).toContain("Don&#x27;t Enable")
	})

	it("SkillsSection renders navigation tabs, source dropdown, and default Skills Marketplace view", () => {
		const html = renderToStaticMarkup(<SkillsSection />)

		// Navigation tabs present, no redundant uppercase title below tab bar
		expect(html).toContain('role="tablist"')
		expect(html).toContain("Skills Marketplace")
		expect(html).toContain("Project Skills")
		expect(html).not.toContain("SKILLS MARKETPLACE")

		// Source selector present in front of search bar
		expect(html).toContain('aria-label="Select SkillHub source"')
		expect(html).toContain("skillhub.cn")
		expect(html).toContain('aria-label="Add custom SkillHub source"')
		expect(html).toContain('aria-label="Manage / remove custom SkillHub sources"')

		// Search bar present with auto-search placeholder
		expect(html).toContain("Search skills by keyword or author...")
		// No trailing Search button in search bar
		expect(html).not.toContain(">Search<")

		// Refresh icon button has aria-label and does NOT display text like "Refreshing..." or "Refresh"
		expect(html).toContain('aria-label="Refresh skills"')
		expect(html).not.toContain("<span>Refresh</span>")
		expect(html).not.toContain("<span>Refreshing...</span>")
		expect(html).not.toContain("Refreshing...")

		// Categories and count banner rendered
		expect(html).toContain("open source skills from")
	})

	it("AddSourceModal renders input, validation progress bar, and action buttons", () => {
		const html = renderToStaticMarkup(
			<AddSourceModal
				isOpen={true}
				onClose={() => {}}
				onAdded={() => {}}
			/>,
		)

		expect(html).toContain("Add SkillHub Source")
		expect(html).toContain("https://skillhub.xxx")
		expect(html).toContain("Next")
		expect(html).toContain("Cancel")
	})

	it("ManageSourcesModal renders custom sources list and empty state", () => {
		const emptyHtml = renderToStaticMarkup(
			<ManageSourcesModal
				isOpen={true}
				sources={[]}
				onClose={() => {}}
				onRemoved={() => {}}
			/>,
		)
		expect(emptyHtml).toContain("Manage Custom SkillHub Sources")
		expect(emptyHtml).toContain("No custom SkillHub sources have been added yet")

		const populatedHtml = renderToStaticMarkup(
			<ManageSourcesModal
				isOpen={true}
				sources={[
					{
						id: "https://skillhub.xxx",
						name: "skillhub.xxx",
						url: "https://skillhub.xxx",
						isBuiltin: false,
					},
				]}
				onClose={() => {}}
				onRemoved={() => {}}
			/>,
		)
		expect(populatedHtml).toContain("skillhub.xxx")
		expect(populatedHtml).toContain("Delete")
	})

	it("SkillsSection renders Project Skills tab with directories and without Enable toggle", () => {
		const html = renderToStaticMarkup(<SkillsSection initialTab="project" />)

		// Navigation tabs present, no redundant uppercase title below tab bar
		expect(html).toContain('role="tablist"')
		expect(html).toContain("Project Skills")
		expect(html).not.toContain("PROJECT SKILLS")
		expect(html).not.toContain("Enable Project Skills")

		// Directories configuration only (global settings without workspace-specific skills listing)
		expect(html).toContain("Skills Directories")
		expect(html).toContain(".agent/skills")
		expect(html).toContain(">Add<")
		expect(html).not.toContain("Workspace Custom Skills")
		expect(html).not.toContain("No custom skills detected in the current workspace")
	})

	it("SkillCard includes contentVisibility virtualization styles", () => {
		const html = renderToStaticMarkup(
			<SkillCard
				plugin={samplePlugin}
				installed={false}
				hasUpdate={false}
				onDetails={() => {}}
				onInstall={() => {}}
			/>,
		)
		expect(html).toContain("content-visibility:auto")
	})

	it("getSkillExternalUrl resolves homepage, clawhub.ai, and skillhub.cn urls correctly", () => {
		// 1. Explicit homepage has top priority
		expect(
			getSkillExternalUrl(
				{ ...samplePlugin, homepage: "https://custom-site.com/skill" },
				"https://clawhub.ai",
			),
		).toBe("https://custom-site.com/skill")

		// 2. ClawHub source resolves to /{owner}/skills/{name}
		expect(
			getSkillExternalUrl(
				{
					name: "self-improving-agent",
					fullName: "pskoett/self-improving-agent",
					owner: "pskoett",
					description: "",
				},
				"https://clawhub.ai",
			),
		).toBe("https://clawhub.ai/pskoett/skills/self-improving-agent")

		// Also works with source object
		expect(
			getSkillExternalUrl(
				{
					name: "self-improving-agent",
					owner: "pskoett",
					fullName: "pskoett/self-improving-agent",
					description: "",
				},
				{
					id: "clawhub.ai",
					name: "clawhub.ai",
					url: "https://clawhub.ai",
					webUrl: "https://clawhub.ai",
					urlPattern: "{webUrl}/{owner}/skills/{name}",
				},
			),
		).toBe("https://clawhub.ai/pskoett/skills/self-improving-agent")

		// 3. SkillHub source resolves to /skills/{namespace}/{name} on skillhub.cn
		// For huashu-design, canonical namespace is org-k6bcf2fv
		expect(
			getSkillExternalUrl(
				{
					name: "huashu-design",
					owner: "alchaincyf",
					fullName: "alchaincyf/huashu-design",
					description: "",
					namespace: { handle: "org-k6bcf2fv" },
				},
				"https://api.skillhub.cn",
			),
		).toBe("https://skillhub.cn/skills/org-k6bcf2fv/huashu-design")

		// Also resolves dynamically from publisher.orgId
		expect(
			getSkillExternalUrl(
				{
					name: "huashu-design",
					owner: "alchaincyf",
					fullName: "alchaincyf/huashu-design",
					description: "",
					publisher: { orgId: "org-k6bcf2fv", name: "skill训练营" },
				},
				"https://api.skillhub.cn",
			),
		).toBe("https://skillhub.cn/skills/org-k6bcf2fv/huashu-design")

		// Also resolves from canonicalName
		expect(
			getSkillExternalUrl(
				{
					name: "huashu-design",
					owner: "alchaincyf",
					fullName: "alchaincyf/huashu-design",
					description: "",
					canonicalName: "@org-k6bcf2fv/huashu-design",
				},
				"https://api.skillhub.cn",
			),
		).toBe("https://skillhub.cn/skills/org-k6bcf2fv/huashu-design")

		// SamplePlugin huashu-design resolves canonical org-k6bcf2fv
		expect(
			getSkillExternalUrl(samplePlugin, "https://api.skillhub.cn"),
		).toBe("https://skillhub.cn/skills/org-k6bcf2fv/huashu-design")

		// Nuwa-skill resolves to clawhub_alchaincyf
		expect(
			getSkillExternalUrl(
				{
					name: "nuwa-skill",
					owner: "alchaincyf",
					fullName: "alchaincyf/nuwa-skill",
					description: "",
				},
				"https://api.skillhub.cn",
			),
		).toBe("https://skillhub.cn/skills/clawhub_alchaincyf/nuwa-skill")

		// Dynamic namespace resolution helper tests
		expect(
			resolveSkillNamespace({
				name: "dev-god",
				owner: "ake",
				fullName: "ake/dev-god",
				description: "",
				publisher: { orgId: "org-m3rw44qx", name: "阿客实验室" },
			}),
		).toBe("org-m3rw44qx")

		expect(
			resolveSkillNamespace({
				name: "multi-search-engine",
				owner: "zcwl",
				fullName: "zcwl/multi-search-engine",
				description: "",
				namespace: { handle: "zcwl" },
			}),
		).toBe("zcwl")
	})

	it("SkillDetailModal renders 'Browser the skills' external link button in top-right header", () => {
		const html = renderToStaticMarkup(
			<SkillDetailModal
				isOpen={true}
				plugin={{
					name: "@openclaw/whatsapp",
					fullName: "openclaw/whatsapp",
					owner: "openclaw",
					description: "WhatsApp channel skill",
				}}
				sourceUrl="https://clawhub.ai"
				onClose={() => {}}
			/>,
		)

		expect(html).toContain("@openclaw/whatsapp")
		expect(html).toContain('aria-label="Browser the skills"')
		expect(html).toContain("Browser the skills")
		expect(html).toContain("Close")
	})

	it("sorts skills by stars in descending order (highest stars first)", () => {
		const rawPlugins: SkillHubPluginItem[] = [
			{
				name: "low-stars-skill",
				fullName: "author/low-stars-skill",
				owner: "author",
				description: "A skill with few stars",
				stars: 5,
			},
			{
				name: "top-stars-skill",
				fullName: "author/top-stars-skill",
				owner: "author",
				description: "A popular skill with many stars",
				stars: 71319,
			},
			{
				name: "zero-stars-skill",
				fullName: "author/zero-stars-skill",
				owner: "author",
				description: "A skill with 0 stars",
				stars: 0,
			},
		]

		const sorted = [...rawPlugins].sort(
			(a, b) =>
				(b.stars ?? 0) - (a.stars ?? 0) || a.name.localeCompare(b.name),
		)

		expect(sorted[0].name).toBe("top-stars-skill")
		expect(sorted[0].stars).toBe(71319)
		expect(sorted[1].name).toBe("low-stars-skill")
		expect(sorted[1].stars).toBe(5)
		expect(sorted[2].name).toBe("zero-stars-skill")
		expect(sorted[2].stars).toBe(0)
	})

	it("isPluginItem correctly identifies plugins and filters them out of skills lists", () => {
		const items: SkillHubPluginItem[] = [
			{
				name: "dsh-our-free-model",
				fullName: "Ebony-Vinyl/dsh-our-free-model",
				owner: "Ebony-Vinyl",
				description: "DSH plugin",
				stars: 71319,
				topics: ["dsh-plugin", "model-provider"],
			},
			{
				name: "huashu-design",
				fullName: "alchaincyf/huashu-design",
				owner: "alchaincyf",
				description: "Design skill",
				stars: 29350,
				topics: ["workflow", "design"],
			},
			{
				name: "@openclaw/whatsapp",
				fullName: "openclaw/plugins/whatsapp",
				owner: "openclaw",
				description: "Channel plugin",
				stars: 0,
				topics: ["channel-plugin"],
			},
			{
				name: "nuwa-skill",
				fullName: "alchaincyf/nuwa-skill",
				owner: "alchaincyf",
				description: "Nuwa agent persona skill",
				stars: 38151,
				topics: ["styling"],
			},
		]

		expect(isPluginItem(items[0])).toBe(true)
		expect(isPluginItem(items[1])).toBe(false)
		expect(isPluginItem(items[2])).toBe(true)
		expect(isPluginItem(items[3])).toBe(false)

		const onlySkills = items.filter((it) => !isPluginItem(it))
		expect(onlySkills.length).toBe(2)
		expect(onlySkills.map((s) => s.name)).toEqual(["huashu-design", "nuwa-skill"])
	})

	it("normalizeSkillItem and compareSkillsByStars handle ClawHub and SkillHub items safely", () => {
		// ClawHub item missing .name, uses .slug, .displayName, .ownerHandle, .stats.stars
		const clawhubItem = {
			ownerHandle: "krumjahn",
			slug: "apple-health-export-analyzer",
			displayName: "Apple Health Data AI Analyzer",
			summary: "Analyze your Apple Health data",
			topics: ["Health"],
			stats: { stars: 15, downloads: 100 },
		}

		// SkillHub item
		const skillhubItem = {
			name: "nuwa-skill",
			fullName: "alchaincyf/nuwa-skill",
			owner: "alchaincyf",
			description: "Nuwa persona skill",
			stars: 38151,
			topics: ["skills", "agent-skills"],
		}

		// Item without name or stars
		const bareItem = {}

		const normClaw = normalizeSkillItem(clawhubItem as any)
		expect(normClaw.name).toBe("apple-health-export-analyzer")
		expect(normClaw.displayName).toBe("Apple Health Data AI Analyzer")
		expect(normClaw.owner).toBe("krumjahn")
		expect(normClaw.stars).toBe(15)
		expect(normClaw.description).toBe("Analyze your Apple Health data")

		const normSkill = normalizeSkillItem(skillhubItem as any)
		expect(normSkill.name).toBe("nuwa-skill")
		expect(normSkill.stars).toBe(38151)

		const normBare = normalizeSkillItem(bareItem as any)
		expect(normBare.name).toBe("")
		expect(normBare.stars).toBe(0)

		// Sorting by stars descending: highest stars first, without crashing on missing name
		const unsorted = [normBare, normClaw, normSkill]
		const sorted = [...unsorted].sort(compareSkillsByStars)

		expect(sorted[0].name).toBe("nuwa-skill") // 38151 stars
		expect(sorted[1].name).toBe("apple-health-export-analyzer") // 15 stars
		expect(sorted[2].name).toBe("") // 0 stars
	})
})
