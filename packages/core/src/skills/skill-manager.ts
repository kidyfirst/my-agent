import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { strFromU8, unzipSync } from "fflate"
import { getAppDataDir } from "../utils/project.js"
import { SecurityInspector } from "./security-inspector.js"
import {
	DEFAULT_PROJECT_SKILL_DIRS,
	type ProjectSkillEntry,
	type ProjectSkillsScanResult,
	type SecurityAuditReport,
	type Skill,
	type SkillHubPluginItem,
} from "./types.js"
import { CLAWHUB_SOURCE, SKILLHUB_SOURCE } from "./market-sources.js"

export { DEFAULT_PROJECT_SKILL_DIRS }

async function extractArchiveFiles(
	bytes: Uint8Array,
): Promise<Record<string, string>> {
	const result: Record<string, string> = {}
	const archive = unzipSync(bytes)
	const names = Object.keys(archive).filter(
		(name) => !name.endsWith("/") && !name.split("/").includes(".."),
	)
	const rootPrefix = names.some((name) => name === "SKILL.md")
		? ""
		: (names.find((name) => name.endsWith("/SKILL.md")) || "").replace(
				/SKILL\.md$/,
				"",
			)
	for (const name of names) {
		const normalized =
			rootPrefix && name.startsWith(rootPrefix)
				? name.slice(rootPrefix.length)
				: name
		if (normalized) result[normalized] = strFromU8(archive[name])
	}
	return result
}

export interface SkillManagerOptions {
	globalSkillsDir?: string
	securityInspector?: SecurityInspector
}

export interface InstallSkillOptions {
	name: string
	owner?: string
	repositoryUrl?: string
	headSha?: string
	manifestContent: string
	files?: Record<string, string>
	force?: boolean
	sourceUrl?: string
	slug?: string
}

export interface InstallSkillResult {
	success: boolean
	skill?: Skill
	auditReport: SecurityAuditReport
	reason?: string
}

export class SkillManager {
	readonly globalSkillsDir: string
	readonly securityInspector: SecurityInspector

	constructor(options: SkillManagerOptions = {}) {
		this.globalSkillsDir =
			options.globalSkillsDir || path.join(getAppDataDir(), "skills")
		this.securityInspector =
			options.securityInspector || new SecurityInspector()
	}

	computeHash(content: string): string {
		return crypto.createHash("sha256").update(content, "utf-8").digest("hex")
	}

	parseSkillFile(filePath: string, scope: "project" | "global"): Skill | null {
		try {
			if (!fs.existsSync(filePath)) return null
			const content = fs.readFileSync(filePath, "utf-8")
			const hash = this.computeHash(content)
			const parsed = this.securityInspector.parseManifest(content)

			const fallbackName = path.basename(path.dirname(filePath))
			const name =
				parsed.name ||
				(fallbackName !== "skills"
					? fallbackName
					: path.basename(filePath, ".md"))
			const description = parsed.description || `Skill ${name}`

			// Extract markdown body after frontmatter
			const bodyMatch = content.match(/^---\s*[\s\S]*?---\s*([\s\S]*)$/)
			const instructions = bodyMatch ? bodyMatch[1].trim() : content.trim()

			return {
				name,
				description,
				scope,
				path: path.resolve(filePath),
				directory: path.resolve(path.dirname(filePath)),
				permissions: parsed.permissions,
				instructions,
				hash,
				enabled: true,
			}
		} catch {
			return null
		}
	}

	async scanProjectSkills(
		projectRoot: string,
		customDirs: string[] = [],
	): Promise<Skill[]> {
		const searchDirs = [...DEFAULT_PROJECT_SKILL_DIRS, ...customDirs]
		const skills: Skill[] = []
		const seenPaths = new Set<string>()

		for (const relDir of searchDirs) {
			const absDir = path.resolve(projectRoot, relDir)
			if (!fs.existsSync(absDir)) continue

			try {
				const entries = fs.readdirSync(absDir, { withFileTypes: true })
				for (const entry of entries) {
					if (entry.isDirectory()) {
						const skillMd = path.join(absDir, entry.name, "SKILL.md")
						if (fs.existsSync(skillMd) && !seenPaths.has(skillMd)) {
							seenPaths.add(skillMd)
							const skill = this.parseSkillFile(skillMd, "project")
							if (skill) skills.push(skill)
						}
					} else if (entry.isFile() && entry.name.endsWith(".md")) {
						const filePath = path.join(absDir, entry.name)
						if (!seenPaths.has(filePath)) {
							seenPaths.add(filePath)
							const skill = this.parseSkillFile(filePath, "project")
							if (skill) skills.push(skill)
						}
					}
				}
			} catch {
				// Ignore read errors for inaccessible folders
			}
		}

		return skills
	}

