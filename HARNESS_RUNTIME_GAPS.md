# Harness Runtime Gaps

The agent runtime is fully in-repo: `src/core` holds the primitives (agent,
controller/session, request context, memory, workspace, tool builder, model wrapper)
and `src/harness` assembles them into the `Harness` used by the Electron main process.
No external agent framework is imported, and `patches/` is empty — nothing is patched
at install time.

This document tracks the integration points that used to be blocked on a published
framework, where each one is handled now, and what is still open inside the in-repo
runtime.

Packages that actually matter at this layer:

| Package             | Role                                                            |
| ------------------- | --------------------------------------------------------------- |
| `ai@6`              | streaming, `streamText`/`tool` types, `LanguageModelMiddleware` |
| `@ai-sdk/anthropic` | Claude transport (OAuth headers, provider-defined tools)        |
| `@ai-sdk/openai`    | OpenAI / Codex transport                                        |
| `@tavily/core`      | web search fallback when the provider has no native search      |
| `zod`               | harness state schema and tool input schemas                     |
| `js-tiktoken`       | token budgeting for compression thresholds                      |

**Last updated:** 2026-10-23 — of the 20 framework-era items: 17 closed in-repo,
1 partial, 1 open, and token accounting fixed after the fact. Two further gaps
(#1, #4 below) only exist now that the runtime is in-repo.

---

## Closed

### 1. `deleteThread(threadId)` — closed

**Where:** `src/core/controller/controller.ts` (`deleteThread`), `src/store`

Deletes the thread and its messages through the store, resets `currentThreadId` when
the deleted thread was active, and emits `thread_deleted`. Consumed by
`src/electron/helpers.ts`.

### 2. Extensible event types — closed (see 3 for typing)

**Where:** `src/harness/index.ts` — `MyAgentEvent`

`MyAgentEvent` is a union of the controller's `HarnessEvent` plus app-level
`ask_question` and `plan_approval_required`. Adding a new event type is a local
change; no framework release is involved.

### 3. Typed event payloads — **partial**

Core events (`thread_changed`, `thread_created`, `message_start/delta/end`,
`tool_start/end`, `tool_approval_required`, `agent_start/end`) are emitted with real
objects, but the shared alias is still untyped — see Open #1.

### 4. `registerQuestion` / `registerPlanApproval` — closed

**Where:** `src/harness/index.ts:875` (`registerQuestion`),
`src/harness/index.ts:881` (`respondToPlanApproval`)

Questions are parked in a `pendingQuestions` map keyed by `questionId` and resumed by
`respondToQuestion`. Plan approval falls through to `respondToToolSuspension` with
`resumeData` when the session exposes no dedicated resume hook.

### 5. `getSubagentModelId` — **open** (see Open #2)

### 6. `getState()` / `setState()` — closed

**Where:** `src/harness/index.ts:670`, `src/harness/index.ts:685`

Backed by `stateSchema` (`src/harness/state.ts`), with per-session state surfaced
through `getState`/`setState` on the harness object.

### 7. `abortSignal` — closed

**Where:** `src/core/agent/agent.ts`, `src/core/controller/controller.ts`

`RunOptions.abortSignal` is threaded from the controller's `AbortController` into the
agent stream.

### 8. `resolveModel` type mismatch — closed

**Where:** `src/harness/index.ts` — `MyAgentConfig.resolveModel`,
`src/harness/model-resolver.ts`

`createModelResolver()` returns the exact type the harness consumes
(`(modelId, options?) => model`), so no cast is needed at the config boundary.

### 9. `hookManager` through config — closed

**Where:** `src/harness/index.ts:485`

`MyAgentConfig.hookManager` / `disableHooks` are honoured; when neither is set, the
harness constructs a `HookManager` for the project root and binds session IDs on
thread events.

### 10. `mcpManager` through config — closed

**Where:** `src/harness/index.ts:470`, `src/harness/tools.ts:63`

`MyAgentConfig.mcpManager` / `disableMcp` are honoured. MCP tools are merged into the
dynamic tool set (`mcpManager.getTools()`) and namespaced per server by
`src/mcp/client.ts`.

### 11. Provider-native web search — closed

**Where:** `src/harness/tools.ts`

No `getToolsets` indirection. The dynamic `tools` function adds Tavily
(`@tavily/core`) when `TAVILY_API_KEY` is present, otherwise the current provider's
native search tool (`webSearch_20250305()` for Anthropic, `webSearch()` for OpenAI,
`googleSearch()` for Google). Provider-defined tools are passed through to `ai@6`
untouched.

### 12. Permission methods — closed

**Where:** `src/harness/index.ts:923` (`setPermissionForCategory`), `:969`
(`grantSessionCategory`), `:936` (`getPermissionRules`), `:955` (`getSessionGrants`)

Yolo mode is expressed as "all categories allow". Runtime policy is mirrored into
`src/permissions.ts` so tool execution and IPC stay in sync
(`src/electron/ipc/permission-handlers.ts`).

### 13. Tool execution context — closed

**Where:** `src/core/tools/tool.ts`, `src/core/controller/controller.ts:733`

Tools receive `{ requestContext, toolCallId }` as the second argument and the same
object on `args.context`.

### 14. Auth integration — closed by design (stays external)

**Where:** `src/auth/storage.ts`

Login/logout, OAuth PKCE and token refresh live in `AuthStorage`; the harness only
consumes it through `createDynamicModelGetter(resolveModel, authStorage)`. Keeping
auth out of the runtime is intentional — it is an app concern, not an agent concern.

### 15. Tool approval API — closed

**Where:** `src/core/controller/controller.ts:551`,
`src/harness/index.ts:854`

`respondToToolApproval` accepts `approve` / `decline` / `always_allow_category`; the
last one promotes the category into the session grant set.

### 16. Tool return types — closed

**Where:** `src/core/tools/tool.ts`

`createTool` normalises results to a single shape, so callers no longer branch on
`{ result }` vs `{ content }`.

### 17. `getTokenUsage()` — **open** (see Open #3)

### 18. `resolveModel` not exported by the factory — closed

**Where:** `src/harness/index.ts:466` and the returned object at `:1071`

`createMyAgent()` returns `resolveModel`, so thread-title generation
(`src/electron/ipc/harness-handlers.ts:212`) and the observational-memory processors
(`src/harness/index.ts:383`, `:403`) use the authenticated resolver directly.

### 19. `extraTools` not wired at runtime — closed

**Where:** `src/harness/index.ts:481`, `src/harness/tools.ts:68`

`MyAgentConfig.extraTools` accepts either a static record or a function of
`{ requestContext }`; results merge with built-in and MCP tools.

### 20. OAuth fetch dropped SDK beta headers — closed

**Where:** `src/providers/claude-max.ts:168-195`

The custom `fetch` merges the incoming `anthropic-beta` header with the OAuth beta
list instead of replacing it, and strips `x-api-key` / `authorization` so only the
bearer token survives. Provider-defined tools that need a beta flag (computer use,
code execution) now work without an install-time patch — `patches/` is empty and
`package.json` has no patched-dependency block.

---

## Streaming & model resolution fixes (2026-10-23)

A send that produced no visible output had three independent causes. All are fixed
and covered by `src/core/controller/__tests__/send-message.test.ts` and
`src/harness/__tests__/model-resolver.test.ts`.

**1. `maxSteps` is not an AI SDK v6 option** — `stopWhen` replaced it in v5. Passing
`maxSteps` was silently ignored, so every run stopped after the _first_ model call: the
tool would execute, but its result was never fed back, leaving an empty assistant
message. All three call sites (`controller.ts`, `agent.ts`, `subagent.ts` via
`Agent.stream`) now pass `stopWhen: stepCountIs(50)`.

**2. Stream errors were swallowed** — a failed request (bad credentials, provider
4xx, network) surfaces as an `error` part in `fullStream`, and the stream then
completes normally. The loop only looked at `text-delta`, so the failure was dropped,
an empty assistant message was persisted, and the UI showed nothing. Error parts are
now rethrown, which lets the IPC layer emit an `error` event; `agent_end` carrying an
`error` is also tagged with `reason: "error"` so the renderer does not reload messages
from storage and wipe the bubble.

**3. The session model was ignored** — `createDynamicModelGetter` read
`harnessContext.session`, but the controller has no such property: the Session is on
the request context under `"session"`. It therefore always fell through to the stored
mode default (`anthropic/claude-opus-4-6`), which the user had never authenticated, so
every send died with "Not logged in to Anthropic" no matter which model was selected.
The getter now reads `requestContext.get("session")` first and, as a guard, refuses to
hand back an `anthropic/*` model when neither OAuth nor an API key exists.

**4. Tool approval race** — the controller emitted `tool_approval_required` before
registering its resolver, so a synchronous answer was dropped and the run hung. The
resolver is now registered first.

---

## Toolset assembly (2026-10-26)

### Missing workspace toolset — **fixed**

**File:** `src/harness/tools.ts` (`createDynamicTools`)

The framework used to derive `view` / `search_content` / `find_files` /
`execute_command` / `write_file` / `string_replace_lsp` / `ast_smart_edit` from the
`Workspace` instance and inject them into the agent. The native `Workspace`
(`src/core/workspace/workspace.ts`) only stores the tools config — it generates no
tools — so after the rewrite the main agent was left with
`request_sandbox_access` plus whatever `extraTools` supplied (the two browser tools).
The agent had no filesystem or terminal access at all, even though
`src/prompts/base.ts` documents all of those tools.

`createDynamicTools` now builds the toolset from `src/tools` against
`state.projectPath`, and hides `write_file` / `string_replace_lsp` / `ast_smart_edit`
in plan mode. Covered by `src/harness/__tests__/main-agent-tools.test.ts`.

It also reads session state (`requestContext.get("session").state`) instead of
`controller.state`, which never existed — so `projectPath`, `currentModelId` and
`sandboxAllowedPaths` are now visible to tools that need them.

### Prompt/toolset name drift — **fixed**

The system prompt used to advertise `grep`, `glob`, `task_write`, `task_check`
and `ask_user`. The real registry only has `search_content`, `find_files` and no
task/question tools at all. A model that follows the prompt calls a name that
does not exist, reads the resulting "unknown tool" back as an environment
failure, and then tells the user that it has no tools.

Fixed on two levels:

- `src/harness/tools.ts` now owns `READ_TOOL_NAMES` / `WRITE_TOOL_NAMES` and
  `describeToolNames(mode)`. `createDynamicTools` builds the registry _from_ that
  list, so the prompt and the registry cannot drift again.
- `buildBasePrompt` emits a `# Runtime Toolset (authoritative)` block generated
  from the live list, plus an explicit note that earlier turns claiming the tools
  are unavailable are stale. `main-agent-tools.test.ts` asserts both.

Still open: actually implementing `task_write` / `task_check` / `ask_user` and
registering `subagent` (`src/tools/subagent.ts`), so the prompt can describe them
again.

### History replay deformed the message array — **fixed**

`AgentController.sendMessage` replayed every stored row as a chat turn:

- `signal` rows (UI events) were coerced to `role: "user"`.
- Assistant turns that contain only tool invocations produced `content: ""`.

A long thread therefore contained dozens of empty consecutive turns. Combined
with earlier turns that had (correctly, at the time) reported a broken toolset,
models re-read their own conclusions and kept refusing to call tools even though
the full toolset was in the request. Verified by replaying the real thread with
and without the fix against the live provider.

**Fix:** skip non-`user`/`assistant` rows and skip turns whose text is empty.

---

## Open

### 1. Event and request-context types are `any`

**Files:** `src/core/controller/controller.ts:67-69`

```ts
export type HarnessRequestContext = any
export type HarnessEvent = any
```

Consequences:

- `emit()` accepts any object, so a typo in a payload field compiles fine and only
  shows up as a silent no-op in the renderer.
- `src/tools/subagent.ts:131` and `src/tools/request-sandbox-access.ts:64` fall back to
  optional chaining and `as any` casts because the context shape is not declared.
- The renderer re-declares its own `HarnessEventPayload`
  (`src/renderer/types/ipc.ts:70`), so main and renderer can drift apart unnoticed.

**Ideal:** a discriminated union for `HarnessEvent` (mirroring the emissions in
`controller.ts:373-883`) and a real interface for the per-run request context.

### 2. Per-subagent model override is never applied

**Files:** `src/tools/subagent.ts:131`, `src/auth/storage.ts:278`

`AuthStorage.getSubagentModelId(agentType)` exists, but nothing puts it on the
request context, so the optional call in the subagent tool always returns `undefined`
and every subagent runs on `deps.defaultModelId`. Configured models are silently
ignored.

**Fix:** set `getSubagentModelId` on the context the controller hands to tools, or pass
the resolved id into the subagent tool's deps.

### 3. Token accounting — fixed

**File:** `src/core/controller/controller.ts`

`_tokenUsage` was initialised and read but never written, so the StatusBar, Agent
Dashboard and cost view reported zero. The streaming loop now folds the `finish`
part's `totalUsage` into it, so `getTokenUsage()` returns real numbers.

### 4. Observational Memory progress is a stub

**Files:** `src/core/controller/controller.ts:271`, `src/harness/index.ts:917`

```ts
async loadOMProgress(_target?: unknown): Promise<unknown> { return {} }
```

Thread switches therefore cannot restore compression progress, and the controller
emits no observational-memory events, so the renderer has nothing to render even
though `src/renderer/hooks/useHarnessEvents.ts` already handles `om_*` payloads.

**Fix:** persist observation/reflection counters in thread metadata and emit
`om_observation_start/end`, `om_reflection`, `om_buffering` from the memory
processors (`src/core/memory/processors/`).

---

## AI SDK v6 migration pitfalls

Two v4-era API shapes survived the framework removal. Both fail _silently_ — no
exception is thrown, the request just goes out wrong — so they only show up as
provider errors or missing output:

| Symptom                                                                                               | Cause                                                                                                                                | Fix                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Tool executes, model never summarises the result; `durationMs` of the saved reply is a few ms         | `maxSteps` was removed in v6 and ignored, so `fullStream` ends after a single step                                                   | `stopWhen: stepCountIs(n)` in `src/core/controller/controller.ts` and `src/core/agent/agent.ts` |
| `Invalid schema for function 'x': schema must be a JSON Schema of 'type: "object"', got 'type: null'` | tools were passed as `{ parameters }`; v6 only reads `inputSchema`, so every schema collapsed to `{ properties: {} }` with no `type` | `src/core/tools/ai-tool.ts` normalises every tool through `toModelTool()`                       |

`toModelTool()` keeps `inputSchema` for zod schemas, wraps bare JSON Schema objects
with `jsonSchema()`, injects `{ type: "object", properties: {} }` when a tool
declares nothing, and passes provider-defined tools (`anthropic.tools.*`,
`openai.tools.*`) through untouched.

**Regression tests:** `src/core/tools/__tests__/ai-tool.test.ts`,
`all-tools-schema.test.ts` (every built-in tool must reach the model with
`type: "object"`), and `src/core/controller/__tests__/send-message.test.ts`.

### Provider packages are one major ahead of the core — **open**

`package.json` pins `ai@^6` but `@ai-sdk/openai@^4` and `@ai-sdk/anthropic@^4`,
which emit language models with `specificationVersion: "v4"`. The core accepts
only `v2`/`v3` and throws `UnsupportedModelVersionError`.

The app does not crash only because `withThinkingOptions()` wraps every model in
`wrapLanguageModel()`, and the wrapper reports `v3`. That is an accidental
lifeboat: `v3` request parameters are handed to a `v4` implementation, so any
future divergence in the tool or message shape will be dropped without an error.

**Fix:** pin `@ai-sdk/openai` / `@ai-sdk/anthropic` to the `3.x` line that targets
`ai@6`, then remove the wrapper-for-compatibility dependency.

---

## Summary

| Status           | Items                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| Closed in-repo   | 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20                       |
| Partial          | 3 — payloads emitted correctly, shared alias still `any` (fix tracked as Open #1) |
| Fixed later      | 17 — token usage accumulated from the `finish` part (see Open #3)                 |
| Open             | 5 → Open #2                                                                       |
| New runtime gaps | Open #1 (event/context typing), Open #4 (OM progress)                             |
