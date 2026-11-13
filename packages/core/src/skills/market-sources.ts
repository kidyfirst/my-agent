import type { SkillHubSource } from "./types.js"

/** Built-in marketplace endpoints. Keep API and web addresses together here. */
export const SKILLHUB_SOURCE = {
	id: "skillhub.cn",
	name: "skillhub.cn",
	apiUrl: "https://api.skillhub.cn",
	webUrl: "https://skillhub.cn",
	urlPattern: "{webUrl}/skills/{namespace}/{name}",
	downloadUrl: "{apiUrl}/api/v1/download?slug=%40{owner}%2F{name}",
} as const

export const CLAWHUB_SOURCE = {
	id: "clawhub.ai",
	name: "clawhub.ai",
	apiUrl: "https://clawhub.ai",
	webUrl: "https://clawhub.ai",
	urlPattern: "{webUrl}/{owner}/skills/{name}",
	downloadUrl: "{apiUrl}/api/v1/download?slug={name}&ownerHandle={owner}",
} as const

export const DEFAULT_SKILLHUB_API_BASE = SKILLHUB_SOURCE.apiUrl
export const DEFAULT_SKILLHUB_SOURCES: SkillHubSource[] = [
	{ ...SKILLHUB_SOURCE, url: SKILLHUB_SOURCE.apiUrl, isBuiltin: true },
	{ ...CLAWHUB_SOURCE, url: CLAWHUB_SOURCE.apiUrl, isBuiltin: true },
]
