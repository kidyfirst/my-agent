import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import type { IpcCommandHandler, WorktreeSession } from "./types.js"
import { safeSend } from "../helpers.js"
import {
	detectProject,
	getDatabasePath,
	pathCreatedAt,
	resourceIdVariants,
} from "../../utils/project.js"
import { deleteThreadTaskChanges } from "../task-changes-store.js"
import { readProjectThreadsByPath } from "../project-threads.js"
import { deleteThreadInDb, renameThreadInDb } from "../project-thread-write.js"
import {
	loadRecentProjects,
	saveRecentProject,
	renameRecentProject,
	removeRecentProject,
} from "../../utils/recent-projects.js"

export function purgeProjectHistory(projectPath: string): void {
	if (!projectPath || projectPath === "/" || !projectPath.trim()) return
	try {
		const { DatabaseSync } = require("node:sqlite")
		const dbPath = getDatabasePath()
		if (!fs.existsSync(dbPath)) return

		const proj = detectProject(projectPath)
		const resourceIds = new Set<string>()
		if (proj.resourceId) resourceIds.add(proj.resourceId)

		// Check for worktrees associated with this repo
		try {
			const { execSync } = require("child_process")
			if (
				fs.existsSync(projectPath) &&
				fs.statSync(projectPath).isDirectory()
			) {
				const output = execSync("git worktree list --porcelain", {
					cwd: projectPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				}) as string
				for (const block of output.split("\n\n").filter(Boolean)) {
					const firstLine = block.split("\n")[0]
					if (firstLine.startsWith("worktree ")) {
						const wtPath = firstLine.slice(9).trim()
						if (wtPath && wtPath !== projectPath) {
							const wtProj = detectProject(wtPath)
							if (wtProj.resourceId) resourceIds.add(wtProj.resourceId)
						}
					}
				}
			}
		} catch {
			// ignore git failure
		}

		const db = new DatabaseSync(dbPath)
		try {
			db.exec("BEGIN TRANSACTION;")
			for (const resId of resourceIds) {
				try {
					const threads = db
						.prepare("SELECT id FROM myagent_threads WHERE resourceId = ?")
						.all(resId) as Array<{ id: string }>
					for (const t of threads) {
						if (t?.id) {
							deleteThreadTaskChanges(t.id)
							db.prepare(
								"DELETE FROM myagent_messages WHERE thread_id = ?",
							).run(t.id)
						}
					}
				} catch {}

				try {
					db.prepare("DELETE FROM myagent_messages WHERE resourceId = ?").run(
						resId,
					)
				} catch {}
				try {
					db.prepare("DELETE FROM myagent_threads WHERE resourceId = ?").run(
						resId,
					)
				} catch {}
				try {
					db.prepare(
						"DELETE FROM myagent_observational_memory WHERE resourceId = ?",
					).run(resId)
				} catch {}
			}
			db.exec("COMMIT;")
		} catch (err) {
			try {
				db.exec("ROLLBACK;")
			} catch {}
			console.error("[purgeProjectHistory] Error purging SQLite records:", err)
		} finally {
			try {
				db.close()
			} catch {}
		}
	} catch (err) {
		console.error("[purgeProjectHistory] Failed:", err)
	}
}

