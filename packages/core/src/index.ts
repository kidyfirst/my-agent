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
	type ControllerMessageLike,
} from "./harness/index.js"
export {
	createDynamicModelGetter,
	type ModelResolver,
} from "./harness/model-resolver.js"
export { DEFAULT_OM_MODEL_ID, type HarnessState } from "./harness/state.js"
export { describeToolNames } from "./harness/tools.js"

// Storage & Memory
export { SQLiteStore } from "./store/index.js"
export {
	loadProjectContext,
	saveProjectContext,
	updateProjectContext,
	loadProjectRules,
	saveProjectRule,
	deleteProjectRule,
	formatProjectWorkingMemory,
	type ProjectContextData,
	type ProjectRuleFile,
} from "./memory/project-memory.js"

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
export {
	PlaywrightBrowserManager,
	type BrowserPreviewFrame,
} from "./browser/playwright-manager.js"
export { MCPManager } from "./mcp/manager.js"
export {
	builtinServersNeedingSetup,
	saveBuiltinApiKey,
	getBuiltinServer,
} from "./mcp/builtin.js"

// Prompts & Prompt Caching
export { buildFullPrompt } from "./prompts/index.js"
export {
	promptCacheMiddleware,
	applyPromptCacheBreakpoints,
	addCacheControlToMessage,
	sortToolsByName,
	type CacheControlOptions,
} from "./core/llm/prompt-cache.js"

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
	AssetManager,
	type AssetMetadata,
	type SaveAssetOptions,
} from "./assets/index.js"
export { createAssetsFetchTool } from "./tools/assets-fetch.js"
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
	type SessionEvent,
} from "./core/recorder/index.js"

// Subagent Worker
export {
	SubagentWorkerHost,
	SubagentWorkerExecutor,
	type SubagentHostDeps,
	type SubagentTaskParams,
	type HostToWorkerMessage,
	type WorkerToHostMessage,
} from "./subagent/index.js"

export * from "./library/index.js"
export { createLibraryTool } from "./tools/library.js"
