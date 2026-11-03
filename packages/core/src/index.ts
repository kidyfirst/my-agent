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
	ExecutionMode,
	DEFAULT_EXECUTION_MODE,
	type ExecutionModeId,
	type GraphNodeKind,
	type GraphTopologyNode,
	type GraphTopologyEdge,
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
export {
	createDynamicModelGetter,
	type ModelResolver,
} from "./harness/model-resolver.js"
export type { HarnessState } from "./harness/state.js"
export { describeToolNames } from "./harness/tools.js"

// Storage & Memory
export { SQLiteStore } from "./store/index.js"

// Snapshot & Rollback
export {
	captureGitSnapshot,
	revertToGitSnapshot,
	diffBetweenSnapshots,
	diffFileBetweenSnapshots,
	type GitSnapshot,
	type ChangedFile,
} from "./snapshot/git-task-snapshot.js"
export {
	saveActiveTaskBaseline,
	getActiveTaskBaseline,
	clearActiveTaskBaseline,
	getThreadTaskChanges,
	getStoredFileDiff,
	saveTaskChanges,
	saveTaskDuration,
	deleteThreadTaskChanges,
	type ActiveTaskBaseline,
	type StoredTaskChanges,
} from "./snapshot/task-changes-store.js"

// Tools, Browser & MCP
export * from "./tools/index.js"
export { PlaywrightBrowserManager } from "./browser/playwright-manager.js"
export { MCPManager } from "./mcp/manager.js"
export {
	builtinServersNeedingSetup,
	saveBuiltinApiKey,
	getBuiltinServer,
} from "./mcp/builtin.js"

// Prompts
export { buildFullPrompt } from "./prompts/index.js"

// Auth & Providers
export { AuthStorage } from "./auth/storage.js"
export { openaiCodexOAuthProvider } from "./auth/providers/openai-codex.js"

// Constants & Types
export {
	CURATED_CHAT_MODELS,
	DEFAULT_FALLBACK_MODEL_ID,
	getProviderThinkingLevels,
	type ThinkingLevelOption,
} from "./constants/models.js"
export { loadCustomCommands } from "./utils/slash-command-loader.js"
export { processSlashCommand } from "./utils/slash-command-processor.js"
export {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	getToolCategory,
	setRuntimeYolo,
	setRuntimeCategoryPolicy,
	type ToolCategory,
	type PermissionPolicy,
} from "./permissions.js"
export {
	logger,
	Logger,
	installConsoleCapture,
	normalizeLoggingConfig,
	type LogEntry,
	type LoggingConfig,
} from "./core/logger/index.js"

// Project, Worktree & System Utilities
export {
	loadRecentProjects,
	saveRecentProject,
	saveRecentProjectLastThread,
	renameRecentProject,
	removeRecentProject,
	type RecentProject,
} from "./utils/recent-projects.js"
export {
	detectProject,
	resourceIdVariants,
	getAppDataDir,
	getDatabasePath,
	pathCreatedAt,
	type ProjectInfo,
} from "./utils/project.js"
export { estimateTokenCost } from "./utils/cost.js"
export { detectEditor } from "./utils/editor.js"
export { execQuiet, execFileQuiet } from "./utils/quiet-exec.js"
export {
	counterUrl,
	isFeedbackKind,
	FEEDBACK_LABELS,
	type FeedbackKind,
} from "./utils/feedback.js"
export {
	SessionRecorder,
	sessionRecordingManager,
	deriveReplayScript,
	createReplayModel,
	reconstructMessagesFromRecording,
	replayPlaybackKey,
	beginSessionReplay,
	endSessionReplay,
	runtimeMetadata,
	isReplayRunActive,
} from "./core/recorder/index.js"
