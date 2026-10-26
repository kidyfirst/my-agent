import { useState, useCallback } from "react"
import { upgradeDeprecatedModel } from "../../constants/models"

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
	const raw = loadJson<Record<string, string>>(MODELS_KEY, {})
	const upgraded: Record<string, string> = {}
	let changed = false
	for (const [k, v] of Object.entries(raw)) {
		upgraded[k] = upgradeDeprecatedModel(v)
		if (upgraded[k] !== v) changed = true
	}
	if (changed) save(MODELS_KEY, upgraded)
	return upgraded
}

export function loadSavedThreadPermissions(): Record<string, PermissionMode> {
	return loadJson<Record<string, PermissionMode>>(PERMISSIONS_KEY, {})
}

/** Push a permission mode to the harness: sets YOLO and the per-category policies. */
export async function applyPermissionMode(mode: PermissionMode) {
	await window.api.invoke({
		type: "setYoloMode",
		enabled: mode === "auto-approve",
	})
	for (const category of CATEGORIES) {
		await window.api.invoke({
			type: "setPermissionPolicy",
			category,
			policy: MODE_POLICIES[mode][category],
		})
	}
}

export function useThreadModelPermissions(currentThreadId: string | null) {
	const [modelsByThread, setModelsByThread] = useState<Record<string, string>>(
		loadSavedThreadModels,
	)
	const [permissionsByThread, setPermissionsByThread] = useState<
		Record<string, PermissionMode>
	>(loadSavedThreadPermissions)

	const activeThreadKey = currentThreadId || "default"
	const currentThreadPermission =
		permissionsByThread[activeThreadKey] || "default"

	const setThreadModel = useCallback((threadId: string, modelId: string) => {
		const upgradedModel = upgradeDeprecatedModel(modelId)
		setModelsByThread((prev) => {
			const next = { ...prev, [threadId]: upgradedModel }
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
	}, [])

	return {
		modelsByThread,
		permissionsByThread,
		activeThreadKey,
		currentThreadPermission,
		setThreadModel,
		setThreadPermission,
		removeThread,
	}
}
