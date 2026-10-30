import * as path from "path"
import * as fs from "fs"
import { getAppDataDir } from "./project.js"

function getRecentProjectsPath(): string {
	if (process.env.MYAGENT_RECENT_PROJECTS_PATH) {
		return process.env.MYAGENT_RECENT_PROJECTS_PATH
	}
	return path.join(getAppDataDir(), "recent-projects.json")
}

export interface RecentProject {
	name: string
	rootPath: string
	lastOpened: string
	/**
	 * When the project was first added. The sidebar orders projects by this so
	 * that opening a session never reshuffles the list; `lastOpened` keeps
	 * changing and is only used to restore the last active project on startup.
	 */
	addedAt?: string
	lastThreadId?: string
}

export function loadRecentProjects(): Array<RecentProject> {
	try {
		const data = fs.readFileSync(getRecentProjectsPath(), "utf-8")
		const list = JSON.parse(data)
		if (!Array.isArray(list)) return []
		const filtered = list.filter(
			(p) =>
				p &&
				typeof p.rootPath === "string" &&
				p.rootPath.trim() !== "" &&
				p.rootPath !== "/" &&
				p.name &&
				p.name.trim() !== "",
		)
		// Deduplicate by normalized rootPath while preserving earlier entries
		const seen = new Set<string>()
		const deduped: RecentProject[] = []
		for (const p of filtered) {
			const norm = path.resolve(p.rootPath)
			if (seen.has(norm)) continue
			seen.add(norm)
			deduped.push({ ...p, rootPath: norm })
		}
		// Sort by lastOpened descending (most recent first)
		return deduped.sort((a, b) => {
			const timeA = a.lastOpened ? new Date(a.lastOpened).getTime() : 0
			const timeB = b.lastOpened ? new Date(b.lastOpened).getTime() : 0
			return timeB - timeA
		})
	} catch {
		return []
	}
}

function writeRecentProjects(projects: Array<RecentProject>): void {
	try {
		const targetPath = getRecentProjectsPath()
		const dir = path.dirname(targetPath)
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
		fs.writeFileSync(targetPath, JSON.stringify(projects, null, 2))
	} catch (err) {
		console.warn("Failed to write recent-projects.json:", err)
	}
}

export function getLastActiveProject(): RecentProject | null {
	const projects = loadRecentProjects()
	return projects.length > 0 ? projects[0] : null
}

export function saveRecentProject(
	projectPath: string,
	name: string,
	lastThreadId?: string,
) {
	if (!projectPath || projectPath === "/" || !projectPath.trim()) return
	const safePath = path.resolve(projectPath)
	const safeName = (name && name.trim()) || path.basename(safePath)
	if (!safeName) return

	const projects = loadRecentProjects()
	const existingIdx = projects.findIndex(
		(p) => path.resolve(p.rootPath) === safePath,
	)
	let target: RecentProject
	if (existingIdx !== -1) {
		target = projects.splice(existingIdx, 1)[0]
		target.rootPath = safePath
		// Captured once: legacy entries fall back to their previous `lastOpened`,
		// which is the closest available proxy for "when it was added".
		target.addedAt = target.addedAt || target.lastOpened
		target.lastOpened = new Date().toISOString()
		if (safeName && (!target.name || target.name.trim() === "")) {
			target.name = safeName
		}
		if (lastThreadId && lastThreadId.trim() !== "") {
			target.lastThreadId = lastThreadId
		}
	} else {
		const now = new Date().toISOString()
		target = {
			name: safeName,
			rootPath: safePath,
			addedAt: now,
			lastOpened: now,
			...(lastThreadId && lastThreadId.trim() !== "" ? { lastThreadId } : {}),
		}
	}
	projects.unshift(target)
	if (projects.length > 20) projects.length = 20
	writeRecentProjects(projects)
}

export function saveRecentProjectLastThread(
	projectPath: string,
	lastThreadId: string,
) {
	if (!projectPath || projectPath === "/" || !projectPath.trim()) return
	const safePath = path.resolve(projectPath)
	const safeName = path.basename(safePath)
	if (!safeName) return

	const projects = loadRecentProjects()
	const existingIdx = projects.findIndex(
		(p) => path.resolve(p.rootPath) === safePath,
	)
	let target: RecentProject
	if (existingIdx !== -1) {
		target = projects.splice(existingIdx, 1)[0]
		target.rootPath = safePath
		target.addedAt = target.addedAt || target.lastOpened
		if (lastThreadId && lastThreadId.trim() !== "") {
			target.lastThreadId = lastThreadId
		}
		target.lastOpened = new Date().toISOString()
	} else {
		const now = new Date().toISOString()
		target = {
			name: safeName,
			rootPath: safePath,
			addedAt: now,
			lastOpened: now,
			lastThreadId,
		}
	}
	projects.unshift(target)
	if (projects.length > 20) projects.length = 20
	writeRecentProjects(projects)
}

export function getRecentProjectLastThread(projectPath: string): string | null {
	const safePath = path.resolve(projectPath)
	const projects = loadRecentProjects()
	const existing = projects.find((p) => path.resolve(p.rootPath) === safePath)
	return existing?.lastThreadId || null
}

export function renameRecentProject(projectPath: string, newName: string) {
	if (!projectPath || projectPath === "/" || !newName.trim()) return
	const safePath = path.resolve(projectPath)
	const projects = loadRecentProjects()
	const existing = projects.find((p) => path.resolve(p.rootPath) === safePath)
	if (existing) {
		existing.name = newName.trim()
	} else {
		const now = new Date().toISOString()
		projects.unshift({
			name: newName.trim(),
			rootPath: safePath,
			addedAt: now,
			lastOpened: now,
		})
	}
	writeRecentProjects(projects)
}

export function removeRecentProject(projectPath: string) {
	const safePath = path.resolve(projectPath).replace(/\/+$/, "").toLowerCase()
	const projects = loadRecentProjects().filter((p) => {
		const r = path
			.resolve(p.rootPath || (p as any).path || "")
			.replace(/\/+$/, "")
			.toLowerCase()
		return r !== safePath
	})
	writeRecentProjects(projects)
}
