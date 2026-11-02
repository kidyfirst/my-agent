import { useState, useCallback } from "react"

export type PermissionMode = "default" | "auto-approve" | "read-only"

/** Tool categories whose policy each permission mode applies. */
export type PermissionPolicy = "allow" | "ask" | "deny"

const CATEGORIES = ["read", "edit", "execute", "mcp"] as const

const MODE_POLICIES: Record<
	PermissionMode,
	Record<(typeof CATEGORIES)[number], PermissionPolicy>
> = {
	default: { read: "allow", edit: "ask", execute: "ask", mcp: "ask" },
	"auto-approve": {
		read: "allow",
		edit: "allow",
		execute: "allow",
		mcp: "allow",
	},
	"read-only": { read: "allow", edit: "deny", execute: "deny", mcp: "deny" },
}

const MODELS_KEY = "myagent-thread-models"
const PERMISSIONS_KEY = "myagent-thread-permissions"
const MODES_KEY = "myagent-thread-modes"
const THINKING_KEY = "myagent-thread-thinking"

function loadJson<T>(key: string, fallback: T): T {
	try {
		const saved = localStorage.getItem(key)
		return saved ? (JSON.parse(saved) as T) : fallback
	} catch {
		return fallback
	}
}

function save(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {}
}

export function loadSavedThreadModels(): Record<string, string> {
	return loadJson<Record<string, string>>(MODELS_KEY, {})
}

export function loadSavedThreadPermissions(): Record<string, PermissionMode> {
	return loadJson<Record<string, PermissionMode>>(PERMISSIONS_KEY, {})
}

export function loadSavedThreadModes(): Record<string, string> {
	return loadJson<Record<string, string>>(MODES_KEY, {})
}

export function loadSavedThreadThinking(): Record<string, string> {
	return loadJson<Record<string, string>>(THINKING_KEY, {})
}

/** Push a permission mode to the harness: sets YOLO and the per-category policies. */
export async function applyPermissionMode(
	mode: PermissionMode,
	threadId?: string,
) {
	await window.api.invoke({
		type: "setYoloMode",
		enabled: mode === "auto-approve",
		threadId,
	})
	for (const category of CATEGORIES) {
		await window.api.invoke({
			type: "setPermissionPolicy",
			category,
			policy: MODE_POLICIES[mode][category],
			permissionMode: mode,
			threadId,
		})
	}
}

export function useThreadConfig(currentThreadId: string | null) {
	const [modelsByThread, setModelsByThread] = useState<Record<string, string>>(
		loadSavedThreadModels,
	)
	const [permissionsByThread, setPermissionsByThread] = useState<
		Record<string, PermissionMode>
	>(loadSavedThreadPermissions)
	const [modesByThread, setModesByThread] =
		useState<Record<string, string>>(loadSavedThreadModes)
	const [thinkingByThread, setThinkingByThread] = useState<
		Record<string, string>
	>(loadSavedThreadThinking)

	const activeThreadKey = currentThreadId || "default"
	const currentThreadPermission =
		permissionsByThread[activeThreadKey] || "default"
	const currentThreadMode = modesByThread[activeThreadKey] || "react"
	const currentThreadThinking = thinkingByThread[activeThreadKey] || "off"

	const setThreadModel = useCallback((threadId: string, modelId: string) => {
		setModelsByThread((prev) => {
			const next = { ...prev, [threadId]: modelId }
			save(MODELS_KEY, next)
			return next
		})
	}, [])

	const setThreadPermission = useCallback(
		(threadId: string, permission: PermissionMode) => {
			setPermissionsByThread((prev) => {
				const next = { ...prev, [threadId]: permission }
				save(PERMISSIONS_KEY, next)
				return next
			})
		},
		[],
	)

	const setThreadMode = useCallback((threadId: string, modeId: string) => {
		setModesByThread((prev) => {
			const next = { ...prev, [threadId]: modeId }
			save(MODES_KEY, next)
			return next
		})
	}, [])

	const setThreadThinking = useCallback((threadId: string, level: string) => {
		setThinkingByThread((prev) => {
			const next = { ...prev, [threadId]: level }
			save(THINKING_KEY, next)
			return next
		})
	}, [])

	const removeThread = useCallback((threadId: string) => {
		setModelsByThread((prev) => {
			const next = { ...prev }
			delete next[threadId]
			save(MODELS_KEY, next)
			return next
		})
		setPermissionsByThread((prev) => {
			const next = { ...prev }
			delete next[threadId]
			save(PERMISSIONS_KEY, next)
			return next
		})
		setModesByThread((prev) => {
			const next = { ...prev }
			delete next[threadId]
			save(MODES_KEY, next)
			return next
		})
		setThinkingByThread((prev) => {
			const next = { ...prev }
			delete next[threadId]
			save(THINKING_KEY, next)
			return next
		})
	}, [])

	const syncFromThreadMetadata = useCallback(
		(
			threads: Array<{
				id: string
				metadata?: Record<string, unknown> | null
			}>,
		) => {
			setModelsByThread((prev) => {
				let changed = false
				const next = { ...prev }
				for (const t of threads) {
					const m = t.metadata?.modelId as string | undefined
					if (m && !next[t.id]) {
						next[t.id] = m
						changed = true
					}
				}
				if (changed) save(MODELS_KEY, next)
				return changed ? next : prev
			})
			setModesByThread((prev) => {
				let changed = false
				const next = { ...prev }
				for (const t of threads) {
					const m = t.metadata?.modeId as string | undefined
					if (m && !next[t.id]) {
						next[t.id] = m
						changed = true
					}
				}
				if (changed) save(MODES_KEY, next)
				return changed ? next : prev
			})
			setPermissionsByThread((prev) => {
				let changed = false
				const next = { ...prev }
				for (const t of threads) {
					const p = t.metadata?.permissionMode as PermissionMode | undefined
					if (p && !next[t.id]) {
						next[t.id] = p
						changed = true
					}
				}
				if (changed) save(PERMISSIONS_KEY, next)
				return changed ? next : prev
			})
			setThinkingByThread((prev) => {
				let changed = false
				const next = { ...prev }
				for (const t of threads) {
					const lvl = t.metadata?.thinkingLevel as string | undefined
					if (lvl && !next[t.id]) {
						next[t.id] = lvl
						changed = true
					}
				}
				if (changed) save(THINKING_KEY, next)
				return changed ? next : prev
			})
		},
		[],
	)

	return {
		modelsByThread,
		permissionsByThread,
		modesByThread,
		thinkingByThread,
		activeThreadKey,
		currentThreadPermission,
		currentThreadMode,
		currentThreadThinking,
		setThreadModel,
		setThreadPermission,
		setThreadMode,
		setThreadThinking,
		removeThread,
		syncFromThreadMetadata,
	}
}

export const useThreadModelPermissions = useThreadConfig
