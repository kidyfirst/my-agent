import * as fs from "fs"
import * as path from "path"
import { getAppDataDir } from "../utils/project.js"
import type { ChangedFile } from "./git-task-snapshot.js"

/**
 * Per-task record of the files a task changed. Persisted so the "files
 * changed" card survives an app restart: the live git baseline is only kept in
 * memory, and the diff is recomputed against the current HEAD, which drifts
 * once the task's work is committed.
 */
export interface StoredTaskChanges {
	files: ChangedFile[]
	/** Unified diff per path, captured when the task ended. */
	diffs: Record<string, string>
	updatedAt: string
}

type ThreadChanges = Record<string, StoredTaskChanges>
type TaskChangesStore = Record<string, ThreadChanges>

const MAX_THREADS = 40
const MAX_TASKS_PER_THREAD = 80
const MAX_DIFF_LENGTH = 200_000

let cache: TaskChangesStore | null = null

function storePath(): string {
	return path.join(getAppDataDir(), "task-changes.json")
}

function load(): TaskChangesStore {
	if (cache) return cache
	try {
		const parsed = JSON.parse(fs.readFileSync(storePath(), "utf-8"))
		cache =
			parsed && typeof parsed === "object" ? (parsed as TaskChangesStore) : {}
	} catch {
		cache = {}
	}
	return cache
}

function newestFirst(changes: ThreadChanges): string[] {
	return Object.keys(changes).sort((a, b) =>
		(changes[b]?.updatedAt || "").localeCompare(changes[a]?.updatedAt || ""),
	)
}

function prune(store: TaskChangesStore): void {
	for (const [threadId, changes] of Object.entries(store)) {
		const ids = Object.keys(changes)
		if (ids.length === 0) {
			delete store[threadId]
			continue
		}
		if (ids.length <= MAX_TASKS_PER_THREAD) continue
		for (const id of newestFirst(changes).slice(MAX_TASKS_PER_THREAD)) {
			delete changes[id]
		}
	}

	const threadIds = Object.keys(store)
	if (threadIds.length <= MAX_THREADS) return
	const latestUpdate = (threadId: string) =>
		newestFirst(store[threadId])
			.slice(0, 1)
			.reduce((max, id) => {
				const time = Date.parse(store[threadId][id]?.updatedAt || "")
				return Number.isNaN(time) ? max : Math.max(max, time)
			}, 0)
	threadIds.sort((a, b) => latestUpdate(b) - latestUpdate(a))
	for (const threadId of threadIds.slice(MAX_THREADS)) delete store[threadId]
}

function persist(store: TaskChangesStore): void {
	const target = storePath()
	try {
		fs.mkdirSync(path.dirname(target), { recursive: true })
		fs.writeFileSync(target, JSON.stringify(store))
	} catch (err) {
		console.warn("Failed to persist task changes:", err)
	}
}

/** Record the files (and their diffs) that a task changed. */
export function saveTaskChanges(params: {
	threadId: string
	messageId: string
	files: ChangedFile[]
	diffs: Record<string, string>
}): void {
	const { threadId, messageId, files } = params
	if (!threadId || !messageId || files.length === 0) return

	const diffs: Record<string, string> = {}
	for (const [file, diff] of Object.entries(params.diffs)) {
		if (!diff) continue
		diffs[file] =
			diff.length > MAX_DIFF_LENGTH ? diff.slice(0, MAX_DIFF_LENGTH) : diff
	}

	const store = load()
	store[threadId] = store[threadId] || {}
	store[threadId][messageId] = {
		files,
		diffs,
		updatedAt: new Date().toISOString(),
	}
	prune(store)
	persist(store)
}

/** All stored tasks of a thread, keyed by the assistant message id. */
export function getThreadTaskChanges(threadId: string): ThreadChanges {
	if (!threadId) return {}
	return load()[threadId] ?? {}
}

/** Diff captured for a file of a specific task, or null when unknown. */
export function getStoredFileDiff(
	threadId: string,
	messageId: string,
	filePath: string,
): string | null {
	if (!threadId || !messageId || !filePath) return null
	const diff = load()[threadId]?.[messageId]?.diffs?.[filePath]
	return typeof diff === "string" ? diff : null
}

export function deleteThreadTaskChanges(threadId: string): void {
	const store = load()
	if (!threadId || !store[threadId]) return
	delete store[threadId]
	persist(store)
}