export function getProjectHandlers(): Record<string, IpcCommandHandler> {
	return {
		getProjectInfo: async (_command, ctx) => {
			if (!ctx.activeSessionPath) return null
			const recent = loadRecentProjects()
			const normActive = path
				.resolve(ctx.activeSessionPath)
				.replace(/\/+$/, "")
				.toLowerCase()
			const isProject = recent.some((r) => {
				const normRoot = path
					.resolve(r.rootPath)
					.replace(/\/+$/, "")
					.toLowerCase()
				return (
					normRoot === normActive ||
					normActive.startsWith(normRoot + "/") ||
					normActive.startsWith(normRoot + "\\")
				)
			})
			if (!isProject) return null

			const projectRoot = ctx.getActiveSession().projectRoot
			const project = detectProject(projectRoot)
			return {
				name: project.name,
				rootPath: project.rootPath,
				gitBranch: project.gitBranch,
				isGitRepo: project.isGitRepo,
				isWorktree: project.isWorktree,
			}
		},
		getRecentProjects: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projects = loadRecentProjects()

			const enriched = projects.map((p) => {
				let gitBranch: string | undefined
				let isWorktree = false
				let mainRepoPath: string | undefined
				const worktrees: Array<{
					path: string
					branch: string
					createdAt?: string
				}> = []
				// Creation order, not last-opened order: the sidebar must stay put.
				const createdAt = p.addedAt || p.lastOpened || undefined
				let exists = true
				try {
					if (!fs.existsSync(p.rootPath)) {
						exists = false
						return {
							...p,
							createdAt,
							gitBranch,
							isWorktree,
							mainRepoPath,
							worktrees,
							exists,
						}
					}
					const info = detectProject(p.rootPath)
					gitBranch = info.gitBranch
					isWorktree = info.isWorktree
					mainRepoPath = info.mainRepoPath
					const repoPath = info.mainRepoPath || p.rootPath
					const output = execSync("git worktree list --porcelain", {
						cwd: repoPath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					}) as string
					const blocks = output.split("\n\n").filter(Boolean)
					for (const block of blocks) {
						const lines = block.split("\n")
						const wt: Record<string, string | boolean> = {}
						for (const line of lines) {
							if (line.startsWith("worktree ")) wt.path = line.slice(9)
							else if (line.startsWith("branch "))
								wt.branch = (line.slice(7) as string).replace("refs/heads/", "")
							else if (line === "bare") wt.isBare = true
						}
						if (wt.path && !wt.isBare && wt.path !== repoPath) {
							const customWt = projects.find((cp) => cp.rootPath === wt.path)
							worktrees.push({
								path: wt.path as string,
								// A worktree is identified by its own branch — its sessions
								// hang under that row in the sidebar. Falling back to the
								// project name would label it with the repo it was cut from
								// (e.g. "my-agent"), making it indistinguishable from the
								// project row right above it.
								branch:
									(wt.branch as string) ||
									customWt?.name ||
									path.basename(wt.path as string) ||
									"detached",
								// `git worktree list` has no timestamps; a worktree the user
								// added as a project keeps its addedAt, otherwise use the
								// directory's own creation time.
								createdAt:
									customWt?.addedAt || pathCreatedAt(wt.path as string),
							})
						}
					}
				} catch {
					// not a git repo or worktree detection failed
				}
				return {
					...p,
					createdAt,
					gitBranch,
					isWorktree,
					mainRepoPath,
					worktrees,
					exists,
				}
			})

			const rootPaths = new Set(
				enriched
					.filter((p) => !p.isWorktree && p.exists)
					.map((p) => p.rootPath),
			)
			const worktreePathsUnderRoots = new Set<string>()
			for (const p of enriched) {
				if (!p.isWorktree && p.exists) {
					for (const wt of p.worktrees) {
						worktreePathsUnderRoots.add(wt.path)
					}
				}
			}

			const result = enriched.filter((p) => {
				if (
					!p.exists ||
					!p.rootPath ||
					p.rootPath === "/" ||
					!p.name ||
					!p.name.trim()
				)
					return false
				if (p.isWorktree && p.mainRepoPath && rootPaths.has(p.mainRepoPath))
					return false
				if (p.isWorktree && worktreePathsUnderRoots.has(p.rootPath))
					return false
				return true
			})

			// Prune sessions whose paths no longer exist on disk
			const validPaths = new Set(result.map((p) => p.rootPath))
			for (const p of result) {
				for (const wt of p.worktrees) validPaths.add(wt.path)
			}
			for (const sessionPath of ctx.sessions.keys()) {
				if (!validPaths.has(sessionPath) && !fs.existsSync(sessionPath)) {
					ctx.cleanupSession(sessionPath)
				}
			}

			return result
		},
		/**
		 * Sessions of every folder in the sidebar, keyed by path. Read straight
		 * from the threads table so a project that isn't open can still show its
		 * sessions (see `project-threads.ts`).
		 */
		listProjectThreads: async (command) => {
			const paths = Array.isArray(command.paths)
				? (command.paths as unknown[]).filter(
						(p): p is string => typeof p === "string" && p.length > 0,
					)
				: []
			return readProjectThreadsByPath(paths)
		},
		/**
		 * Rename or delete a session of a project that is not open.
		 *
		 * The active harness can only reach its own threads, so the sidebar's
		 * ⋯ menu on a sibling project's session writes to the threads table
		 * directly (see `project-thread-write.ts`). The path is resolved to its
		 * `resourceId` first, which keeps the write scoped to that one folder.
		 */
		mutateProjectThread: async (command) => {
			const projectPath =
				typeof command.projectPath === "string" ? command.projectPath : ""
			const threadId =
				typeof command.threadId === "string" ? command.threadId : ""
			const action = command.action === "delete" ? "delete" : "rename"
			if (!projectPath || projectPath === "/" || !threadId) {
				return { ok: false }
			}

			const { resourceId } = detectProject(projectPath)
			if (!resourceId) return { ok: false }

			const dbPath = getDatabasePath()
			// The folder may be stored under more than one id (path-keyed before a
			// remote existed, URL-keyed afterwards); the write has to reach
			// whichever one wrote the row.
			const scopes = (() => {
				try {
					return resourceIdVariants(projectPath)
				} catch {
					return [resourceId]
				}
			})()
			if (action === "rename") {
				const title = typeof command.title === "string" ? command.title : ""
				return {
					ok: renameThreadInDb({
						dbPath,
						resourceId: scopes,
						threadId,
						title,
					}),
				}
			}

			const ok = deleteThreadInDb({
				dbPath,
				resourceId: scopes,
				threadId,
			})
			if (ok) deleteThreadTaskChanges(threadId)
			return { ok }
		},
		removeRecentProject: async (command, ctx) => {
			const projectPath = command.path as string
			const deleteHistory = Boolean(command.deleteHistory)

			removeRecentProject(projectPath)
			ctx.cleanupSession(projectPath)

			if (deleteHistory) {
				purgeProjectHistory(projectPath)
			}

			const safeRemoved = path
				.resolve(projectPath)
				.replace(/\/+$/, "")
				.toLowerCase()
			const safeActive = path
				.resolve(ctx.activeSessionPath || "")
				.replace(/\/+$/, "")
				.toLowerCase()

			if (
				safeActive === safeRemoved ||
				safeActive.startsWith(safeRemoved + "/") ||
				safeActive.startsWith(safeRemoved + "\\")
			) {
				const recent = loadRecentProjects()
				const fallback =
					recent.find((r) => r.rootPath && fs.existsSync(r.rootPath))
						?.rootPath || ""
				ctx.setActiveSessionPath(fallback)
			}
			return { success: true }
		},
		createWorktree: async (command) => {
			const { execSync } = require("child_process")
			const repoPath = command.repoPath as string
			const requestedBranch = command.branchName as string | undefined

			const usedNames = new Set<string>()
			try {
				const output = execSync("git worktree list --porcelain", {
					cwd: repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				}) as string
				for (const block of output.split("\n\n").filter(Boolean)) {
					for (const line of block.split("\n")) {
						if (line.startsWith("branch ")) {
							usedNames.add(line.slice(7).replace("refs/heads/", ""))
						}
					}
				}
			} catch {
				return { success: false, error: "Not a git repository" }
			}

			const flowerNames = [
				"acacia",
				"aconite",
				"agapanthus",
				"alchemilla",
				"allium",
				"aloe",
				"alstroemeria",
				"amaranth",
				"amaryllis",
				"anemone",
				"angelica",
				"anise",
				"anthurium",
				"aster",
				"astilbe",
				"azalea",
				"banksia",
				"begonia",
				"bellflower",
				"bergamot",
				"bluebell",
				"bougainvillea",
				"buttercup",
				"calendula",
				"camellia",
				"campanula",
				"candytuft",
				"carnation",
				"celosia",
				"chamomile",
				"chrysanthemum",
				"clematis",
				"clover",
				"columbine",
				"coneflower",
				"coral",
				"coreopsis",
				"cornflower",
				"cosmos",
				"crocus",
				"cyclamen",
				"daffodil",
				"dahlia",
				"daisy",
				"dandelion",
				"daphne",
				"delphinium",
				"dianthus",
				"echinacea",
				"edelweiss",
				"elderflower",
				"eucalyptus",
				"evening",
				"fennel",
				"fern",
				"feverfew",
				"flax",
				"forget",
				"forsythia",
				"foxglove",
				"freesia",
				"fuchsia",
				"gardenia",
				"gentian",
				"geranium",
				"gerbera",
				"gladiolus",
				"goldenrod",
				"hawthorne",
				"heather",
				"hellebore",
				"hemlock",
				"hibiscus",
				"holly",
				"hollyhock",
				"honeysuckle",
				"hyacinth",
				"hydrangea",
				"hyssop",
				"impatiens",
				"iris",
				"ivy",
				"jasmine",
				"juniper",
				"kalmia",
				"lantana",
				"larkspur",
				"laurel",
				"lavender",
				"lilac",
				"lily",
				"linden",
				"lobelia",
				"lotus",
				"lupin",
				"magnolia",
				"mallow",
				"marigold",
				"meadow",
				"mint",
				"moonflower",
				"myrtle",
				"narcissus",
				"nasturtium",
				"nettle",
				"nightshade",
				"oleander",
				"orchid",
				"oregano",
				"osmanthus",
				"pansy",
				"passionflower",
				"peony",
				"periwinkle",
				"petunia",
				"phlox",
				"plumeria",
				"poppy",
				"primrose",
				"protea",
				"ranunculus",
				"rhododendron",
				"rose",
				"rosemary",
				"rudbeckia",
				"rue",
				"saffron",
				"sage",
				"sakura",
				"salvia",
				"snapdragon",
				"snowdrop",
				"sorrel",
				"stargazer",
				"statice",
				"stephanotis",
				"stock",
				"sunflower",
				"sweetpea",
				"tansy",
				"thistle",
				"thyme",
				"trillium",
				"tuberose",
				"tulip",
				"valerian",
				"verbena",
				"veronica",
				"viburnum",
				"viola",
				"violet",
				"wisteria",
				"yarrow",
				"yucca",
				"zinnia",
			]
			let branchName: string
			if (requestedBranch) {
				if (usedNames.has(requestedBranch)) {
					return {
						success: false,
						error: `Branch "${requestedBranch}" already exists`,
					}
				}
				branchName = requestedBranch
			} else {
				const available = flowerNames.filter((n) => !usedNames.has(n))
				if (available.length === 0) {
					return { success: false, error: "No available workspace names" }
				}
				branchName = available[Math.floor(Math.random() * available.length)]
			}

			const repoName = path.basename(repoPath)
			const workspacesDir = path.join(
				os.homedir(),
				"my-agent",
				"workspaces",
				repoName,
			)
			const worktreePath = path.join(workspacesDir, branchName)

			try {
				if (!fs.existsSync(workspacesDir)) {
					fs.mkdirSync(workspacesDir, { recursive: true })
				}
				execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
					cwd: repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})
				return { success: true, path: worktreePath, branch: branchName }
			} catch (e: any) {
				const msg = e.stderr?.trim() || e.message || "Failed to create worktree"
				return { success: false, error: msg }
			}
		},
		switchProject: async (command, ctx) => {
			const newPath = command.path as string

			if (ctx.sessions.has(newPath)) {
				// Fast path: session already exists
				ctx.setActiveSessionPath(newPath)
				if (ctx.mainWindow) ctx.bridgeAllEvents(ctx.mainWindow)

				const cachedState = ctx.sessions.get(newPath)!.harness.getState?.() as
					| { projectName?: string; gitBranch?: string }
					| undefined
				const fastProject = {
					name: cachedState?.projectName || path.basename(newPath),
					rootPath: newPath,
					gitBranch: cachedState?.gitBranch,
					isWorktree: true,
				}
				const currentThreadId = ctx.sessions
					.get(newPath)!
					.harness.getCurrentThreadId()
				safeSend(ctx.mainWindow, "harness:event", {
					type: "project_changed",
					project: fastProject,
					currentThreadId,
				})
				saveRecentProject(newPath, fastProject.name, currentThreadId)
				return { project: fastProject, currentThreadId }
			}

			// Slow path: first visit — create harness
			const project = detectProject(newPath)
			const result = await ctx.createHarness(newPath)
			const newSession: WorktreeSession = {
				harness: result.harness,
				get session() {
					return result.harness.activeSession
				},
				mcpManager: result.mcpManager,
				browserManager: result.browserManager,
				resolveModel: result.resolveModel,
				authStorage: result.authStorage,
				electronState: result.electronState,
				projectRoot: newPath,
				unsubscribe: null,
				ptySessions: new Map(),
			}
			ctx.sessions.set(newPath, newSession)
			ctx.setActiveSessionPath(newPath)
			if (ctx.mainWindow) ctx.bridgeAllEvents(ctx.mainWindow)
			await newSession.harness.init()
			await ctx.ensureAuthenticatedModel(
				newSession.harness,
				newSession.authStorage,
			)
			await newSession.harness.loadOMProgress?.().catch(() => {})
			if (newSession.mcpManager?.hasServers())
				await newSession.mcpManager.init()

			const currentThreadId = newSession.harness.getCurrentThreadId()
			safeSend(ctx.mainWindow, "harness:event", {
				type: "project_changed",
				project: {
					name: project.name,
					rootPath: project.rootPath,
					gitBranch: project.gitBranch,
					isWorktree: project.isWorktree,
				},
				currentThreadId,
			})

			saveRecentProject(newPath, project.name, currentThreadId)
			return { project, currentThreadId }
		},
		deleteWorktree: async (command, ctx) => {
			const { execSync } = require("child_process")
			const wtPath = command.worktreePath as string
			console.log("[deleteWorktree] Deleting worktree at:", wtPath)

			ctx.cleanupSession(wtPath)

			if (ctx.activeSessionPath === wtPath) {
				const remaining = [...ctx.sessions.keys()].filter((p) => p !== wtPath)
				const fallback = remaining[0] || process.cwd()
				ctx.setActiveSessionPath(fallback)
			}

			try {
				const gitCommonDir = execSync("git rev-parse --git-common-dir", {
					cwd: wtPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				}).trim()
				const mainRepo = path.resolve(wtPath, gitCommonDir, "..")

				execSync(`git worktree remove "${wtPath}" --force`, {
					cwd: mainRepo,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})

				removeRecentProject(wtPath)
				purgeProjectHistory(wtPath)
				return { success: true }
			} catch (e: any) {
				const msg = e.stderr?.trim() || e.message || "Failed to delete worktree"
				console.error("[deleteWorktree] Error:", msg)
				return { success: false, error: msg }
			}
		},
		renameProject: async (command, _ctx) => {
			const projectPath = command.projectPath as string
			const newName = (command.newName as string)?.trim()
			if (!projectPath || !newName) return { success: false }
			renameRecentProject(projectPath, newName)
			return { success: true }
		},
		/**
		 * Rename the branch a worktree has checked out.
		 *
		 * The sidebar labels a worktree by its branch, so an inline edit there
		 * has to move the branch itself — an alias kept only for display would
		 * leave `git status`, the PR panel and the ⌘K list quoting the old name.
		 *
		 * `git branch -m <new>` (no source branch) renames whatever is checked
		 * out at `cwd`, which is the only form git accepts while that branch is
		 * held by this worktree. The directory keeps its old name: paths are how
		 * sessions, task changes and issue links are keyed, so nothing moves.
		 */
		renameWorktree: async (command) => {
			const { execFileSync } = require("child_process")
			const wtPath = command.worktreePath as string
			const newName = (command.newName as string)?.trim()
			if (!wtPath || !newName) {
				return { success: false, error: "Branch name is required" }
			}

			try {
				// Surfaces "invalid ref name" as a readable message instead of a
				// raw git trace from `branch -m`.
				execFileSync("git", ["check-ref-format", "--branch", newName], {
					cwd: wtPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})
				execFileSync("git", ["branch", "-m", newName], {
					cwd: wtPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})
				return { success: true, branch: newName }
			} catch (e: any) {
				const msg = (
					e.stderr?.trim()?.split("\n").pop() ||
					e.message ||
					"Failed to rename worktree branch"
				).replace(/^fatal:\s*/, "")
				console.error("[renameWorktree] Error:", msg)
				return { success: false, error: msg }
			}
		},
	}
}
