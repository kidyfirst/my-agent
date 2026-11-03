import * as fs from "node:fs"
import * as path from "node:path"
import { SessionRecorder } from "./session-recorder.js"
import type { ReplayLanguageModel } from "./replay.js"
import type { RecordedRuntime } from "./types.js"

export class SessionRecordingManager {
	private static instance: SessionRecordingManager | null = null

	private recordingThreads = new Set<string>()
	private recordingProjects = new Set<string>()
	private activeRecorders = new Map<string, SessionRecorder>()
	private activeReplayModels = new Map<string, ReplayLanguageModel>()
	/** What the session looked like before a replay took over, so it can be restored. */
	private savedReplayRuntimes = new Map<string, RecordedRuntime>()

	static getInstance(): SessionRecordingManager {
		if (!SessionRecordingManager.instance) {
			SessionRecordingManager.instance = new SessionRecordingManager()
		}
		return SessionRecordingManager.instance
	}

	normalizePath(p?: string): string {
		if (!p) return ""
		return path.resolve(p).replace(/\/+$/, "").toLowerCase()
	}

	isRecording(threadId?: string, projectPath?: string): boolean {
		if (threadId && this.recordingThreads.has(threadId)) {
			return true
		}
		if (projectPath) {
			const norm = this.normalizePath(projectPath)
			for (const p of this.recordingProjects) {
				if (this.normalizePath(p) === norm) {
					return true
				}
			}
		}
		return false
	}

	startRecording(threadId?: string, projectPath?: string): void {
		if (threadId) {
			this.recordingThreads.add(threadId)
		}
		if (projectPath) {
			this.recordingProjects.add(projectPath)
		}
	}

	stopRecording(threadId?: string, projectPath?: string): void {
		if (threadId) {
			this.recordingThreads.delete(threadId)
			const rec = this.activeRecorders.get(threadId)
			if (rec) {
				rec.close().catch(() => {})
				this.activeRecorders.delete(threadId)
			}
		}
		if (projectPath) {
			const norm = this.normalizePath(projectPath)
			for (const p of this.recordingProjects) {
				if (this.normalizePath(p) === norm) {
					this.recordingProjects.delete(p)
				}
			}
		}
	}

	toggleRecording(
		threadId?: string,
		projectPath?: string,
		enabled?: boolean,
	): boolean {
		const currentlyActive = this.isRecording(threadId, projectPath)
		const targetState = enabled !== undefined ? enabled : !currentlyActive

		if (targetState) {
			this.startRecording(threadId, projectPath)
		} else {
			this.stopRecording(threadId, projectPath)
		}
		return targetState
	}

	getStatus(): { recordingThreads: string[]; recordingProjects: string[] } {
		return {
			recordingThreads: Array.from(this.recordingThreads),
			recordingProjects: Array.from(this.recordingProjects),
		}
	}

	getOrCreateRecorder(options: {
		threadId: string
		runId: string
		sessionsDir: string
		cwd: string
		model: string
		runtime?: RecordedRuntime
	}): SessionRecorder | null {
		if (!this.isRecording(options.threadId, options.cwd)) {
			return null
		}
		const recorder = new SessionRecorder(options)
		this.activeRecorders.set(options.threadId, recorder)
		return recorder
	}

	getRecorder(threadId: string): SessionRecorder | null {
		return this.activeRecorders.get(threadId) || null
	}

	finishRecorder(threadId: string): void {
		const rec = this.activeRecorders.get(threadId)
		if (rec) {
			rec.close().catch(() => {})
			this.activeRecorders.delete(threadId)
		}
	}

	setReplayModel(threadId: string, model: ReplayLanguageModel): void {
		this.activeReplayModels.set(threadId, model)
	}

	getReplayModel(threadId: string): ReplayLanguageModel | null {
		return this.activeReplayModels.get(threadId) || null
	}

	clearReplayModel(threadId: string): void {
		this.activeReplayModels.delete(threadId)
	}

	/**
	 * Remember the session runtime before a replay overrides it.
	 *
	 * First write wins: replaying again inside an active replay must not
	 * overwrite the *user's* original model/mode with the recorded one.
	 */
	saveReplayRuntime(threadId: string, runtime: RecordedRuntime): void {
		if (this.savedReplayRuntimes.has(threadId)) return
		this.savedReplayRuntimes.set(threadId, runtime)
	}

	takeReplayRuntime(threadId: string): RecordedRuntime | undefined {
		const saved = this.savedReplayRuntimes.get(threadId)
		this.savedReplayRuntimes.delete(threadId)
		return saved
	}

	listRecordings(
		sessionsDir: string,
		filterThreadId?: string,
	): Array<{
		filePath: string
		threadId: string
		runId: string
		size: number
		mtime: number
	}> {
		const results: Array<{
			filePath: string
			threadId: string
			runId: string
			size: number
			mtime: number
		}> = []

		if (!fs.existsSync(sessionsDir)) return results

		try {
			const threadDirs = filterThreadId
				? [filterThreadId]
				: fs.readdirSync(sessionsDir)

			for (const tId of threadDirs) {
				const threadPath = path.join(sessionsDir, tId)
				if (
					!fs.existsSync(threadPath) ||
					!fs.statSync(threadPath).isDirectory()
				) {
					continue
				}
				const files = fs.readdirSync(threadPath)
				for (const f of files) {
					if (!f.endsWith(".jsonl")) continue
					const fullPath = path.join(threadPath, f)
					try {
						const stat = fs.statSync(fullPath)
						results.push({
							filePath: fullPath,
							threadId: tId,
							runId: f.replace(/\.jsonl$/, ""),
							size: stat.size,
							mtime: stat.mtimeMs,
						})
					} catch {}
				}
			}
		} catch (err) {
			console.error("[SessionRecordingManager] Failed to list recordings:", err)
		}

		return results.sort((a, b) => b.mtime - a.mtime)
	}
}

export const sessionRecordingManager = SessionRecordingManager.getInstance()
