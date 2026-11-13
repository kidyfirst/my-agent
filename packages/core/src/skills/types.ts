/**
 * Core Types & Data Models for Agent Skills & SkillHub integration.
 * All types and interface definitions strictly use English.
 */

export const DEFAULT_PROJECT_SKILL_DIRS: string[] = [
	".myagent/skills",
	".agent/skills",
	".claude/skills",
	".codex/skills",
]

export type SkillScope = "project" | "global"

export interface SkillAuthor {
	name?: string
	handle?: string
	avatarUrl?: string
	url?: string
}

export interface SkillManifestMetadata {
	author?: string | SkillAuthor
	homepage?: string
	repository?: string
	version?: string
	license?: string
	category?: string
	tags?: string[]
	triggers?: string[]
	permissions?: string[]
	[key: string]: unknown
}

export interface Skill {
	/** Unique skill identifier, e.g. "huashu-design" or "project-refactor" */
	name: string
	/** Concise one-sentence summary for Stage 1 catalog */
	description: string
	/** Scope: project workspace or globally installed */
	scope: SkillScope
	/** Absolute path to the skill directory or SKILL.md */
	path: string
	/** Root folder path containing the skill */
	directory: string
	/** Author information */
	author?: string
	/** SkillHub or GitHub repository owner */
	owner?: string
	/** Current installed version or SHA */
	version?: string
	/** Category key */
	category?: string
	/** Trigger keywords for intent matching */
	triggers?: string[]
	/** Declared permission requirements */
	permissions?: string[]
	/** Full Markdown instructions from SKILL.md (for Stage 2 dynamic loading) */
	instructions?: string
	/** Additional script files mapped by relative path */
	scripts?: Record<string, string>
	/** Hash of the skill content for change detection */
	hash?: string
	/** Whether this skill is currently enabled */
	enabled: boolean
	/** Remote repository URL if installed from SkillHub / GitHub */
	repositoryUrl?: string
	/** Remote commit SHA when installed */
	installedSha?: string
	/** Timestamp when installed */
	installedAt?: number
	/** Whether an update is available on SkillHub */
	hasUpdate?: boolean
	/** Available latest version/SHA if update is detected */
	latestVersion?: string
	latestSha?: string
}

/**
 * SkillHub Category representation matching https://api.skillhub.cn/api/v1/plugins/categories
 */
export interface SkillHubCategory {
	key: string
	displayName: string
}

/**
 * Raw Plugin/Skill item returned from https://api.skillhub.cn/api/v1/plugins
 */
export interface SkillHubPluginItem {
	name: string
	displayName?: string
	slug?: string
	fullName: string
	owner: string
	description: string
	avatarUrl?: string
	categoryKey?: string
	namespace?:
		| {
				handle?: string
				canonicalName?: string
				displayName?: string
				publicSlug?: string
		  }
		| string
	publisher?: {
		name?: string
		orgId?: string
		handle?: string
		verified?: boolean
		certifiedName?: string
		logoUrl?: string | null
	}
	canonicalName?: string
	orgId?: string
	stars?: number
	downloads?: number
	forks?: number
	openIssues?: number
	license?: string
	repositoryUrl?: string
	homepage?: string
	installability?: "verified" | "community" | "unverified"
	contentAuditStatus?: string
	headSha?: string
	defaultBranch?: string
	topics?: string[]
	githubCreatedAt?: number
	githubUpdatedAt?: number
	pushedAt?: number
	lastSyncedAt?: number
	banned?: boolean
}

export interface SkillHubListResponse {
	items: SkillHubPluginItem[]
	page: number
	pageSize: number
	total: number
	error?: string
}

export interface SkillHubSource {
	id: string
	name: string
	url: string
	webUrl?: string
	urlPattern?: string
	downloadUrl?: string
	resolveUrl?: string
	isBuiltin?: boolean
	createdAt?: number
}

/**
 * Security Inspection Audit Results
 */
export type SecurityRiskSeverity = "low" | "medium" | "high" | "critical"

export interface SecurityIssue {
	severity: SecurityRiskSeverity
	category:
		| "privacy_leak"
		| "permission_mismatch"
		| "prompt_injection"
		| "network_exfiltration"
		| "malicious_script"
	title: string
	description: string
	codeSnippet?: string
	line?: number
	file?: string
}

export interface SecurityAuditReport {
	safe: boolean
	score: number // 0 to 100
	scannedFilesCount: number
	detectedPermissions: string[]
	declaredPermissions: string[]
	issues: SecurityIssue[]
	summary: string
}

/**
 * Project skills configuration saved in ~/.my-agent/recent-projects.json
 */
export interface ProjectSkillEntry {
	name: string
	path: string
	hash: string
	enabled?: boolean
}

export interface ProjectSkillsConfig {
	prompted: boolean
	enabled: boolean
	customDirs?: string[]
	knownSkills: ProjectSkillEntry[]
	lastScannedAt?: number
}

export interface ProjectSkillsScanResult {
	skills: Skill[]
	hasChanges: boolean
	added: Skill[]
	removed: ProjectSkillEntry[]
	modified: Skill[]
}