	async detectProjectSkillsChanges(
		projectRoot: string,
		knownSkills: ProjectSkillEntry[] = [],
		customDirs: string[] = [],
	): Promise<ProjectSkillsScanResult> {
		const currentSkills = await this.scanProjectSkills(projectRoot, customDirs)
		const knownMap = new Map<string, ProjectSkillEntry>()
		for (const k of knownSkills) {
			knownMap.set(k.name, k)
		}

		const added: Skill[] = []
		const modified: Skill[] = []
		const currentNames = new Set<string>()

		for (const current of currentSkills) {
			currentNames.add(current.name)
			const known = knownMap.get(current.name)
			if (!known) {
				added.push(current)
			} else if (known.hash !== current.hash) {
				modified.push(current)
			}
		}

		const removed: ProjectSkillEntry[] = []
		for (const known of knownSkills) {
			if (!currentNames.has(known.name)) {
				removed.push(known)
			}
		}

		const hasChanges =
			added.length > 0 || removed.length > 0 || modified.length > 0

		return {
			skills: currentSkills,
			hasChanges,
			added,
			removed,
			modified,
		}
	}

	async installSkill(
		options: InstallSkillOptions,
	): Promise<InstallSkillResult> {
		let {
			name,
			owner,
			repositoryUrl,
			headSha,
			manifestContent,
			files = {},
			force = false,
		} = options
		// SkillHub cards can expose a display owner/name that differs from the
		// package slug (for example an internal user id vs. the published slug).
		// Use the canonical slug for the installation directory so reinstall,
		// scan and uninstall all address the same package.
		const isSkillHubInstall = Boolean(options.sourceUrl && options.slug)
		if (isSkillHubInstall) {
			const canonicalSlug = String(options.slug).replace(/^@/, "")
			const slash = canonicalSlug.lastIndexOf("/")
			if (slash > 0 && slash < canonicalSlug.length - 1) {
				owner = canonicalSlug.slice(0, slash)
				name = canonicalSlug.slice(slash + 1)
			}
		}
		if (
			Object.keys(files).every((file) => file === "SKILL.md") &&
			options.sourceUrl &&
			options.slug
		) {
			const sourceBase = options.sourceUrl
				.replace(/\/+$/, "")
				.replace(/^https:\/\/skillhub\.cn$/i, "https://api.skillhub.cn")
			const source = /clawhub/i.test(sourceBase)
				? CLAWHUB_SOURCE
				: SKILLHUB_SOURCE
			const rawSlug = options.slug.replace(/^@/, "")
			const [owner, ...parts] = rawSlug.split("/")
			const skillName = parts.join("/") || rawSlug
			let downloadUrl = source.downloadUrl
				.replace("{apiUrl}", sourceBase)
				.replace("{owner}", encodeURIComponent(owner))
				.replace("{name}", encodeURIComponent(skillName))
			if (source === SKILLHUB_SOURCE && source.resolveUrl) {
				const resolveUrl = source.resolveUrl
					.replace("{apiUrl}", sourceBase)
					.replace("{coordinate}", encodeURIComponent(`@${owner}/${skillName}`))
				const resolvedResponse = await fetch(resolveUrl)
				if (!resolvedResponse.ok)
					return {
						success: false,
						auditReport: await this.securityInspector.auditSkill({
							manifestContent,
							files,
						}),
						reason: `SkillHub resolve failed (${resolvedResponse.status})`,
					}
				const resolved = (await resolvedResponse.json()) as any
				const namespace = String(resolved.namespace?.handle || owner).replace(
					/^@/,
					"",
				)
				const publicSlug = String(
					resolved.namespace?.publicSlug || resolved.skill?.slug || skillName,
				)
				const version = String(
					resolved.latestVersion?.version || resolved.skill?.version || "",
				)
				const params = new URLSearchParams({ slug: publicSlug, namespace })
				if (version) params.set("version", version)
				downloadUrl = `${sourceBase}/api/v1/download?${params.toString()}`
			}
			console.info(
				`[SkillManager] downloading skill ${rawSlug} from ${downloadUrl}`,
			)
			const response = await fetch(downloadUrl)
			if (!response.ok)
				return {
					success: false,
					auditReport: await this.securityInspector.auditSkill({
						manifestContent,
						files,
					}),
					reason: `Skill download failed (${response.status})`,
				}
			const archive = new Uint8Array(await response.arrayBuffer())
			const downloaded = await extractArchiveFiles(archive)
			console.info(
				`[SkillManager] marketplace archive ${rawSlug}: ${Object.keys(downloaded).length} files`,
			)
			if (Object.keys(downloaded).length === 0) {
				const preview = new TextDecoder()
					.decode(archive.subarray(0, 160))
					.replace(/\s+/g, " ")
					.trim()
				return {
					success: false,
					auditReport: await this.securityInspector.auditSkill({
						manifestContent,
						files,
					}),
					reason: `SkillHub download contained no readable files (bytes: ${archive.byteLength}${preview ? `; response: ${preview}` : ""}).`,
				}
			}
			files = { ...downloaded, ...files }
			console.info(
				`[SkillManager] installing ${Object.keys(files).length} files: ${Object.keys(files).join(", ")}`,
			)
			manifestContent = files["SKILL.md"] || manifestContent
		}

		// Marketplace cards may only carry a generated manifest. If a repository
		// is available, hydrate the complete file tree before auditing/installing.
		if (
			repositoryUrl &&
			Object.keys(files).every((file) => file === "SKILL.md")
		) {
			const match = repositoryUrl.match(
				/^https:\/\/github\.com\/([^/]+)\/([^/#]+)(?:\.git)?(?:#(.+))?$/,
			)
			if (match) {
				const [, repoOwner, repoName, repoRef] = match
				try {
					const ref = repoRef || headSha || "HEAD"
					const treeRes = await fetch(
						`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
						{ headers: { Accept: "application/vnd.github+json" } },
					)
					if (!treeRes.ok)
						throw new Error(`GitHub tree request failed (${treeRes.status})`)
					const tree = (await treeRes.json()) as {
						tree?: Array<{ path: string; type: string }>
						truncated?: boolean
					}
					const downloaded: Record<string, string> = {}
					const entries = [...(tree.tree || [])]
					// Git's recursive tree endpoint truncates large repositories. Walk the
					// Contents API in that case so references/assets are not silently lost.
					if (tree.truncated) {
						const walk = async (dir: string): Promise<void> => {
							const res = await fetch(
								`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${dir}?ref=${encodeURIComponent(ref)}`,
								{ headers: { Accept: "application/vnd.github+json" } },
							)
							if (!res.ok) return
							const listing = (await res.json()) as Array<{
								path: string
								type: string
							}>
							for (const item of listing) {
								if (item.type === "dir") await walk(item.path)
								else if (item.type === "file")
									entries.push({ path: item.path, type: "blob" })
							}
						}
						await walk("")
					}
					for (const entry of entries) {
						if (
							entry.type !== "blob" ||
							!entry.path ||
							entry.path.includes("..")
						)
							continue
						const fileRes = await fetch(
							`https://raw.githubusercontent.com/${repoOwner}/${repoName}/${encodeURIComponent(ref)}/${entry.path}`,
						)
						if (fileRes.ok) downloaded[entry.path] = await fileRes.text()
					}
					if (Object.keys(downloaded).length > 0) {
						Object.assign(downloaded, files)
						files = downloaded
						manifestContent = downloaded["SKILL.md"] || manifestContent
					}
				} catch (error) {
					return {
						success: false,
						auditReport: await this.securityInspector.auditSkill({
							manifestContent,
							files,
						}),
						reason:
							error instanceof Error
								? error.message
								: "Failed to download skill files.",
					}
				}
			} else {
				return {
					success: false,
					auditReport: await this.securityInspector.auditSkill({
						manifestContent,
						files,
					}),
					reason: "Skill repository URL is not a supported GitHub repository.",
				}
			}
		}

		const auditReport = await this.securityInspector.auditSkill({
			manifestContent,
			files,
		})

		if (!auditReport.safe && !force) {
			return {
				success: false,
				auditReport,
				reason: "Skill failed automated security inspection.",
			}
		}

		const skillDir = owner
			? path.join(this.globalSkillsDir, owner, name)
			: path.join(this.globalSkillsDir, name)

		fs.mkdirSync(skillDir, { recursive: true })

		// Write all files
		const allFiles = {
			"SKILL.md": manifestContent,
			...files,
		}

		for (const [relPath, content] of Object.entries(allFiles)) {
			if (path.isAbsolute(relPath) || relPath.split(/[\\/]+/).includes("..")) {
				return {
					success: false,
					auditReport,
					reason: `Skill file path escapes installation directory: ${relPath}`,
				}
			}
			const filePath = path.join(skillDir, relPath)
			fs.mkdirSync(path.dirname(filePath), { recursive: true })
			fs.writeFileSync(filePath, content, "utf-8")
		}

		// Save metadata.json
		const metadata = {
			name,
			owner,
			repositoryUrl,
			installedSha: headSha,
			installedAt: Date.now(),
		}
		fs.writeFileSync(
			path.join(skillDir, "metadata.json"),
			JSON.stringify(metadata, null, 2),
			"utf-8",
		)

		const skillPath = path.join(skillDir, "SKILL.md")
		const skill = this.parseSkillFile(skillPath, "global")
		if (skill) {
			skill.owner = owner
			skill.repositoryUrl = repositoryUrl
			skill.installedSha = headSha
			skill.installedAt = metadata.installedAt
		}

		return {
			success: true,
			skill: skill || undefined,
			auditReport,
		}
	}

	async scanGlobalSkills(): Promise<Skill[]> {
		if (!fs.existsSync(this.globalSkillsDir)) {
			return []
		}

		const skills: Skill[] = []

		const findSkills = (dir: string) => {
			try {
				const entries = fs.readdirSync(dir, { withFileTypes: true })
				const skillMd = path.join(dir, "SKILL.md")
				if (fs.existsSync(skillMd)) {
					const skill = this.parseSkillFile(skillMd, "global")
					if (skill) {
						// Read metadata.json if present
						const metaPath = path.join(dir, "metadata.json")
						if (fs.existsSync(metaPath)) {
							try {
								const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
								skill.owner = meta.owner
								skill.repositoryUrl = meta.repositoryUrl
								skill.installedSha = meta.installedSha
								skill.installedAt = meta.installedAt
							} catch {}
						}
						skills.push(skill)
						return
					}
				}

				for (const entry of entries) {
					if (entry.isDirectory()) {
						findSkills(path.join(dir, entry.name))
					}
				}
			} catch {}
		}

		findSkills(this.globalSkillsDir)
		return skills
	}

	async uninstallSkill(skillName: string): Promise<boolean> {
		if (!fs.existsSync(this.globalSkillsDir)) return false

		const globalSkills = await this.scanGlobalSkills()
		const lowerName = skillName.toLowerCase()
		const target = globalSkills.find(
			(s) =>
				s.name.toLowerCase() === lowerName ||
				path.basename(s.directory).toLowerCase() === lowerName ||
				(s.owner && `${s.owner}/${s.name}`.toLowerCase() === lowerName) ||
				s.name === skillName,
		)

		if (target && fs.existsSync(target.directory)) {
			fs.rmSync(target.directory, { recursive: true, force: true })
			return true
		}

		return false
	}

	async checkUpdates(plugins: SkillHubPluginItem[]): Promise<Skill[]> {
		const installed = await this.scanGlobalSkills()
		const pluginMap = new Map<string, SkillHubPluginItem>()

		for (const p of plugins) {
			pluginMap.set(p.name, p)
			if (p.fullName) pluginMap.set(p.fullName, p)
		}

		for (const skill of installed) {
			const matchingPlugin =
				pluginMap.get(skill.name) ||
				(skill.owner
					? pluginMap.get(`${skill.owner}/${skill.name}`)
					: undefined)

			if (matchingPlugin && matchingPlugin.headSha) {
				if (
					skill.installedSha &&
					skill.installedSha !== matchingPlugin.headSha
				) {
					skill.hasUpdate = true
					skill.latestSha = matchingPlugin.headSha
				}
			}
		}

		return installed
	}
}
