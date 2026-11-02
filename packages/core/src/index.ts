// Core Controller & Runtime
export {
	AgentController,
	Session,
	type SessionConfig,
	type HarnessConfig,
	type HarnessMode,
	type HarnessThread,
	type AvailableModel,
	type TokenUsage,
} from "./core/controller/controller.js"

// Graphs & Runner
export {
	GraphRunner,
	defaultGraphRunner,
	reactGraphDefinition,
	reactTopology,
	chatGraphDefinition,
	chatTopology,
	planSolveGraphDefinition,
	planSolveTopology,
	registerBuiltinGraphs,
	type GraphRunResult,
	type GraphTopologyMetadata,
} from "./core/graph/index.js"

// Harness
export {
	createMyAgent,
	createAgentHarness,
	normalizeControllerMessage,
	type MyAgentHarness,
	type MyAgentConfig,
	type MyAgentEvent,
	type CreateMyAgentResult,
	type SendMessageOptions,
} from "./harness/index.js"
export { createDynamicModelGetter } from "./harness/model-resolver.js"

// Storage & Memory
export { SQLiteStore } from "./store/index.js"

// Snapshot & Rollback
export {
	captureGitSnapshot,
	revertToGitSnapshot,
	diffBetweenSnapshots,
	type GitSnapshot,
	type ChangedFile,
} from "./snapshot/git-task-snapshot.js"
export {
	saveActiveTaskBaseline,
	getActiveTaskBaseline,
	clearActiveTaskBaseline,
	getThreadTaskChanges,
	saveTaskChanges,
	deleteThreadTaskChanges,
	type ActiveTaskBaseline,
	type StoredTaskChanges,
} from "./snapshot/task-changes-store.js"

// Tools & MCP
export * from "./tools/index.js"
export { MCPManager } from "./mcp/manager.js"

// Auth & Providers
export { AuthStorage } from "./auth/storage.js"
export { openaiCodexOAuthProvider } from "./auth/providers/openai-codex.js"

// Constants & Types
export {
	CURATED_CHAT_MODELS,
	DEFAULT_FALLBACK_MODEL_ID,
} from "./constants/models.js"
export { DEFAULT_EXECUTION_MODE, type ExecutionMode } from "./core/index.js"
export {
	TOOL_CATEGORIES,
	getToolCategory,
	type ToolCategory,
} from "./permissions.js"
export { logger } from "./core/logger/index.js"

// Project & Worktree Utilities
export {
	loadRecentProjects,
	saveRecentProject,
	type RecentProject,
} from "./utils/recent-projects.js"
export {
	detectProject,
	getAppDataDir,
	getDatabasePath,
	type ProjectInfo,
} from "./utils/project.js"
