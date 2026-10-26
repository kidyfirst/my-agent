import type { BrowserWindow } from "electron"
import type * as pty from "node-pty"
import type { MyAgentHarness as Harness, Session } from "../../harness/index.js"
import type { HarnessState } from "../../harness/state.js"
import type { ElectronStateManager } from "../electron-state.js"
import type { PlaywrightBrowserManager } from "../../browser/playwright-manager.js"
import type { MCPManager } from "../../mcp/manager.js"
import type { AuthStorage } from "../../auth/storage.js"
import type { ModelResolver } from "../../harness/model-resolver.js"

export type { Session }

export interface WorktreeSession {
	harness: Harness
	session?: Session<HarnessState> | null
	mcpManager?: MCPManager
	browserManager: PlaywrightBrowserManager
	resolveModel: ModelResolver
	authStorage: AuthStorage
	electronState: ElectronStateManager
	projectRoot: string
	unsubscribe: (() => void) | null
	ptySessions: Map<string, pty.IPty>
}

export interface AgentTiming {
	startedAt: number | null
	totalDurationMs: number
	currentModelId: string | null
}

export type IpcCommandHandler = (
	command: any,
	ctx: HandlerContext,
) => Promise<any>

export interface HandlerContext {
	getActiveSession: () => WorktreeSession
	mainWindow: BrowserWindow | null
	sessions: Map<string, WorktreeSession>
	activeSessionPath: string
	setActiveSessionPath: (path: string) => void
	sessionTimings: Map<string, AgentTiming>
	cleanupSession: (path: string) => void
	bridgeAllEvents: (window: BrowserWindow) => void
	createHarness: (path: string) => Promise<{
		harness: Harness
		mcpManager?: MCPManager
		browserManager: PlaywrightBrowserManager
		resolveModel: ModelResolver
		authStorage: AuthStorage
		electronState: ElectronStateManager
	}>
	ensureAuthenticatedModel: (
		h: Harness,
		authStorage: AuthStorage,
	) => Promise<void>
	generateThreadTitle: (
		h: Harness,
		userMessage: string,
		resolveModel: ModelResolver,
	) => Promise<void>
	deleteThread: (h: Harness, threadId: string) => Promise<void>
}
