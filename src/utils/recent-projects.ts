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
	lastThreadId?: string
}

export function loadRecentProjects(): Array<RecentProject> {
	try {
		const data = fs.readFileSync(getRecentProjectsPath(), "utf-8")
		const list = JSON.parse(data)
		if (!Array.isArray(list)) return []
		return list.filter(
			(p) =>
				p &&
				typeof p.rootPath === "string" &&
				p.rootPath.trim() !== "" &&
				p.rootPath !== "/" &&
				p.name &&
				p.name.trim() !== "",
		)
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

export function saveRecentProject(
	projectPath: string,
	name: string,
	lastThreadId?: string,
) {
	if (!projectPath || projectPath === "/" || !projectPath.trim()) return
	const safeName = (name && name.trim()) || path.basename(projectPath)
	if (!safeName) return

	const projects = loadRecentProjects()
	const existing = projects.find((p) => p.rootPath === projectPath)
	if (existing) {
		existing.lastOpened = new Date().toISOString()
		// Only set name if existing has no name
		if (!existing.name) {
			existing.name = safeName
		}
		if (lastThreadId) {
			existing.lastThreadId = lastThreadId
		}
	} else {
		projects.push({
			name: safeName,
			rootPath: projectPath,
			lastOpened: new Date().toISOString(),
			...(lastThreadId ? { lastThreadId } : {}),
		})
	}
	if (projects.length > 20) projects.length = 20
	writeRecentProjects(projects)
}

export function saveRecentProjectLastThread(
	projectPath: string,
	lastThreadId: string,
) {
	if (!projectPath || projectPath === "/" || !projectPath.trim()) return
	const safeName = path.basename(projectPath)
	if (!safeName) return

	const projects = loadRecentProjects()
	const existing = projects.find((p) => p.rootPath === projectPath)
	if (existing) {
		existing.lastThreadId = lastThreadId
		existing.lastOpened = new Date().toISOString()
	} else {
		projects.push({
			name: safeName,
			rootPath: projectPath,
			lastOpened: new Date().toISOString(),
			lastThreadId,
		})
	}
	writeRecentProjects(projects)
}

export function getRecentProjectLastThread(projectPath: string): string | null {
	const projects = loadRecentProjects()
	const existing = projects.find((p) => p.rootPath === projectPath)
	return existing?.lastThreadId || null
}

export function renameRecentProject(projectPath: string, newName: string) {
	if (!projectPath || projectPath === "/" || !newName.trim()) return
	const projects = loadRecentProjects()
	const existing = projects.find((p) => p.rootPath === projectPath)
	if (existing) {
		existing.name = newName.trim()
	} else {
		projects.push({
			name: newName.trim(),
			rootPath: projectPath,
			lastOpened: new Date().toISOString(),
		})
	}
	writeRecentProjects(projects)
}

export function removeRecentProject(projectPath: string) {
	const projects = loadRecentProjects().filter(
		(p) => p.rootPath !== projectPath,
	)
	writeRecentProjects(projects)
}
