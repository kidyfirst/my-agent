import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import type { SkillManager } from "../skills/skill-manager.js"

/** Installs a skill through the same audited SkillManager path as Settings. */
export function createInstallSkillTool(skillManager: SkillManager) {
	return createTool({
		id: "install_skill",
		description:
			"Install a skill into the global skills directory. Use when the user explicitly asks to install a skill. The complete downloaded file map must be supplied; installation is audited before writing.",
		inputSchema: z.object({
			name: z.string(),
			owner: z.string().optional(),
			repositoryUrl: z.string().url().optional(),
			headSha: z.string().optional(),
			manifestContent: z.string().describe("The complete SKILL.md content"),
			files: z
				.record(z.string())
				.describe("All additional skill files keyed by relative path"),
			sourceUrl: z
				.string()
				.url()
				.optional()
				.describe(
					"SkillHub-compatible source API base, when installing from a marketplace",
				),
			slug: z
				.string()
				.optional()
				.describe("Marketplace skill slug, for example @owner/name"),
			force: z.boolean().optional(),
		}),
		execute: async (input) => {
			let files = input.files
			let manifestContent = input.manifestContent
			if (input.repositoryUrl && Object.keys(files).length === 0) {
				const match = input.repositoryUrl.match(
					/^https:\/\/github\.com\/([^/]+)\/([^/#]+)(?:\.git)?(?:#(.+))?$/,
				)
				if (!match)
					return {
						success: false,
						reason:
							"A complete file map is required for non-GitHub repositories.",
					}
				const [, owner, repo, ref] = match
				const treeRes = await fetch(
					`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref || "HEAD")}?recursive=1`,
					{ headers: { Accept: "application/vnd.github+json" } },
				)
				if (!treeRes.ok)
					return {
						success: false,
						reason: `Failed to download skill files: HTTP ${treeRes.status}`,
					}
				const tree = (await treeRes.json()) as {
					tree?: Array<{ path: string; type: string; url?: string }>
				}
				const downloaded: Record<string, string> = {}
				for (const entry of tree.tree || []) {
					if (entry.type !== "blob" || !entry.path || entry.path.includes(".."))
						continue
					const contentRes = await fetch(
						`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref || "HEAD")}/${entry.path}`,
					)
					if (contentRes.ok) downloaded[entry.path] = await contentRes.text()
				}
				files = downloaded
				manifestContent =
					files["SKILL.md"] || files["skill.md"] || manifestContent
				if (!manifestContent)
					return {
						success: false,
						reason: "Downloaded repository does not contain SKILL.md.",
					}
			}
			return skillManager.installSkill({ ...input, manifestContent, files })
		},
	})
}
