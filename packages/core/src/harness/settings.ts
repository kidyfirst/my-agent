import fs from "node:fs"
import path from "node:path"
import { getAppDataDir } from "../utils/project.js"

export interface CustomProviderConfig {
	name: string
	url: string
	apiKey?: string
	models: string[]
}

export interface SettingsData {
	onboarding: Record<string, any>
	models: {
		modeDefaults: Record<string, string>
		subagentModels: Record<string, string>
		omModelOverride?: string
		activeModelPackId?: string
	}
	preferences: {
		yolo: boolean | null
		theme: string
		quietMode: boolean
	}
	customModelPacks: Array<{
		name: string
		models: Record<string, string>
		createdAt: string
	}>
	customProviders: CustomProviderConfig[]
	modelUseCounts: Record<string, number>
	updateDismissedVersion: string | null
	lsp?: Record<string, any>
	/**
	 * Credentials for MCP servers that ship with the app. Kept here rather than
	 * in mcp.json so a built-in server never needs a hand-written config file:
	 * the entry appears on its own, the key is the only thing the user supplies.
	 */
	mcp: {
		apiKeys: Record<string, string>
	}
}

const DEFAULT_SETTINGS: SettingsData = {
	onboarding: {},
	models: {
		modeDefaults: {
			react: "anthropic/claude-3-7-sonnet-latest",
			build: "anthropic/claude-3-7-sonnet-latest",
			plan: "openai/o3-mini",
			fast: "google/gemini-2.0-flash",
		},
		subagentModels: {},
	},
	preferences: {
		yolo: null,
		theme: "auto",
		quietMode: false,
	},
	customModelPacks: [],
	customProviders: [],
	modelUseCounts: {},
	updateDismissedVersion: null,
	lsp: {},
	mcp: { apiKeys: {} },
}

export function getSettingsPath(): string {
	return path.join(getAppDataDir(), "settings.json")
}

export function loadSettings(
	filePath: string = getSettingsPath(),
): SettingsData {
	if (!fs.existsSync(filePath)) {
		return structuredClone(DEFAULT_SETTINGS)
	}
	try {
		const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
		return {
			...DEFAULT_SETTINGS,
			...raw,
			models: { ...DEFAULT_SETTINGS.models, ...raw.models },
			preferences: { ...DEFAULT_SETTINGS.preferences, ...raw.preferences },
			customModelPacks: Array.isArray(raw.customModelPacks)
				? raw.customModelPacks
				: [],
			customProviders: Array.isArray(raw.customProviders)
				? raw.customProviders
				: [],
			modelUseCounts:
				raw.modelUseCounts && typeof raw.modelUseCounts === "object"
					? raw.modelUseCounts
					: {},
			lsp: raw.lsp && typeof raw.lsp === "object" ? raw.lsp : {},
			mcp: {
				...DEFAULT_SETTINGS.mcp,
				...(raw.mcp && typeof raw.mcp === "object" ? raw.mcp : {}),
				apiKeys:
					raw.mcp?.apiKeys && typeof raw.mcp.apiKeys === "object"
						? raw.mcp.apiKeys
						: {},
			},
		}
	} catch {
		return structuredClone(DEFAULT_SETTINGS)
	}
}

export function saveSettings(
	settings: SettingsData,
	filePath: string = getSettingsPath(),
): void {
	try {
		const dir = path.dirname(filePath)
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
		fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8")
	} catch (error) {
		console.error("Failed to save settings:", error)
	}
}

export function getCustomProviderId(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return slug || "provider"
}

export function toCustomProviderModelId(
	providerName: string,
	modelName: string,
): string {
	const providerId = getCustomProviderId(providerName)
	const trimmedModelName = modelName.trim()
	const providerPrefix = `${providerId}/`
	if (trimmedModelName.startsWith(providerPrefix)) {
		return trimmedModelName
	}
	return `${providerId}/${trimmedModelName}`
}

// -----------------------------------------------------------------------------
// Thread locks
// -----------------------------------------------------------------------------

function getLocksDir(): string {
	const dir = path.join(getAppDataDir(), "locks")
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
	return dir
}

function getLockPath(threadId: string): string {
	return path.join(getLocksDir(), `${threadId}.lock`)
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

export class ThreadLockError extends Error {
	constructor(
		public readonly threadId: string,
		public readonly ownerPid: number,
	) {
		super(
			`Thread ${threadId} is locked by another running process (PID ${ownerPid})`,
		)
		this.name = "ThreadLockError"
	}
}

export function acquireThreadLock(threadId: string): void {
	try {
		const lockPath = getLockPath(threadId)
		const myPid = process.pid
		if (fs.existsSync(lockPath)) {
			try {
				const content = fs.readFileSync(lockPath, "utf-8").trim()
				const ownerPid = parseInt(content, 10)
				if (
					!isNaN(ownerPid) &&
					ownerPid !== myPid &&
					isProcessAlive(ownerPid)
				) {
					throw new ThreadLockError(threadId, ownerPid)
				}
			} catch (error) {
				if (error instanceof ThreadLockError) throw error
			}
		}
		fs.writeFileSync(lockPath, String(myPid), "utf-8")
	} catch (error) {
		if (error instanceof ThreadLockError) throw error
	}
}

export function releaseThreadLock(threadId: string): void {
	try {
		const lockPath = getLockPath(threadId)
		const myPid = process.pid
		if (!fs.existsSync(lockPath)) return
		const content = fs.readFileSync(lockPath, "utf-8").trim()
		const ownerPid = parseInt(content, 10)
		if (ownerPid === myPid) {
			fs.unlinkSync(lockPath)
		}
	} catch {}
}

export function releaseAllThreadLocks(): void {
	try {
		const locksDir = getLocksDir()
		const files = fs.readdirSync(locksDir)
		const myPid = String(process.pid)
		for (const file of files) {
			if (!file.endsWith(".lock")) continue
			const lockPath = path.join(locksDir, file)
			try {
				const content = fs.readFileSync(lockPath, "utf-8").trim()
				if (content === myPid) {
					fs.unlinkSync(lockPath)
				}
			} catch {}
		}
	} catch {}
}
