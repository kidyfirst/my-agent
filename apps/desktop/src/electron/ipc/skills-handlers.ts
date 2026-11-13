import {
	DEFAULT_SKILLHUB_SOURCES,
	DEFAULT_SKILLHUB_API_BASE,
	SecurityInspector,
	SkillHubClient,
	SkillManager,
	getRecentProjectSkillsConfig,
	loadSettings,
	saveRecentProjectSkillsConfig,
	saveSettings,
	validateSkillHubSource,
	type ProjectSkillEntry,
	type ProjectSkillsConfig,
	type SkillHubPluginItem,
	type SkillHubSource,
} from "@my-agent/core"
import type { IpcCommandHandler } from "./types.js"

export interface SkillsHandlersDeps {
	skillManager?: SkillManager
	skillHubClient?: SkillHubClient
	securityInspector?: SecurityInspector
}

export function getSkillsHandlers(
	deps: SkillsHandlersDeps = {},
): Record<string, IpcCommandHandler> {
	const skillManager = deps.skillManager || new SkillManager()
	const defaultSkillHubClient = deps.skillHubClient || new SkillHubClient()
	const clientsBySource = new Map<string, SkillHubClient>()
	const securityInspector = deps.securityInspector || new SecurityInspector()

	const getClientForSource = (sourceUrl?: string): SkillHubClient => {
		if (deps.skillHubClient && !sourceUrl) {
			return deps.skillHubClient
		}
		const effectiveUrl =
			sourceUrl || DEFAULT_SKILLHUB_SOURCES[0]?.url || DEFAULT_SKILLHUB_API_BASE
		const normalizedUrl = effectiveUrl.replace(/\/+$/, "")
		const existing = clientsBySource.get(normalizedUrl)
		if (existing) return existing
		const client = new SkillHubClient({ apiBase: normalizedUrl })
		clientsBySource.set(normalizedUrl, client)
		return client
	}

	return {
		getSkillHubSources: async () => {
			const settings = loadSettings()
			const custom = (settings.skillHubSources || []).map((s) => ({
				id: s.url,
				name: s.name || new URL(s.url).hostname,
				url: s.url,
				isBuiltin: false,
				createdAt: s.createdAt,
			}))
			return {
				sources: [...DEFAULT_SKILLHUB_SOURCES, ...custom],
				// The selected marketplace is session UI state, not a persisted
				// preference. Always initialize from the first dropdown option.
				activeSourceUrl:
					DEFAULT_SKILLHUB_SOURCES[0]?.url || DEFAULT_SKILLHUB_API_BASE,
			}
		},

		addSkillHubSource: async (command) => {
			const rawUrl = String(command.url || "").trim()
			const validation = await validateSkillHubSource(rawUrl)
			if (!validation.valid || !validation.normalizedUrl) {
				return {
					success: false,
					error: validation.error || "Invalid SkillHub source",
				}
			}
			const settings = loadSettings()
			const sources = settings.skillHubSources || []
			const existingIndex = sources.findIndex(
				(s) => s.url.toLowerCase() === validation.normalizedUrl!.toLowerCase(),
			)
			let domain = validation.domain
			try {
				if (!domain) domain = new URL(validation.normalizedUrl).hostname
			} catch {}
			const name =
				(command.name as string) || domain || validation.normalizedUrl

			if (existingIndex >= 0) {
				sources[existingIndex] = {
					...sources[existingIndex],
					name,
				}
			} else {
				sources.push({
					url: validation.normalizedUrl,
					name,
					createdAt: Date.now(),
				})
			}
			settings.skillHubSources = sources
			settings.activeSkillHubSourceUrl = validation.normalizedUrl
			saveSettings(settings)

			const custom = sources.map((s) => ({
				id: s.url,
				name: s.name || new URL(s.url).hostname,
				url: s.url,
				isBuiltin: false,
				createdAt: s.createdAt,
			}))

			return {
				success: true,
				sources: [...DEFAULT_SKILLHUB_SOURCES, ...custom],
				activeSourceUrl: validation.normalizedUrl,
			}
		},

		removeSkillHubSource: async (command) => {
			const targetUrl = String(command.url || "")
				.trim()
				.toLowerCase()
			const settings = loadSettings()
			const sources = (settings.skillHubSources || []).filter(
				(s) => s.url.trim().toLowerCase() !== targetUrl,
			)
			settings.skillHubSources = sources
			if (
				settings.activeSkillHubSourceUrl &&
				settings.activeSkillHubSourceUrl.trim().toLowerCase() === targetUrl
			) {
				settings.activeSkillHubSourceUrl = DEFAULT_SKILLHUB_API_BASE
			}
			saveSettings(settings)

			const custom = sources.map((s) => ({
				id: s.url,
				name: s.name || new URL(s.url).hostname,
				url: s.url,
				isBuiltin: false,
				createdAt: s.createdAt,
			}))

			return {
				success: true,
				sources: [...DEFAULT_SKILLHUB_SOURCES, ...custom],
				activeSourceUrl: settings.activeSkillHubSourceUrl,
			}
		},

		setActiveSkillHubSource: async (command) => {
			const targetUrl = String(command.url || "").trim()
			if (!targetUrl) return false
			return true
		},

		validateSkillHubSource: async (command) => {
			const rawUrl = String(command.url || "").trim()
			return await validateSkillHubSource(rawUrl)
		},

		getSkillHubCategories: async (command) => {
			const client = getClientForSource(
				command?.sourceUrl as string | undefined,
			)
			return await client.getCategories()
		},

		getSkillHubPlugins: async (command) => {
			const page = Number(command.page) || 1
			const pageSize = Number(command.pageSize) || 20
			const categoryKey = command.categoryKey as string | undefined
			const search = command.search as string | undefined
			const client = getClientForSource(
				command?.sourceUrl as string | undefined,
			)
			return await client.listPlugins({
				page,
				pageSize,
				categoryKey,
				search,
				sort: "stars",
				order: "desc",
			})
		},

		getInstalledSkills: async () => {
			return await skillManager.scanGlobalSkills()
		},

		getProjectSkills: async (command, ctx) => {
			const projectRoot =
				(command.projectRoot as string) || ctx.getActiveSession().projectRoot
			const customDirs = (command.customDirs as string[]) || []
			if (!projectRoot) return []
			return await skillManager.scanProjectSkills(projectRoot, customDirs)
		},

		detectProjectSkillsChanges: async (command, ctx) => {
			const projectRoot =
				(command.projectRoot as string) || ctx.getActiveSession().projectRoot
			const knownSkills = (command.knownSkills as ProjectSkillEntry[]) || []
			const customDirs = (command.customDirs as string[]) || []
			if (!projectRoot) {
				return {
					skills: [],
					hasChanges: false,
					added: [],
					removed: [],
					modified: [],
				}
			}
			return await skillManager.detectProjectSkillsChanges(
				projectRoot,
				knownSkills,
				customDirs,
			)
		},

		getProjectSkillsConfig: async (command, ctx) => {
			const projectRoot =
				(command.projectRoot as string) || ctx.getActiveSession().projectRoot
			if (!projectRoot) return null
			return getRecentProjectSkillsConfig(projectRoot)
		},

		saveProjectSkillsConfig: async (command, ctx) => {
			const projectRoot =
				(command.projectRoot as string) || ctx.getActiveSession().projectRoot
			const config = (command.config as Partial<ProjectSkillsConfig>) || {}
			if (!projectRoot) return false
			saveRecentProjectSkillsConfig(projectRoot, config)
			return true
		},

		auditSkill: async (command) => {
			const manifestContent = (command.manifestContent as string) || ""
			const files = (command.files as Record<string, string>) || {}
			return await securityInspector.auditSkill({
				manifestContent,
				files,
			})
		},

		installSkill: async (command) => {
			return await skillManager.installSkill({
				name: command.name as string,
				owner: command.owner as string | undefined,
				repositoryUrl: command.repositoryUrl as string | undefined,
				headSha: command.headSha as string | undefined,
				sourceUrl: command.sourceUrl as string | undefined,
				slug: command.slug as string | undefined,
				manifestContent: (command.manifestContent as string) || "",
				files: (command.files as Record<string, string>) || {},
				force: Boolean(command.force),
			})
		},

		uninstallSkill: async (command) => {
			const name = (command.name as string) || ""
			return await skillManager.uninstallSkill(name)
		},

		checkSkillUpdates: async (command) => {
			const plugins = (command.plugins as SkillHubPluginItem[]) || []
			return await skillManager.checkUpdates(plugins)
		},
	}
}
