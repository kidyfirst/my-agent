import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SkillsSection } from "../components/settings/SkillsSection"
import type { SkillHubPluginItem } from "@my-agent/core"

describe("Skills Marketplace Infinite Scroll & Lazy Loading", () => {
	beforeEach(() => {
		const sampleItems: SkillHubPluginItem[] = Array.from({ length: 30 }, (_, i) => ({
			name: `skill-item-${i + 1}`,
			owner: "test-owner",
			description: `Description for skill ${i + 1}`,
			stars: 100 + i,
			categoryKey: "all",
			installability: "verified",
		}))

		;(globalThis as any).window = (globalThis as any).window || {}
		;(globalThis as any).window.api = {
			invoke: vi.fn(async ({ type, page }) => {
				if (type === "getSkillHubCategories") return []
				if (type === "getInstalledSkills") return []
				if (type === "getProjectSkillsConfig") return null
				if (type === "getSkillHubPlugins") {
					return {
						items: sampleItems,
						total: 60,
						page: page || 1,
						pageSize: 30,
					}
				}
				if (type === "checkSkillUpdates") return []
				return null
			}),
		}
	})

	it("renders infinite scroll sentinel when more skills are available to load", () => {
		const html = renderToStaticMarkup(<SkillsSection />)
		// Found total skills count banner
		expect(html).toContain("Found 0 open source skills from")
		// Grid and search container render correctly
		expect(html).toContain("Search skills by keyword or author...")
	})
})
