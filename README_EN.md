# My Agent — Architecture and Module Design

<div align="center">

[简体中文](README.md) ｜ **English**

<sub>English mirror of README.md. The Chinese edition is the authoritative one.</sub>

</div>

This project is a desktop-grade intelligent coding assistant built on **Electron** and **React**. It adopts a multi-process decoupled architecture, combines the ReAct loop of modern autonomous Agents with observational memory mechanisms, and supports multi-workspace session isolation, streaming tool execution and multi-panel IDE collaborative interaction.

<!-- FEEDBACK_BADGES_START — kept in sync with FEEDBACK_BADGES in src/utils/feedback.ts -->

<div align="center">

![Helpful](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fabacus.jasoncameron.dev%2Fget%2Fkidyfirst%2Fmy-agent-likes&query=%24.value&label=likes&color=FF8C42&style=flat&cacheSeconds=300)
![Bad response](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fabacus.jasoncameron.dev%2Fget%2Fkidyfirst%2Fmy-agent-bad&query=%24.value&label=bad%20response&color=6b7280&style=flat&cacheSeconds=300)

<sub>Below every reply you will find Copy · 👍 Helpful · 👎 Bad response. Likes are anonymous: no login, no database write, no identity reported — they simply add +1 to the two public counters above; after the app restarts the highlight disappears and only the totals remain.</sub>

</div>

<!-- FEEDBACK_BADGES_END -->

---

<!-- LATEST_RELEASE_START -->

## 📥 Client downloads and release notes (ChangeLog)

<div align="center">

[![Latest Release](https://img.shields.io/github/v/release/kidyfirst/my-agent?color=blue&label=Latest&logo=github)](https://github.com/kidyfirst/my-agent/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/kidyfirst/my-agent/total?color=success&label=Downloads)](https://github.com/kidyfirst/my-agent/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#downloads-for-all-platforms)
[![ChangeLog](https://img.shields.io/badge/ChangeLog-notes-blueviolet)](https://kidyfirst.github.io/my-agent/changelog.html)

**Latest stable version: `v0.1.6`**  
🌐 **[Official download site (GitHub Pages)](https://kidyfirst.github.io/my-agent/)** ｜ 📋 **[Release notes (ChangeLog)](https://kidyfirst.github.io/my-agent/changelog.html)** ｜ 📦 **[GitHub Releases](https://github.com/kidyfirst/my-agent/releases)**

</div>

### Downloads for all platforms

| Platform       | Architecture / device                 | Package                    | Direct download (v0.1.6)                                                                                                                    | Notes                       |
| :------------- | :------------------------------------ | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------- |
| 🍏 **macOS**   | **Apple Silicon** (M1 / M2 / M3 / M4) | `.dmg` installer           | [my-agent-0.1.6-mac-arm64.dmg](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-mac-arm64.dmg)                 | Recommended for most Macs   |
| 🍏 **macOS**   | **Apple Silicon** (M1 / M2 / M3 / M4) | `.zip` portable build      | [my-agent-0.1.6-mac-arm64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-mac-arm64.zip)                 | Unzip and run               |
| 🍏 **macOS**   | **Intel x86_64**                      | `.dmg` installer           | [my-agent-0.1.6-mac-x64.dmg](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-mac-x64.dmg)                     | For Intel-based Macs        |
| 🍏 **macOS**   | **Intel x86_64**                      | `.zip` portable build      | [my-agent-0.1.6-mac-x64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-mac-x64.zip)                     | Unzip and run               |
| 🪟 **Windows** | **Windows 10 / 11** (64-bit)          | `.exe` installer           | [my-agent-0.1.6-win-x64.exe](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-win-x64.exe)                     | NSIS guided setup           |
| 🪟 **Windows** | **Windows 10 / 11** (64-bit)          | `.zip` portable build      | [my-agent-0.1.6-win-x64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-win-x64.zip)                     | Unzip and run               |
| 🐧 **Linux**   | **Linux x86_64** (generic)            | `.AppImage` portable image | [my-agent-0.1.6-linux-x86_64.AppImage](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-linux-x86_64.AppImage) | `chmod +x`, then run it     |
| 🐧 **Linux**   | **Debian / Ubuntu / Deepin**          | `.deb` package             | [my-agent-0.1.6-linux-amd64.deb](https://github.com/kidyfirst/my-agent/releases/download/v0.1.6/my-agent-0.1.6-linux-amd64.deb)             | Install with `sudo dpkg -i` |

> [!IMPORTANT]
> **macOS says the app “is damaged” or “cannot be opened”:**  
> The community build is not signed with a paid Apple Developer certificate, so Gatekeeper tags everything downloaded through a browser. If the first launch is refused, clear the quarantine flag once:
>
> ```bash
> xattr -cr "/Applications/My Agent.app"
> ```
>
> Or allow it in System Settings: **System Settings → Privacy & Security → scroll down and click “Open Anyway”**.

> [!TIP]
>
> - Full history and per-version details: 👉 **[online ChangeLog](https://kidyfirst.github.io/my-agent/changelog.html)** or **[all releases on GitHub](https://github.com/kidyfirst/my-agent/releases)**.

---

<!-- LATEST_RELEASE_END -->

<!-- TIP_JAR_START — the QR is apps/desktop/src/renderer/assets/alipay-qr.png itself; do not add a second copy -->

## ☕ Treat the cat

<div align="center">

If this project has been useful to you, treat the cat 🐱

<img src="apps/desktop/src/renderer/assets/alipay-qr.png" width="200" alt="Alipay payment QR code" />

<sub>Scan with Alipay · any amount, and it works just as well without</sub>

</div>

<!-- TIP_JAR_END -->

---

## Table of contents

- [My Agent — Architecture and Module Design](#my-agent--architecture-and-module-design)
  - [📥 Client downloads and release notes (ChangeLog)](#-client-downloads-and-release-notes-changelog)
    - [Downloads for all platforms](#downloads-for-all-platforms)
  - [☕ Treat the cat](#-treat-the-cat)
  - [Table of contents](#table-of-contents)
  - [1. Overall architecture design](#1-overall-architecture-design)
    - [Core design principles](#core-design-principles)
  - [2. Process split and communication](#2-process-split-and-communication)
  - [3. Core module implementation notes](#3-core-module-implementation-notes)
    - [3.1 Main process layer (`src/electron/`)](#31-main-process-layer-srcelectron)
    - [3.2 Preload and bridge layer (`src/electron/preload.ts`)](#32-preload-and-bridge-layer-srcelectronpreloadts)
    - [3.3 Renderer UI layer (`src/renderer/`)](#33-renderer-ui-layer-srcrenderer)
      - [3.3.1 ChatView rendering pipeline](#331-chatview-rendering-pipeline)
      - [3.3.2 The two display states: running and finished](#332-the-two-display-states-running-and-finished)
      - [3.3.3 Sticky and collapsible user messages](#333-sticky-and-collapsible-user-messages)
      - [3.3.4 Changed files cards and subagent cards](#334-changed-files-cards-and-subagent-cards)
      - [3.3.5 Scrolling, empty state and stacking](#335-scrolling-empty-state-and-stacking)
    - [3.4 Agent runtime and capability layer (agent engine / `src/tools/`)](#34-agent-runtime-and-capability-layer-agent-engine--srctools)
      - [3.4.1 Core runtime object system (Harness / HarnessProxy / ActiveSession / Agent)](#341-core-runtime-object-system-harness--harnessproxy--activesession--agent)
        - [1. Responsibility boundaries and class contracts of the four core entities](#1-responsibility-boundaries-and-class-contracts-of-the-four-core-entities)
        - [2. Core class and interface definitions](#2-core-class-and-interface-definitions)
          - [(1) `Agent` class definition](#1-agent-class-definition)
          - [(2) `Harness` / `AgentController` class definition](#2-harness--agentcontroller-class-definition)
          - [(3) `ActiveSession` (`Session<TState>`) class definition](#3-activesession-sessiontstate-class-definition)
          - [(4) `HarnessProxy` and the `adapter` facade](#4-harnessproxy-and-the-adapter-facade)
        - [3. Why wrap a `Proxy` around `adapter`?](#3-why-wrap-a-proxy-around-adapter)
      - [3.4.2 Storage engine and database persistence](#342-storage-engine-and-database-persistence)
      - [3.4.3 Observational Memory](#343-observational-memory)
      - [3.4.4 Agent ReAct loop and tool stream](#344-agent-react-loop-and-tool-stream)
      - [3.4.5 Extended tool ecosystem and sandbox safety (`src/tools/`, `src/lsp/`, `src/browser/`)](#345-extended-tool-ecosystem-and-sandbox-safety-srctools-srclsp-srcbrowser)
      - [3.4.6 Tiered Subagents & Multi-Agent Architecture](#346-tiered-subagents--multi-agent-architecture)
        - [1. Built-in Subagent Roles & Permission Tiers](#1-built-in-subagent-roles--permission-tiers)
        - [2. Implementation Details: Invocation Flow & Execution Mechanics](#2-implementation-details-invocation-flow--execution-mechanics)
        - [3. Usage Scenarios & Recommendations](#3-usage-scenarios--recommendations)
        - [4. Customization & Extensions](#4-customization--extensions)
        - [5. Event Flow & UI Presentation](#5-event-flow--ui-presentation)
        - [6. Why Multi-Tiered Subagents? (Design Advantages)](#6-why-multi-tiered-subagents-design-advantages)
      - [3.4.7 Execution modes and graph scheduling (`src/core/graph/`)](#347-execution-modes-and-graph-scheduling-srccoregraph)
      - [3.4.8 Session recording and offline replay (`src/core/recorder/`)](#348-session-recording-and-offline-replay-srccorerecorder)
    - [3.5 Memory System (Tiered Memory & Prompt Caching)](#35-memory-system-tiered-memory--prompt-caching)
      - [3.5.1 Three-Tier Memory Architecture System](#351-three-tier-memory-architecture-system)
      - [3.5.2 Class Inheritance and Responsibility Boundaries](#352-class-inheritance-and-responsibility-boundaries)
      - [3.5.3 Storage Domain Adaptation and Thread/Message CRUD](#353-storage-domain-adaptation-and-threadmessage-crud)
      - [3.5.4 In-Session Working Context Optimizations (L1 Context Assembly)](#354-in-session-working-context-optimizations-l1-context-assembly)
      - [3.5.5 Observational Memory Mechanics and Dual-Threshold Ladder (L2 OM)](#355-observational-memory-mechanics-and-dual-threshold-ladder-l2-om)
      - [3.5.6 Cross-Session Project-Level Working Memory & Rules (L3 Project Memory)](#356-cross-session-project-level-working-memory--rules-l3-project-memory)
      - [3.5.7 Model Provider Prompt Caching Alignment Mechanics](#357-model-provider-prompt-caching-alignment-mechanics)
      - [3.5.8 Dynamic Memory Factory, Token Estimation and Test Coverage](#358-dynamic-memory-factory-token-estimation-and-test-coverage)
  - [4. Core business and data-flow sequences](#4-core-business-and-data-flow-sequences)
    - [4.1 Streaming sequence for user messages, reasoning chains and execution blocks](#41-streaming-sequence-for-user-messages-reasoning-chains-and-execution-blocks)
    - [4.2 Tool-call approval and human-in-the-loop flow](#42-tool-call-approval-and-human-in-the-loop-flow)
    - [4.3 Git Worktree multi-session isolation](#43-git-worktree-multi-session-isolation)
  - [5. Source directory map](#5-source-directory-map)

---

## 1. Overall architecture design

The project adopts a typical **four-layer architecture**, from top to bottom: the **UI presentation layer**, the **secure bridge layer**, the **main process scheduling layer** and the **Agent runtime engine**:

```mermaid
flowchart TD
    subgraph UI ["1. Presentation layer (Renderer Process - React 19 + Vite)"]
        ChatView["Chat conversation / reasoning chain display"]
        Panels["IDE multi-panel (Terminal, FileTree, DiffEditor)"]
        Hooks["State and event Hooks (useHarnessEvents, useChatReducer)"]
    end

    subgraph Bridge ["2. Secure bridge layer (Preload Script)"]
        ContextBridge["contextBridge.exposeInMainWorld('api', ...)"]
        IPCTunnel["Bidirectional channel (harness:command / harness:event)"]
    end

    subgraph Main ["3. Main process scheduling layer (Electron Main Process)"]
        WindowMgr["Window and lifecycle (main.ts)"]
        IPCRegistry["IPC dispatch center (src/electron/ipc/)"]
        SessionMgr["WorktreeSession / ElectronState (multi-workspace separation)"]
        PtyService["node-pty terminal service"]
        PermService["Permission policy engine (permissions.ts)"]
    end

    subgraph AgentRuntime ["4. Agent runtime and capability engine (agent engine / MyAgent Core)"]
        Harness["Harness orchestration and event bus"]
        ModeGraph["Execution mode graph scheduling (ReAct / Plan & Solve / Fast)"]
        ReActLoop["Agent ReAct autonomous loop (maxSteps: 1000)"]
        MemoryOM["Observational Memory (dynamic observation and reflection compression)"]
        StorageEngine["LibSQL / SQLite database storage"]
        ToolRegistry["Core tool set (File, Grep, LSP, Playwright, MCP)"]
        SubagentEngine["Tiered subagents (explore, plan, execute)"]
        Recorder["Record / replay engine (JSONL, ReplayLanguageModel)"]
    end

    Hooks <--> |"window.api context isolation"| ContextBridge
    IPCTunnel <--> |"Bidirectional IPC message channel"| IPCRegistry
    IPCRegistry <--> |"Harness scheduling and event bus"| Harness
    Harness --> ModeGraph
    ModeGraph --> ReActLoop
    Harness --> Recorder
```

### Core design principles

1. **Strict process isolation (Context Isolation)**: the renderer process never touches Node.js native APIs or sensitive system calls directly; every capability is exposed through the allow-listed channel of `preload.ts`.
2. **Multi-Worktree session isolation**: for several Git branches / workspaces (Worktree) of the same repository, the main process instantiates independent `WorktreeSession` and `Harness` instances, keeping sessions, terminals and state from interfering with each other.
3. **Autonomous ReAct loop instead of a static workflow**: rigid DAG workflows are dropped in favour of the LLM's reason-act loop (Think $\to$ Tool Call $\to$ Observe $\to$ Loop), delivering flexible code retrieval, planning and rewriting.
4. **Dynamic long-context memory compression (Observational Memory)**: built-in observer and reflector models dynamically compress the large volume of tool-call logs produced in long conversations, keeping the context from exceeding model limits.
5. **Mode as graph**: the three execution modes — ReAct / Plan & Solve / Fast — each correspond to an independent graph definition; switching modes swaps the whole scheduling graph and tool set, rather than merely changing the prompt.
6. **Record & replay**: every run can be flushed to disk as compact JSONL; replay touches neither the network nor the file system, and together with the runtime snapshot it fully restores the model, mode and permission context of that moment.

---

## 2. Process split and communication

Inter-process communication in the Electron system follows strongly typed IPC conventions:

| Channel                 | Direction                   | Transport protocol                           | Description                                                                                                                                           |
| :---------------------- | :-------------------------- | :------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness:command`       | Renderer $\to$ main process | `ipcRenderer.invoke` (bidirectional Promise) | The frontend sends commands such as sending a message, switching the model, switching the mode, operating the terminal and saving settings            |
| `harness:event`         | Main process $\to$ renderer | `webContents.send` (one-way broadcast)       | The main process pushes streaming events to the frontend in real time (message stream, reasoning chain, tool execution, task progress, notifications) |
| `login:prompt-response` | Renderer $\to$ main process | `ipcRenderer.send` (one-way)                 | OAuth login dialog / verification response callback                                                                                                   |
| `set-badge-count`       | Renderer $\to$ main process | `ipcRenderer.send` (one-way)                 | Sets the unread message badge on the macOS Dock icon                                                                                                  |
| `open-url`              | Main process $\to$ renderer | `webContents.send` (one-way)                 | Intercepts external links and opens them in the app's built-in browser panel                                                                          |

---

## 3. Core module implementation notes

### 3.1 Main process layer (`src/electron/`)

The main process is responsible for native operating-system capability integration, window management, session lifecycle maintenance and secure dispatch.

- **Window control and entry point (`src/electron/main.ts`)**
  - Calls `createWindow()` to instantiate the main window and configures `webPreferences` (disables `nodeIntegration`, enables `contextIsolation` and `preload`).
  - Environment-aware loading: in development it reads `process.env.ELECTRON_RENDERER_URL` (connecting to the Vite dev server for hot reload); in production it loads the packaged `dist/renderer/index.html` through `mainWindow.loadFile`.
  - Registers the application global menu, the macOS Dock icon and external link interception.
- **IPC command dispatch center (`src/electron/ipc/`)**
  The main process adopts a modular handler design, unified and dispatched in `src/electron/ipc/index.ts`:
  - `harness-handlers.ts`: handles conversation messages (`sendMessage`), task interruption (`abort`), user interjection (`steer`), follow-up tasks (`followUp`), and mode / model switching.
  - `project-handlers.ts`: project detection, workspace opening, Git Worktree session lifecycle management and multi-project switching.
  - `permission-handlers.ts`: tool-call approval interception (approve, decline, permanently allow by category) and human-in-the-loop question answering (`ask_question` / `plan_approval`).
  - `pty-handlers.ts`: built on `node-pty`, creates underlying pseudo-terminal instances, relays standard input/output streams and resets the terminal window size (Resize).
  - `git-handlers.ts`: handles local Git repository status checks, Diff generation, branch fetch and checkout.
  - `file-handlers.ts`: provides a controlled local file read service for the frontend editor panel.
  - `mcp-handlers.ts`: manages Model Context Protocol (MCP) server connections, status monitoring and external tool reloading.
  - `settings-handlers.ts`: configuration persistence (Thinking depth level, notification mode, AST smart editing toggle, etc.).
  - `integration-handlers.ts`: handles the bidirectional Linear and GitHub integrations (ticket fetching, commit association, status synchronisation).
  - `auth-handlers.ts`: Anthropic and OpenAI OAuth authorization flow control.
  - `dashboard-handlers.ts`: aggregates cross-session Token consumption, execution time and task metrics.
- **State isolation and integration context (`src/electron/electron-state.ts`)**
  - Maintains one `ElectronState` per workspace path, persistently recording the associated Linear task IDs, GitHub PR links and dedicated credentials.
- **Native system notifications (`src/electron/notifications.ts`)**
  - When the main window is unfocused (running in the background), if an Agent task finishes or manual approval is required, native system notifications and sound alerts are triggered.

### 3.2 Preload and bridge layer (`src/electron/preload.ts`)

`preload.ts` executes before the page DOM is loaded and relies on `contextBridge` to inject a safe `window.api` namespace into the page:

```ts
// src/electron/preload.ts
contextBridge.exposeInMainWorld("api", {
  invoke: (command) => ipcRenderer.invoke("harness:command", command),
  onEvent: (callback) => { ... },
  respondToLoginPrompt: (answer) => { ... },
  cancelLoginPrompt: () => { ... },
  setBadgeCount: (count) => { ... },
  onOpenUrl: (callback) => { ... },
  platform: process.platform,
})
```

Combined with `declare global { interface Window { api: ElectronAPI } }` in `src/renderer/types/ipc.ts`, this delivers end-to-end TypeScript static type inference and code auto-completion.

### 3.3 Renderer UI layer (`src/renderer/`)

A high-performance IDE-grade interface built with **React 19** + **Vite**, driven by unidirectional data flow and reactive subscriptions:

- **Render entry point (`src/renderer/index.html` & `main.tsx`)**
  - `index.html` provides the `#root` mount point and imports the ES Module `main.tsx`, rendering the root component `<App />` into the DOM.
- **Event consumption and state machine (`src/renderer/hooks/useHarnessEvents.ts` & `src/renderer/types/chat.ts`)**
  - Subscribes to `window.api.onEvent` and intercepts Agent runtime events pushed by the main process.
  - Processes actions through the `useChatReducer` state machine:
    - `AGENT_START` / `AGENT_END`: marks the global running state and the loading cursor.
    - `MESSAGE_START` / `MESSAGE_UPDATE` / `MESSAGE_END`: accumulates Tokens as they stream and updates the corresponding message block in real time.
    - `TOOL_START` / `TOOL_UPDATE` / `TOOL_END`: updates tool-call arguments and returned results.
- **Session message rendering component family (`src/renderer/components/`)**
  - `ChatView.tsx`: the session rendering pipeline, which merges `messages` into five render categories — "user message / execution block / assistant reply / subagent / system notice" — and collapses multiple tool calls of the same turn into a single execution block.
  - `AssistantMessage.tsx`: renders the assistant body; `text` blocks go through `react-markdown` rich text plus code highlighting, and every code block gets its own copy button.
  - `ExecutionBlock.tsx`: the unified display component for execution blocks (reasoning chain + tool calls); the running and finished states are described in [3.3.2](#332-the-two-display-states-running-and-finished).
  - `UserMessage.tsx`: the user message bubble, supporting sticky positioning, collapsing of very long content, image preview and one-click copy.
  - `FilesChangedBar.tsx` / `SubagentExecution.tsx` / `TodoProgress.tsx`: changed files cards, subagent execution cards and the task progress bar.
- **IDE multi-panel component ecosystem**
  - `TerminalPanel.tsx`: a high-performance ANSI terminal emulator built on `@xterm/xterm` and `@xterm/addon-fit`.
  - `FileTree.tsx` / `FileEditor.tsx` / `DiffEditor.tsx`: file tree browsing, syntax-highlighted viewing and side-by-side Git change comparison.
  - `TaskBoard.tsx`: an integrated Linear/GitHub ticket board that supports binding an issue to the current branch with one click.
  - `ToolApprovalDialog.tsx` / `PlanApproval.tsx`: human-in-the-loop dialogs that intercept dangerous operations and ask the user to confirm.

#### 3.3.1 ChatView rendering pipeline

`ChatView.tsx` does not iterate over `messages` and render components directly. Instead it first merges message bodies into render items (`RenderItem`), and then dispatches them to concrete components through a single `switch`. This runs as a serial sequence of `useMemo` passes, in the following order:

1. **Turn duration preprocessing**: turns are split on `user` / `system` messages; all assistant message ids in the current turn and the last non-empty `durationMs` are collected and written into `turnDurationById`. `agent_end` only writes the duration onto the last assistant message, so this table is what restores the duration to "the first execution block of this turn".
2. **Per-message parsing**: first `normalizeMessageContent` normalizes `content` (the Agent may pass a string, an array, or `parts`). `tool_result` blocks first build the `toolResultsById` index; then dispatch happens by block type:
   - `text` / `output` / `message` (or no type but carrying `text` / `content` / `value`): accumulate body text;
   - `thinking` / `reasoning` / `thought` / `redactedthinking`: generate reasoning chain steps; the duration is taken from the block's `durationSec` first, then derived from the message duration, and finally estimated from text length;
   - `toolcall` / `tooluse` / `toolinvocation`: generate tool steps; `isDone` is decided by `state === "result"` or an already existing result, and the tool definition is looked up in the `tools` / `subagents` map for its name and icon.
3. **Flush strategy**: when a body block or subagent is encountered, `flushExecution()` is called to settle the currently accumulated steps into one execution block; when a reasoning chain or tool block is encountered, `flushText()` is called, and **an assistant item is only produced when the body text is non-empty (or the tail is an error)** — so no empty bubbles appear during streaming.
4. **Message finalization**: once a message has been parsed it is flushed again, and `msg.changedFiles` is attached to the last assistant item of this turn; if there is no body item at all, an assistant item containing only the files card is appended.
5. **Gap filling**: tools that already appeared in the state machine but have no matching block in the message body are appended into `live-execution-block`; subagents that were never rendered are filled in as standalone cards.
6. **Placeholder**: while the Agent is running and the last item is a user message, `active-execution-placeholder` is inserted so that `Working for …` becomes visible immediately, instead of waiting for the first tool call.
7. **Final merge**: first merge adjacent execution blocks (deduplicating steps by id) and discard blocks that are empty and inactive; then apply the "one active block per turn" collapse — the cursor resets at `user` / `system` items, all subsequent execution blocks of the same turn are merged into the first one, and `isActive` / `startedAt` / `durationMs` / `changedFiles` take the latest values.

Step 7 is the key to "only one `Worked for …` per turn": the early implementation gave every assistant message its own execution block, so several titles would pop up inside a single turn; now they are collapsed uniformly at the render layer.

#### 3.3.2 The two display states: running and finished

`ExecutionBlock.tsx` carries both states in one component; the shape is decided by `isActive`:

- **Running**: the title is `Working for 12.3s` (or `1m 20s`), followed by an `(N steps)` count and a downward arrow; in the collapsed state there is an 82px-high step preview pane below that auto-scrolls to the bottom as new steps arrive; click the title or the preview pane to expand all steps.
- **Finished**: only one line remains for the whole turn, `Worked for 1m 6s ⌄`; steps are fully hidden by default and expand only on click; if the block has no steps at all and is not active, the component returns `null` directly.
- **Duration source**: `durationMs` written onto the message at `agent_end`; when it is missing, fall back to `turnDurationById` from 3.3.1. There is no duration column in the database, so `SET_MESSAGES` in `chatReducer` keeps the old duration held in memory and backfills it onto the last assistant message of the turn for historical sessions — earlier historical turns may still show a `Worked` without a duration.
- **Duration format**: under 60 seconds shows one decimal (`12.3s`), above that shows `Xm Ys`; while running, a 100ms timer refreshes it based on `startedAt`.

**Character-by-character entrance for the running title**: the active title is rendered by `AnimatedWorkingLabel`, split into per-character `<span class="working-char">` nodes. Each character plays `working-char-in` (`opacity: 0 → 1`, `260ms` ease-out) with a `28ms` stagger (`WORKING_CHAR_STAGGER_MS`), so the whole line lights up in roughly 350ms and reads as "alive" the moment it appears. Three constraints make this work:

1. **Only while running.** A finished `Worked for …` takes the plain-text branch; otherwise the animation would replay every time the block re-enters view.
2. **Two render runs.** The title is split into a stable prefix (`Working`) and the ticking duration (`12.3s`). The prefix keeps constant keys, so a duration that changes every 100ms does not re-mount it and restart the whole line; only the newly added characters of the duration run get an entrance.
3. **Character keys are indices, not characters.** `staggeredChars` keys by index, so transitions like `3.4s → 3.5s` or `9.9s → 10.0s` only change text and never rebuild DOM nodes. If the key included the character, the changing last digit would re-mount ten times a second and visibly flicker.

Under `prefers-reduced-motion: reduce` the `.working-char` animation is explicitly disabled.

#### 3.3.3 Sticky and collapsible user messages

`UserMessage.tsx` is responsible for keeping "the latest question in the current viewport" pinned to the top:

- When not expanded, `position: sticky` + `top: 0` + `zIndex: 20` + an opaque `var(--bg)` background keep it at the top of the viewport while scrolling; the expanded state cancels stickiness and restores normal document flow.
- When the content height exceeds the threshold (about 80px for the bubble) it collapses, overlaying a 24px gradient mask and a chevron at the bottom; clicking toggles expansion; if `window.getSelection()` shows there is a selection, the toggle is not triggered, preserving "drag-select to copy".
- Image thumbnails are fixed at 60px high with `object-fit: contain`; clicking opens `ImagePreviewModal`; below the bubble are the timestamp and the copy button.
- Layout details: the scroll container itself has no padding; the inner 800px column carries `16px 24px 0`; the sticky container uses a negative margin of `-24px` plus equal padding to spread the background out to the column edges, so scrolled body text never peeks out on either side of the sticky card.

#### 3.3.4 Changed files cards and subagent cards

- **Changed files card (`FilesChangedBar.tsx`)**: mounted at the tail of the assistant message when `message.changedFiles` is non-empty. The header line is `N files changed +X -Y`, and clicking the whole row expands it; once expanded, each file shows its `basename` + directory + added/removed line counts, and the `Review` button stops event propagation and opens the diff editor directly. Inline diffs are lazy-loaded (`getTaskFileDiff`, keyed by `messageId`), and `isLive` means the task is still running.
- **Persistence (`src/electron/task-changes-store.ts`)**: the file list and diff at task end are written to `<appData>/task-changes.json` (thread → message → files/diff, capped at 40 threads × 80 tasks, 200KB per diff); after a restart `getMessages` re-attaches them to `changedFiles`, and deleting a thread cleans them up at the same time.
- **Subagent card (`SubagentExecution.tsx`)**: the whole row is clickable, showing `🏗️` + `Agent` + task description + completion time + ✓/✗/running pulse dot; expanding reveals the subagent's internal tool calls and final result.

#### 3.3.5 Scrolling, empty state and stacking

- **Auto scroll**: `isAutoScroll` marks whether the view follows the bottom (less than 100px from the bottom counts as following); when new messages or tool updates arrive, `scrollTop` is first pushed to the bottom and then corrected once more on the next frame, avoiding position drift caused by React commit timing.
- **Layout**: the outer layer uses `flex: 1` / `overflow-y: auto` / `overflow-x: hidden` / `scrollbar-gutter: stable`; the inner layer uses `max-width: 800px; margin: 0 auto; flex: 1 0 auto; min-height: 100%`, with a 16px placeholder at the bottom.
- **Empty state and progress**: when there are no render items and the Agent is idle, `AsciiLogo` is shown; when `todos` exist, `TodoProgress` is rendered at the bottom of the list; `system` messages are rendered as a notice block carrying a `System Notice` label; consecutive duplicate user messages are deduplicated by text.
- **Stacking order**: the sticky card uses `zIndex: 20`; every overlay that can reach down into the chat area must sit above it — `OpenInDropdown` is 400, the model/permission overlays inside the editor are 200, and the command palette and modals are above 1000.

### 3.4 Agent runtime and capability layer (agent engine / `src/tools/`)

The project assembles its underlying capabilities through a self-developed agent runtime architecture, in which four core entities cooperate to deliver model interaction, controlled tool invocation, multi-session isolation and event stream rendering.

#### 3.4.1 Core runtime object system (Harness / HarnessProxy / ActiveSession / Agent)

In the runtime architecture, upper layers (Electron IPC handlers and the frontend UI) never operate a single complex low-level class directly. Instead they interact with the whole system through one unified facade object (`harness`) wrapped by a proxy.

```mermaid
graph TD
    Caller["Upper-layer caller (Electron IPC / UI Handlers)"] -->|calls the unified contract interface| HarnessProxy["HarnessProxy (Proxy instance)<br/>src/harness/index.ts<br/>unified facade / three-level dynamic delegation"]

    subgraph FallbackChain ["Three-level dynamic delegation and property fallback chain (Proxy Fallback Chain)"]
        direction TB
        L1["1. First priority: adapter (high-level business enhancement adapter)<br/>• init auto-restores the last session<br/>• listMessages double-reads SQLite for fallback and duration alignment<br/>• messageQueue queue reads and writes"]
        L2["2. Second priority: activeSession (Session instance)<br/>• sendMessage() drives the ReAct loop<br/>• state / mode / model state machine<br/>• permissions and the _pendingApprovals approval gate"]
        L3["3. Third priority: controller (Harness / AgentController instance)<br/>• global config / storage engine (storage)<br/>• mode config (modes) / subagent registry (subagents)<br/>• session factory (createSession)"]

        L1 -->|dynamic fallback when not found| L2
        L2 -->|dynamic fallback when not found| L3
    end

    HarnessProxy --> FallbackChain
    L2 -->|assembles and drives| AgentCore["Agent (agent capability core)<br/>src/core/agent/agent.ts<br/>• instructions prompt management<br/>• tools available tool registry<br/>• stream() TransformStream streaming execution"]
    L3 -.->|config injection| AgentCore
```

##### 1. Responsibility boundaries and class contracts of the four core entities

| Core entity                             | Source location                                                                                                                      | Core positioning and responsibilities                                                                                                                                                                                                                                                                          |
| :-------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Agent`**                             | [`src/core/agent/agent.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/agent/agent.ts)                              | **Atomic agent capability wrapper**. Manages System Instructions, Model resolution, Tools list injection and Memory association, and provides the basic streaming generation `stream()`.                                                                                                                       |
| **`Harness`** (`AgentController`)       | [`src/core/controller/controller.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts)          | **Workspace-level scheduling host and Session factory**. Holds global storage (Storage), persistent memory (Memory), modes (Modes) and the subagent registry (Subagents), and manages the lifecycle of multiple Sessions.                                                                                      |
| **`ActiveSession`** (`Session<TState>`) | [`src/core/controller/controller.ts:296`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts#L296) | **Stateful single-project / workspace-branch execution instance**. Each project or Git Worktree maps to an independent Session. Manages reactive state, the current Model/Mode, historical Threads and the tool approval gate (`_pendingApprovals`), and hosts the main execution entry point `sendMessage()`. |
| **`HarnessProxy`** (`MyAgentHarness`)   | [`src/harness/index.ts:1096`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/harness/index.ts#L1096)                         | **Advanced polymorphic facade proxy**. Dynamically aggregates `adapter`, `activeSession` and `controller` through an ES6 `Proxy`, exposing a unified interface that is fully featured, dynamically late-bound and free of boilerplate forwarding.                                                              |

---

##### 2. Core class and interface definitions

###### (1) `Agent` class definition

```typescript
export class Agent {
	id: string
	name: string
	description?: string
	instructions?: any // a string or a dynamic function returning a string (args: { requestContext }) => Promise<string>
	model?: any // a language model instance or a resolver function (args: { requestContext }) => Promise<LanguageModel>
	tools?: any // a tool map dictionary or resolver function Record<string, Tool>
	memory?: any // the memory management module

	constructor(config: AgentConfig)

	// resolve and return the system prompt for the current request context
	async getInstructions(args?: {
		requestContext?: RequestContext
	}): Promise<string>
	// dynamically resolve the language model used by the current request context
	async getModel(args?: { requestContext?: RequestContext }): Promise<any>
	// list every tool instance currently available
	async listTools(args?: {
		requestContext?: RequestContext
	}): Promise<Record<string, any>>
	// core streaming execution: call the Vercel AI SDK's streamText and normalize the output event stream through a built-in TransformStream
	async stream(
		taskOrPrompt: string | any,
		options?: AgentStreamOptions,
	): Promise<{
		fullStream: ReadableStream<any>
		textStream: ReadableStream<string>
		text: Promise<string>
		getFullOutput: () => Promise<{
			text: string
			usage: any
			finishReason: any
		}>
	}>
}
```

###### (2) `Harness` / `AgentController` class definition

```typescript
export class AgentController<TState = any> {
	readonly id: string
	readonly agent: Agent // the associated primary Agent instance
	readonly storage: any // the global storage engine (SQLite / LibSQL)
	readonly memory?: any // the observational memory module (OM)
	readonly defaultModeId: string // the default mode (e.g. "build")
	readonly modes: AgentMode[] // the list of registered working modes (build, plan, etc.)
	readonly subagents: HarnessSubagent[] // the list of registered subagents (explore, plan, execute)
	readonly toolCategoryResolver?: (toolName: string) => string // the tool category resolver

	constructor(config: HarnessConfig<TState>)

	async init(): Promise<void>
	// session factory: create or fetch the independent state session for the given workspace / resource
	async createSession(options?: {
		resourceId?: string
	}): Promise<Session<TState>>
	getSession(sessionId: string): Session<TState> | undefined
	listModes(): AgentMode[]
	async listAvailableModels(): Promise<AvailableModelItem[]>
}
```

###### (3) `ActiveSession` (`Session<TState>`) class definition

```typescript
export class Session<TState = any> {
	readonly id: string
	readonly resourceId: string
	readonly controller: AgentController<TState>

	// state machine and environment config accessors
	readonly state: {
		get: () => TState
		set: (patch: Partial<TState>) => Promise<void>
	}
	readonly mode: {
		get: () => string
		switch: (opts: { modeId: string }) => Promise<void>
	}
	readonly model: { get: () => any; switch: (modelId: string) => Promise<void> }

	// historical session management
	readonly thread: {
		getId: () => string
		switch: (opts: { threadId: string }) => Promise<void>
		create: (opts?: {
			title?: string
			metadata?: Record<string, unknown>
		}) => Promise<ThreadLike>
		list: () => Promise<ThreadLike[]>
		listMessages: (opts?: { threadId?: string; limit?: number }) => Promise<any>
		delete: (opts: { threadId: string }) => Promise<void>
	}

	// permission gate and human approval control
	readonly permissions: {
		getRules: () => {
			categories: Record<string, string>
			tools: Record<string, string>
		}
		setForCategory: (opts: {
			category: ToolCategory
			policy: PermissionPolicy
		}) => void
	}

	// core task driver: assemble tools, inject approval interception, drive the streamText loop and broadcast events
	async sendMessage(options: SendMessageOptions): Promise<void>
	// asynchronously abort the running task and its process group
	async abort(): Promise<void>
	// respond to the manual approval of a tool call (Approve / Decline)
	respondToToolApproval(opts: {
		decision?: "approve" | "decline"
		toolCallId: string
	}): void
	// subscribe to the full set of lifecycle events emitted by the current session (tool_start, tool_end, message_delta, etc.)
	subscribe(listener: (event: HarnessEvent) => void): () => void
}
```

###### (4) `HarnessProxy` and the `adapter` facade

```typescript
// 1. adapter: wraps high-level business logic and storage fallback on top of the session
const adapter: MyAgentHarness = {
    id: "myagent-code",
    controller,
    get activeSession() { return activeSession },
    async init() {
        await controller.init()
        const session = activeSession ?? (await sessionReady)
        await session.init?.()
        // automatically restore the last opened project session Thread
        ...
    },
    async listMessages(options) {
        // first read the in-memory session, then double-query the SQLite storage to backfill the precise execution duration durationMs
        ...
    },
    ...
}

// 2. harness: build a three-level dynamic lookup chain on top of Proxy
const harness: MyAgentHarness = new Proxy(adapter, {
    get(target: MyAgentHarness, prop: string | symbol) {
        if (prop in target) {
            return (target as unknown as Record<string | symbol, unknown>)[prop]
        }
        if (activeSession && prop in (activeSession as unknown as object)) {
            const val = (activeSession as unknown as Record<string | symbol, unknown>)[prop]
            return typeof val === "function" ? val.bind(activeSession) : val
        }
        if (prop in (controller as unknown as object)) {
            const val = (controller as unknown as Record<string | symbol, unknown>)[prop]
            return typeof val === "function" ? val.bind(controller) : val
        }
        return undefined
    },
})
```

---

##### 3. Why wrap a `Proxy` around `adapter`?

Using `Proxy` delivers four irreplaceable core architectural values:

1. **Solving the timing problem of the asynchronously late-mounted `activeSession` (Late-bound Dynamic Reference)**:
   During `createMyAgent()` initialization, `activeSession` depends on the asynchronous Promise created by `controller.createSession(...)`. With a traditional static copy (such as `Object.assign`), `activeSession` is still `null` the moment the function returns, and every method hanging off it would be lost entirely; the Proxy, by contrast, **evaluates dynamically at the moment the property is accessed**, so once asynchronous creation completes, callers can reach it transparently right away.
2. **Zero-Boilerplate Delegation**:
   `Session` and `AgentController` contain a large number of internal methods and deep state (such as `permissions`, `thread`, `om` memory, `storage`, etc.). Without a Proxy, developers would have to hand-write dozens of identical forwarding functions on the `adapter` object (`foo(...args) { return this.activeSession.foo(...args); }`), which is prohibitively expensive to maintain; the Proxy delivers **transparent automatic fallback delegation** for the entire API surface.
3. **Guaranteed `this` context binding (Execution Context Binding)**:
   On property access, the Proxy automatically runs `.bind(activeSession)` or `.bind(controller)` on functions, ensuring that when the underlying method executes, its internal `this` always points at the original instance, ruling out `TypeError: Cannot read properties of undefined` caused by lost context when accessing internal private properties (such as `this._state`, `this._pendingApprovals`).
4. **High-level business override first (Override & Enrichment)**:
   The Proxy checks `if (prop in target)` first, which lets `adapter` precisely override key business methods (for example the SQLite supplementary-query fallback of `listMessages`, or the memory restoration of `init`); methods that are not overridden pass straight through to the underlying implementation.

---

#### 3.4.2 Storage engine and database persistence

An embedded LibSQL (SQLite) database is initialized automatically by default, located in the system AppData directory, providing zero-configuration local persistence for Thread history, message lists and Token usage.

#### 3.4.3 Observational Memory

Solves the pain point of context-window explosion during long coding conversations:

- **Observer model**: periodically scans tool inputs and outputs in the session and extracts summarized observation records.
- **Reflector model**: reflects on and distills high-frequency facts and architectural consensus, dynamically maintaining the long-term memory context.
- See [3.5 Memory module](#35-memory-module-srcmemory) for the concrete implementation.

#### 3.4.4 Agent ReAct loop and tool stream

- Instantiates the core agent `codeAgent` and configures `maxSteps: 1000` in `harness.sendMessage()`.
- The model reasons from the instructions and autonomously decides which tools to call; after a tool runs on the host, its standard output or exception is fed back to the model, and the model keeps iterating until the overall task is complete.

#### 3.4.5 Extended tool ecosystem and sandbox safety (`src/tools/`, `src/lsp/`, `src/browser/`)

- **Basic code tools**: `view` (view code), `grep` (regex content search), `glob` (file matching), `execute_command` (controlled command execution), `write_file` (write file).
- **AST smart editing**: `string_replace_lsp` implements precise syntax-tree-level code replacement on top of the LSP protocol.
- **Browser automation**: `navigate-browser` and `computer` drive headless / visible browsers with Playwright for frontend UI regression and interaction.
- **MCP external tool extensions**: dynamically mount external tools exposed by external Model Context Protocol servers.
- **Sandbox and path protection**: every read/write and terminal operation is forced through `assertPathAllowed` to stay within `projectRoot`; crossing that boundary requires escalation confirmed by `request_sandbox_access`.

#### 3.4.6 Tiered Subagents & Multi-Agent Architecture

The project architecturally supports a comprehensive multi-agent system combining **vertical hierarchical delegation (Subagents)** and **horizontal cross-node federation (A2A Protocol & Workspace Concurrency)**:

```mermaid
flowchart TD
    subgraph ExternalAgents ["1. Cross-Agent Federation (A2A Protocol)"]
        RemoteAgent["External Agent / CLI Node"] <-->|"A2A JSON-RPC & SSE<br/>(Agent Card Skill Discovery)"| A2AServer["A2A Protocol Service (@my-agent/a2a)"]
    end

    subgraph MultiWorktree ["2. Multi-Worktree Agent Concurrency (Workspace Concurrency)"]
        Dashboard["Agent Dashboard"] -.->|"Concurrent Session Monitor & Switch"| MainSessionA["Worktree A Agent"]
        Dashboard -.->|"Concurrent Session Monitor & Switch"| MainSessionB["Worktree B Agent"]
    end

    subgraph Host ["3. Core Agent Scheduling Layer (@my-agent/core · Main Process)"]
        Session["Session / Controller<br/>(Maintains SQLite memory & history)"]

        subgraph MainAgentBox ["Main Agent (code-agent · Decision Making & Worker Host)"]
            ParentAgent["Flagship reasoning model (Claude 3.7 / GPT-4o)<br/>Task breakdown & user interaction"]
            WorkerEngine["[Built-in Worker Scheduling Engine]<br/>• Handshake context injection (INIT)<br/>• Sub-millisecond abort & 2s forceful terminate<br/>• Host tool RPC bridge (execute_command, etc.)"]
            ParentAgent -->|"Calls subagent meta-tool"| WorkerEngine
        end

        Session --> ParentAgent
        A2AServer --> Session
    end

    subgraph SubagentSandbox ["4. Multi-Core Concurrent Worker Pool (Node.js worker_threads)"]
        WorkerEngine -->|"Spawns isolated Worker thread<br/>dist/main/subagent-worker.cjs"| WorkerThreadPool{"Multi-Core Allocation"}

        WorkerThreadPool -->|"Worker Thread A (explore)"| ExploreAgent["Explore Worker<br/>• Dedicated CPU core & isolated Event Loop<br/>• Native local execution: view, search_content, find_files (zero UI lag)<br/>• Returns <300 word distilled summary"]
        WorkerThreadPool -->|"Worker Thread B (plan)"| PlanAgent["Plan Worker<br/>• Dedicated CPU core & isolated Event Loop<br/>• Read-only environment, analyzes dependencies"]
        WorkerThreadPool -->|"Worker Thread C (execute)"| ExecuteAgent["Execute Worker<br/>• Dedicated CPU core & isolated Event Loop<br/>• Local edits: LSP edit, write_file<br/>• Host RPC bridge: execute_command, task_write/check<br/>• Closed loop: edit code → run tests"]
    end

    subgraph Feedback ["5. Context Distillation, Bi-Directional IPC & Live UI Streaming"]
        ExploreAgent -->|"IPC DONE: Distilled findings"| WorkerEngine
        PlanAgent -->|"IPC DONE: Step blueprints"| WorkerEngine
        ExecuteAgent -->|"IPC DONE: Modification & test reports"| WorkerEngine
        WorkerEngine -->|"Injects final output into parent ReAct loop"| ParentAgent

        ExploreAgent -.->|"IPC EVENT: text-delta / tool-call"| WorkerEngine
        PlanAgent -.->|"IPC EVENT: text-delta / tool-call"| WorkerEngine
        ExecuteAgent -.->|"IPC EVENT: text-delta / tool-call"| WorkerEngine

        WorkerEngine -.->|"Live broadcasts subagent_start / tool_call / text_delta"| UIComponent["Desktop UI (SubagentExecution.tsx)<br/>🏗️ Nested step accordion card (Lag-free live streaming)"]
    end
```

##### 1. Built-in Subagent Roles & Permission Tiers

The parent agent dynamically spawns lightweight Subagents on demand via the `subagent` meta-tool (`createSubagentTool`, `packages/core/src/tools/subagent.ts:47`). The three built-in types are defined in `packages/core/src/agents/` as pure data (`SubagentDefinition`: `id` / `name` / `instructions` / `allowedTools`), indexed by the registry in `agents/index.ts`:

| Subagent Type | Role & Focus                           | Allowed Tools (`allowedTools`)                                                                                            | Default Model Policy (`subagent.ts:43-45`)                                     | Primary Scenarios                                                                                                                  |
| :------------ | :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **`explore`** | Read-only codebase exploration         | `view`, `search_content`, `find_files`                                                                                    | `google/gemini-2.0-flash`<br/>(Fast / low-cost / instant response)             | Large-scale codebase search, finding call sites, inspecting structure; prevents raw file contents from exploding the main context. |
| **`plan`**    | Architecture & implementation planning | `view`, `search_content`, `find_files`                                                                                    | `google/gemini-2.0-flash`<br/>(Shares default with explore, can be overridden) | Pre-implementation architecture breakdown, dependency analysis, producing actionable ordered steps.                                |
| **`execute`** | Focused read-write execution           | `view`, `search_content`, `find_files`, `string_replace_lsp`, `write_file`, `execute_command`, `task_write`, `task_check` | `google/gemini-2.0-flash`<br/>(Can be overridden, coding models recommended)   | Targeted implementation and refactoring within a scoped module, running tests locally until passing before reporting back.         |

##### 2. Implementation Details: Agent -> Worker Scheduling Architecture & Execution Mechanics

**Invocation Flow & Multi-Core Concurrency**

```
Agent (Main Process ReAct Loop)
  └─ tools.subagent({ agentType, task, modelId? })      packages/core/src/tools/subagent.ts
       ├─ getSubagentDefinition(agentType)              packages/core/src/agents/index.ts
       ├─ Resolve model & snapshot (ResolvedModelSnapshot)
       ├─ Instantiate SubagentWorkerHost (Host Manager) packages/core/src/subagent/worker-host.ts
       │    ├─ Multi-candidate discovery (dist/main/subagent-worker.cjs or worker-entry.ts)
       │    └─ new Worker(entry) spawns isolated Worker thread (dedicated CPU core & Event Loop)
       │
       ▼ (Bi-directional IPC message protocol)
Worker Thread (SubagentWorkerExecutor)                  packages/core/src/subagent/worker-executor.ts
       ├─ Receives INIT handshake message (task, model, projectRoot, allowedTools)
       ├─ Local tools execute natively (view, search_content, find_files, write_file) → Zero main thread lag
       ├─ Host tools bridged via RPC (TOOL_INVOKE -> execute_command / task_write -> TOOL_RESULT)
       ├─ new Agent({ instructions, model, tools }) closed ReAct loop
       ├─ subagent.stream(task, { maxSteps: 50, abortSignal })
       │    └─ Streams real-time EVENT messages to Host (subagent_start, subagent_text_delta, subagent_tool_*)
       └─ Sends DONE message (final text + <subagent-meta />)

Host Layer (Main Process)
       ├─ Real-time UI streaming: worker.on('message', EVENT) → harnessContext.emitEvent → Desktop UI
       ├─ Host tool execution: TOOL_INVOKE executed with defensive RequestContext wrapping → TOOL_RESULT
       ├─ Sub-millisecond abort: Forwards ABORT immediately on abortSignal; force worker.terminate() after 2s
       ├─ Crash isolation: Catches worker errors/exits gracefully, preventing host Electron app crashes
       └─ Returns formatted final output to parent Agent
```

**Bi-Directional IPC Message Protocol (`packages/core/src/subagent/protocol.ts`)**

| Direction         | Message Type (`type`) | Purpose & Timing                                                    | Key Payload                                                                                   |
| :---------------- | :-------------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| **Host → Worker** | `INIT`                | Startup handshake, initializes Worker execution context             | `toolCallId`, `agentType`, `task`, `modelId`, `model` snapshot, `allowedTools`, `projectRoot` |
| **Host → Worker** | `ABORT`               | Cooperative cancellation on user stop or timeout                    | `toolCallId`, `reason`                                                                        |
| **Host → Worker** | `TOOL_RESULT`         | Returns result of host-bridged sensitive/singleton tools            | `callId`, `result`, `isError`, `error`                                                        |
| **Worker → Host** | `EVENT`               | Real-time stream events forwarded to frontend UI                    | `toolCallId`, `event` (`subagent_start` / `tool_start` / `tool_end` / `text_delta` / `end`)   |
| **Worker → Host** | `TOOL_INVOKE`         | Worker requests host execution for privileged tools (e.g. terminal) | `callId`, `toolName`, `args`                                                                  |
| **Worker → Host** | `DONE`                | Successful or canceled completion with metadata                     | `toolCallId`, `resultText`, `toolCallLog`, `durationMs`, `meta`, `isError`                    |
| **Worker → Host** | `ERROR`               | Unhandled error inside worker thread                                | `toolCallId`, `error`                                                                         |

**Key Architectural Features:**

- **Genuine Multi-Core Concurrency & Zero UI Jitter**: Heavy CPU-bound operations (`search_content` recursive regex greps, `find_files` directory scans, AST parsing, diff calculation) run entirely inside the Worker thread's own V8 Isolate, consuming an independent CPU core. This completely isolates heavy compute from Electron's main process, preventing any UI frame drops or IPC freezes.
- **Native Build Integration & Zero Runtime Overhead**: `electron.vite.config.ts` declares `subagent-worker` as a dedicated entry point, compiling directly to `dist/main/subagent-worker.cjs`. This standalone CommonJS bundle launches in milliseconds within packaged Electron apps (asar) and development environments without requiring runtime TypeScript compilation hooks.
- **Defensive Host Tool RPC Bridging**: Host tools requiring elevated privileges or user approval (`execute_command`, `task_write`) are proxied via `TOOL_INVOKE`. The host automatically wraps the execution context in a defensive `RequestContext`, preventing `toolContext?.requestContext?.get is not a function` errors.
- **Crash Isolation & Resilience**: Worker threads possess independent memory heaps. In the event of an Out-Of-Memory (OOM) error or unhandled native crash within a worker, the host catches the error via `worker.on('error')` / `worker.on('exit')` and marks the specific Subagent card as failed without crashing the host application.
- **Sub-Millisecond Cancellation & Hard Terminate**: When the user clicks stop, the parent `abortSignal` immediately emits an `ABORT` message. If the worker remains blocked by synchronous operations after 2 seconds, the host invokes `worker.terminate()` to forcefully reclaim system resources.
- **Persistent Metadata Reconstruction**: Upon completion, `<subagent-meta modelId="..." durationMs="..." tools="view:ok,search_content:err" />` is appended to the message text, enabling full UI card reconstruction (with durations, models, and tool step logs) when reloading chat sessions from local SQLite storage.

**Model Routing Priority (`subagent.ts:120-139`)**

1. Explicit `modelId` argument passed in tool call;
2. Configured persistent model per agent type: `harness.getSubagentModelId({ agentType })` → `AuthStorage.getSubagentModelId(agentType)` (stored as `_subagentModelId_<agentType>` in `<dataDir>`);
3. `createSubagentTool({ defaultModelId })` — current session model ID passed by `harness/tools.ts:160-164`;
4. Built-in fallback: `google/gemini-2.0-flash`.

##### 3. Usage Scenarios & Recommendations

| Scenario                                            | Recommended Type | Rationale                                                   |
| :-------------------------------------------------- | :--------------- | :---------------------------------------------------------- |
| "Where is X defined / Who calls Y / How does Z run" | `explore`        | Massive greps and file reads remain isolated in subagent    |
| Multi-subsystem investigation (frontend + backend)  | `explore` × N    | Concurrent exploration without polluting main context       |
| Architecture / plan formulation before big PR       | `plan`           | Read-only traversal, returns actionable implementation plan |
| Self-contained refactoring or unit edits            | `execute`        | Read-write capability with local test verification loop     |
| Mechanical repetitive refactoring                   | `execute`        | Self-contained validation, returns final summary to parent  |

##### 4. Customization & Extensions

Currently, adding a new subagent type simply requires registering a definition:

```ts
// packages/core/src/agents/review.ts
import type { SubagentDefinition } from "./types.js"

export const reviewSubagent: SubagentDefinition = {
	id: "review",
	name: "Review",
	instructions: `You are a strict code reviewer...`,
	allowedTools: ["view", "search_content", "find_files", "execute_command"],
}

// packages/core/src/agents/index.ts
const subagentRegistry: Record<string, SubagentDefinition> = {
	explore: exploreSubagent,
	plan: planSubagent,
	execute: executeSubagent,
	review: reviewSubagent, // ← Appears automatically in tool schema & description
}
```

##### 5. Event Flow & UI Presentation

The `subagent` tool emits real-time events via `harness.emitEvent` on `requestContext` (`packages/core/src/tools/subagent.ts`), tagged with the parent's `toolCallId`:

| Event                 | Timing               | Payload                                      |
| :-------------------- | :------------------- | :------------------------------------------- |
| `subagent_start`      | Subagent initialized | `agentType`, `task`, `modelId`               |
| `subagent_tool_start` | Tool call initiated  | `subToolName`, `subToolArgs`                 |
| `subagent_tool_end`   | Tool call completed  | `subToolName`, `subToolResult`, `isError`    |
| `subagent_text_delta` | Streaming text chunk | `textDelta` (accumulates into `partialText`) |
| `subagent_end`        | Finished / aborted   | `result`, `isError`, `durationMs`            |

Renderer pipeline: `useHarnessEvents.ts:512-554` maps events to `SUBAGENT_START` / `SUBAGENT_TOOL_START` / `SUBAGENT_TOOL_END` / `SUBAGENT_END`, rendered as interactive `🏗️ Agent` cards via `SubagentExecution.tsx`.

##### 6. Why Multi-Tiered Subagents? (Design Advantages)

1. **Least Privilege & Physical Injection Defense**:
   - `explore` and `plan` instances physically exclude `write_file` and `execute_command` (`packages/core/src/tools/subagent.ts:113-118`). Even if untrusted third-party code contains prompt injection, destructive tool calls are physically impossible.
2. **Context Isolation & Noise Filtering**:
   - Subagents run in isolated scratchpads without inheriting parent chat history. Thousands of lines of raw search results are distilled down into a structured summary under 300 words (`packages/core/src/agents/explore.ts:38`).
3. **Tiered Model Routing**:
   - High-cost frontier models are reserved for top-level reasoning while routine codebase exploration delegates to fast, low-cost flash models.
4. **Tool Confusion Elimination**:
   - Narrowing tool options down to 3 focused primitives increases model tool-calling accuracy to near 100%.
5. **Parallel Multitasking & Unified UI**:
   - The main agent can launch multiple subagents concurrently, streaming distinct cards in the UI without cross-contamination.

#### 3.4.7 Execution modes and graph scheduling (`src/core/graph/`)

With the same model and the same tool set, three **execution modes** can be switched according to the nature of the task. A mode is not a prompt toggle but a **replacement of the entire execution graph**: each mode registers an independent `AgentGraphDefinition` (with a topology description `topology` and a `buildGraph(ctx)` factory), selected at runtime by `modeId`.

| Mode ID | UI name          | Execution graph shape                                                                                                                                                                 | Applicable scenarios                                                                      |
| :------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `react` | **ReAct**        | Single-graph autonomous loop: LLM reasoning → tool call → observation feedback → reasoning again, until the final answer is produced                                                  | The vast majority of real code-changing tasks (the UI default)                            |
| `plan`  | **Plan & Solve** | Two-phase graph: first generate a structured plan (`PlanStep[]` / task board), then execute item by item and backfill status by completion                                            | Large refactors and multi-file feature development, where you need to see the route first |
| `fast`  | **Fast**         | Single-node direct streaming response, mounting only **read-only tools** (read file / code search / web search), and providing no write, edit or terminal execution capability at all | Lightweight requests such as Q&A, explaining code and looking things up                   |

Implementation highlights:

- **Enum and aliases**: `src/core/graph/types.ts` defines `ExecutionMode` (`REACT` / `FAST` / `PLAN`); `GraphRegistry` registers `build` as an alias of `react` (the registry's own fallback `defaultModeId` is still `"build"`, which ultimately resolves to the ReAct graph), so older session records and recordings never become invalid.
- **Scheduling entry**: `Harness.sendMessage()` picks the graph definition according to `modeId` and builds the StateGraph for that run, so `maxSteps`, the available tool set and whether a plan is emitted are all decided by the mode (Plan mode, for example, additionally mounts the task board tools).
- **Remembered per thread**: the renderer stores the selected mode in `modesByThread[threadKey]` and persists it together with the thread metadata; switching threads automatically restores the mode that thread used last, so you never get "thread A is in Plan and thread B gets switched along with it".
- **Fast's read-only boundary**: the Fast graph filters tools by permission category with `selectReadOnlyTools()` (`src/core/graph/readonly-tools.ts`) — only the `read` category is kept, so `write_file` / `string_replace_lsp` / `ast_smart_edit` / `execute_command` / MCP tools never appear in front of the model; at the same time `describeToolNames("fast")` only registers `view` / `search_content` / `find_files` / `request_sandbox_access`, so the prompt and the real tool set cannot drift apart. Inside the graph, `stopWhen: stepCountIs(8)` permits a small number of tool rounds before forcing a written answer.
- **Observable**: both the Agent Dashboard and the Context panel read `modeId`, and the top status bar shows the current mode in real time; recording and replay write the mode into `RecordedRuntime`, see the next section.

#### 3.4.8 Session recording and offline replay (`src/core/recorder/`)

**Record one real run completely to a file**, then replay the whole conversation verbatim without calling the model or touching the file system — used for issue reproduction, regression comparison and demos.

```
src/core/recorder/
├── session-recorder.ts    # JSONL recorder that flushes to disk as it writes
├── recording-manager.ts   # singleton manager: recorder lifecycle + recording file enumeration
├── replay.ts              # recording script loading / validation / ReplayLanguageModel
├── replay-runtime.ts      # tool and runtime stand-ins used during replay
├── types.ts               # SessionEvent / RecordedRuntime / ReplayScript types
└── index.ts
```

**Recording**

- Trigger: the record button in the Composer → IPC `toggleSessionRecording`; it cannot be started while a run is in progress (otherwise a half-finished run would be recorded), and when stopped `validateRecordingFile` is called to verify that the file is usable.
- Output location: `~/.myagent/sessions/<threadId>/<runId>.jsonl` (overridable through the `MYAGENT_SESSIONS_DIR` environment variable); the directory is created at startup, writes are appended, and even a crash will not lose the parts already written.
- Event flow: `session` (version, cwd, model, runtime snapshot) → `run/start` → `step/start` → `assistant/stream` → `tool/result` → … → `run/end`.
- **Compact aggregation**: `assistant/stream` is not stored chunk by chunk; chunks are aggregated by index into `text-chunks` / `reasoning-chunks` / `tool-call-chunks`, and the millisecond interval between chunks is recorded as `dt: number[]`. This preserves both the "typewriter rhythm" and DeepSeek's `reasoning_content` reasoning chain, while keeping the file size to a fraction of the raw stream.
- **Environment snapshot**: `RecordedRuntime` records `modelId`, `modeId`, `permissionMode` and `thinkingLevel`, plus the resolved permission rules (category policies + tool overrides) and session grants (`grants`). Without it, replay would run with the _current_ model / mode / permissions, leading to problems such as Plan mode hiding a write tool the recording used, `read-only` rejecting a command the recording ran, or `auto-approve` skipping an approval that should have been shown.

**Replay**

- `ReplayLanguageModel` implements the `LanguageModelV2` interface and feeds the recorded stream to the Agent following the original `dt` timing — **zero network requests, zero token consumption**; tool calls are likewise swapped by `createReplayTools()` for stand-ins that return the recorded results, so nothing really modifies files or executes commands.
- Supports instant (`instant`) playback as well as speed-multiplied playback, and `wrap` for looping repetition.
- When replay starts, the mode and permissions are restored from `RecordedRuntime` and the session grants are injected, avoiding getting stuck waiting on an approval dialog that no human will ever answer.
- In the UI, choose a recording file or drag and drop it into `SessionReplayModal` to begin; the tab being replayed displays the Replay state, and you can stop at any time to return to the normal session.

### 3.5 Memory System (Tiered Memory & Prompt Caching) (`packages/core/src/memory/`)

`packages/core/src/memory/` implements a **Three-Tier Memory Architecture** tailored for autonomous coding agents:
It deeply integrates **In-Session Short-Term Working Context (L1)**, **In-Session Long-Term Observational Memory (L2 OM)**, **Cross-Session Project-Level Rules & Persistent Working Memory (L3)**, and a **Model Provider Prompt Caching Acceleration Base**. This achieves high context fidelity in multi-hour coding workflows, persistent cross-thread knowledge accumulation, and up to 90% cost/latency reduction.

```
packages/core/
├── src/memory/
│   ├── index.ts            # Public entry point: Memory / TokenCounter / types
│   ├── memory.ts           # Memory main class (extends MyAgentMemory, overrides SQLite storage)
│   ├── project-memory.ts   # Cross-session project-level Working Memory / Rules (.myagent/)
│   ├── token-counter.ts    # Lightweight tokenization estimator (ceil(len / 4))
│   ├── types.ts            # ObservationalMemoryConfig / MemoryOptions / construction config
│   └── __tests__/
│       ├── memory.test.ts
│       └── project-memory.test.ts
├── src/core/llm/
│   └── prompt-cache.ts     # Prompt Caching breakpoint injection and tool alphabetization
└── src/tools/
    └── project-memory.ts   # Agent autonomous memory & rules tool (project_memory)
```

#### 3.5.1 Three-Tier Memory Architecture System

```mermaid
flowchart TD
    subgraph L3["L3: Cross-Session Project Persistent Memory (.myagent/)"]
        PContext["project-context.json<br/>(Preferences / Conventions / Notes)"]
        PRules["rules/*.md<br/>(Team Guidelines / Architecture Standards)"]
        PTool["project_memory Tool<br/>(read / update / save_rule)"]
        PContext -->|"formatProjectWorkingMemory()"| SysHeader["&lt;project-working-memory&gt;<br/>System Prompt Header Injection"]
        PRules -->|"formatProjectWorkingMemory()"| SysHeader
        Agent["Autonomous Agent"] <-->|"Record & Update"| PTool
        PTool --> PContext
        PTool --> PRules
    end

    subgraph L2["L2: In-Session Long-Term Observational Memory (OM)"]
        History["Message Stream"] -->|"Exceeds obsThreshold (30k)"| Observer["Observer Model<br/>(Extracts Incremental Facts & Observations)"]
        Observer --> ActiveObs["activeObservations<br/>(Buffered Observation Store)"]
        ActiveObs -->|"Exceeds refThreshold (40k)"| Reflector["Reflector Model<br/>(Reflection & Multi-tier Compression)"]
        Reflector --> ActiveObs
        ActiveObs -->|"getSystemMessage()"| OMHeader["# Observational Memory<br/>System Prompt Section Injection"]
    end

    subgraph L1["L1: In-Session Working Context (Short-Term Assembly)"]
        DB[(myagent.db / SQLiteStore)] <-->|"Recent-First Paged Fetch (LIMIT 100)"| RawMsgs["Raw History Messages"]
        RawMsgs --> AssetDecouple["Asset Decoupling<br/>(.myagent/assets/)"]
        AssetDecouple --> ToolChainFix["AI SDK v6 Tool Repair<br/>(Synthetic tool-result Pairing)"]
        ToolChainFix --> TemporalDecay["Temporal Output Decay<br/>(Fold turns > 2 to summaries)"]
        TemporalDecay --> GoalSliding["Goal-Preserving Sliding Window (64k)<br/>(Anchors Root User Goal)"]
    end

    subgraph CacheBase["Foundation: Prompt Caching Prefix Acceleration"]
        SysHeader & OMHeader --> StaticPrefix["Byte-Stable Static Prefix<br/>(System + sortToolsByName)"]
        GoalSliding --> HistoryTurns["Historical Turns<br/>(Deterministic toolCallId)"]
        StaticPrefix -->|"Breakpoint 1: ephemeral"| LLM["Unified LLM Inference<br/>(TTFT down 80% / Cost down 90%)"]
        HistoryTurns -->|"Breakpoint 2: Penultimate User"| LLM
    end
```

##### Tiered Architecture Comparison Matrix

| Memory Tier                            | Storage Medium & Location                                           | Lifecycle                                      | Trigger & Processing Mechanism                                                          | Core Optimization & Value                                                                                            |
| :------------------------------------- | :------------------------------------------------------------------ | :--------------------------------------------- | :-------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **L1 In-Session Working Context**      | SQLite `myagent_messages`                                           | Single session process                         | Assembled fresh on every turn, normalized and trimmed before LLM dispatch               | • Asset decoupled to disk<br/>• Progressive tool result decay (>2 turns)<br/>• 64k goal-preserving sliding window    |
| **L2 Observational Memory (OM)**       | SQLite `myagent_threads` (OM domain)                                | Per-session / Shared across sessions (`scope`) | Dual-threshold rolling trigger (`obsThreshold: 30k`, `refThreshold: 40k`)               | • Async background buffering (`bufferTokens: 1/5`)<br/>• Up to 90% compression ratio<br/>• Zero-blocking `settled()` |
| **L3 Project-Level Persistent Memory** | `.myagent/project-context.json`<br/>`.myagent/rules/*.md`           | Permanently persisted across all sessions      | Auto-injected at session initialization; updated autonomously via `project_memory` tool | • Git-friendly version control<br/>• Team conventions & guidelines<br/>• Completely eliminates new-session amnesia   |
| **Prompt Cache Base**                  | Provider server-side cache (Anthropic / Gemini / DeepSeek / OpenAI) | Ephemeral in-memory (rolling 5m TTL)           | Alphabetical tool ordering + dual `ephemeral` breakpoint injection                      | • Time to First Token (TTFT) cut by 50%~80%<br/>• Input Token cost slashed by 75%~90%                                |

#### 3.5.2 Class Inheritance and Responsibility Boundaries

| Layer                   | Responsibility                                                                                                                                                                                                          |
| :---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MyAgentMemory`         | The core base class, providing all the "intelligent" parts: OM Observer/Reflector orchestration, observation record updates and the compression flow, system prompt injection, etc.                                     |
| `Memory` (this project) | Only overrides **storage field reads and writes**: thread CRUD, message reads/writes, recall pagination, system prompt retrieval, tokenization estimation; and leaves Mastra Working Memory as an empty implementation. |
| `TokenCounter`          | A purely functional estimator with no external dependencies (`ceil(len / 4)`), avoiding the startup cost of pulling in tiktoken encoding tables.                                                                        |

The design orientation is "rewrite close to the storage layer, leave the LLM-side logic upstream": OM observation extraction / reflection merging is performed by the base class and persisted to the database, while this class is strictly responsible for correctly retrieving those records from the storage layer (SQLiteStore), assembling them, and handing them to the Agent.

The base class `MyAgentMemory` (`packages/core/src/core/memory/base.ts`) is a **framework adapter skeleton**, not a directly usable implementation: it holds `storage` / `options` / `threadConfig`, provides `getInputProcessors()` / `getOutputProcessors()` to assemble a `MessageHistory` processor on demand, and offers lazy defaults (`getThreadById` returns `null`, `deleteThread` is a no-op). Its thread write paths `createThread` / `updateThread` / `copyThread` / `cloneThread` throw `"not implemented"` outright — which is exactly why the `Memory` subclass must override all four, and why no future Memory implementation can rely on the base class as a fallback.

#### 3.5.3 Storage Domain Adaptation and Thread/Message CRUD

Every read and write first resolves the `memory` domain of the composite storage through `getMemoryStore()`; if `storage` cannot be obtained or the domain is missing it throws immediately, avoiding silent degradation:

- **Threads**: `createThread` / `saveThread` fill in `title` (`"New Thread"`) before writing, satisfying the database `NOT NULL` constraint; `getThreadById`, `listThreads`, `updateThread` and `deleteThread` all pass straight through to the storage domain. `copyThread` / `cloneThread` serve "derive a new session from a historical one", accepting both `threadId` and `sourceThreadId` arguments and normalizing the returned structure.
- **Writing messages (`saveMessages`)**: first normalizes the format with `MessageList({ generateMessageId }).add(messages, "memory").get.all.db()` (the argument may be a string, an array or a parts structure); if a message lacks `resourceId`, the owning thread is looked up to fill it in; finally it writes them to the database in a batch and returns the estimated token usage of this write based on body length.
- **Recalling messages (`recall`)**: defaults to `perPage: 100` and `page: 0`; when `orderBy` is not given explicitly it takes the newest page using `createdAt DESC` and then reverses it in memory, guaranteeing "take the newest N, but return them in chronological order". After normalization it calls `filterSystemReminderMessages` to filter out system reminders and transient signals, and attaches `total / page / perPage / hasMore` pagination info for the UI to implement scroll loading. Because `MessageList` normalization drops `durationMs`, recall re-applies the timing from the raw DB rows by message id at the end — without it every execution block loses its duration once a historical thread is reloaded.
- **Deleting messages (`deleteMessages`)**: accepts `string[]`, `{ id }[]` and `{ messageIds: [...] }` argument shapes, extracts the ids uniformly and deletes them in a batch.

#### 3.5.4 In-Session Working Context Optimizations (L1 Context Assembly)

To handle large file transfer latency, multi-turn tool output token bloat, and context truncation goal loss during complex coding workflows, the runtime memory assembly layer (`packages/core/src/core/controller/controller.ts`) implements five core engineering optimizations:

1. **Asset Decoupled Storage**:
   - User-submitted images and document Base64 payloads are completely stripped from SQLite (`myagent_messages`) and stored to disk under `.myagent/assets/<assetId>.<ext>` by `AssetManager` (`packages/core/src/assets/manager.ts`), with auto-generated `.gitignore` protecting repo cleanliness.
   - Electron registers the privileged scheme `myagent-asset://` to stream assets locally without memory bloat; missing/deleted files gracefully fall back to an informative broken asset placeholder card in the UI.
   - The agent lazily fetches raw image or document content via the `assets_fetch` tool on demand when visual or text inspection is required.
2. **Tool Chain Integrity (AI SDK v6 Schema Compatibility)**:
   - Accurately reconstructs historical `tool-call` and `tool-result` message parts with normalized `input` and `args`, completely eliminating provider deserialization errors (`missing field arguments`).
   - Auto-fills synthetic placeholder results for interrupted tool executions from aborted previous turns, preventing upstream model APIs from rejecting incomplete tool pairs.
3. **Temporal Output Decay**:
   - **Latest 2 turns**: Full tool execution output is preserved (up to 6,000 characters) for immediate model reasoning and code editing.
   - **Turns older than 2 assistant turns**: Verbose outputs (> 300 characters) are collapsed into concise semantic summary placeholders (`[Tool Result: <toolName> completed. Content folded for context economy...]`), slashing historical token bloat by 70%~85%.
4. **Goal-Preserving Sliding Window**:
   - Maintains a safe 64,000-token historical budget.
   - When older turns must be truncated, extracts the initial root user task and prepends a structured summary note:
     `[System Note: Earlier conversation history was truncated (N messages folded). Original User Task: "..."]`
     fundamentally preventing "goal drift" across extended multi-turn sessions.
5. **Recent-First Paged Retrieval**:
   - History retrieval queries `ORDER BY createdAt DESC LIMIT 100` before inverting to chronological order in memory, bypassing unbounded full-table scans and deserialization overhead.

#### 3.5.5 Observational Memory Mechanics and Dual-Threshold Ladder (L2 OM)

The OM switch and all thresholds are centralized in `options.observationalMemory`; the types are defined in `packages/core/src/memory/types.ts`, and the actual assembly happens in `getDynamicMemory` in `packages/core/src/harness/index.ts`:

```ts
observationalMemory: {
  enabled: true,
  scope,                                  // "thread" | "resource"
  observation: {
    bufferTokens: 1 / 5,                  // run a background buffered observation every 20% of messageTokens
    bufferActivation: 2000,               // absolute token budget activated per crossing; the rest is kept for the next round
    messageTokens: obsThreshold,          // observation trigger threshold, default 30_000
    blockAfter: 2,                        // allow synchronous blocking observation once 2×messageTokens is reached
    model: ({ requestContext }) => ...,   // Observer model
  },
  reflection: {
    bufferActivation: 1 / 2,
    blockAfter: 1.1,
    observationTokens: refThreshold,      // reflection trigger threshold, default 40_000
    model: ({ requestContext }) => ...,   // Reflector model
  },
}
```

- **`scope` decides how far memory is visible**: `thread` (the default) observes and compresses independently for each session; `resource` shares observation records across all sessions with the same `resourceId`. The resolution order lives in `getOmScope()` (`packages/core/src/utils/project.ts`): `MYAGENT_OM_SCOPE` environment variable → project-level `<project>/.myagent/database.json` `omScope` → global `~/.myagent/database.json` → default `thread`.
- **`bufferTokens`**: expressed as "a ratio of `messageTokens`", this is the interval for background asynchronous buffered observation; `1/5` means the Observer runs in the background each time 20% of the threshold accumulates, storing results into the buffer so it can be activated directly without blocking when the line is really crossed.
- **`bufferActivation`**: the **absolute token budget** that may be activated in one crossing. Whatever is not activated stays in the `bufferedObservations` column and is merged in at the next crossing — deferred, never dropped. Splitting happens on line boundaries only: the observation log is a list of bullet items, and a character-wise cut would sever one fact mid-sentence, leaving both halves unusable. Unset means unbounded.
- **`blockAfter`**: the token threshold that permits "synchronous blocking observation" (with `1 < x < 100` it is resolved as a multiple of `messageTokens`, and with `≥ 100` as an absolute token count). Between `messageTokens` and `blockAfter` only asynchronous buffering runs, so unobserved messages may grow up to `blockAfter` (here `2 ×` ≈ 60k tokens) before a synchronous observation is inserted, preventing every Agent step from being slowed down by LLM observation calls.
- **Two-step threshold ladder**: when the conversation grows to `observationThreshold` (`observation.messageTokens`), the Observer extracts observation records; when the observation records themselves accumulate to `reflectionThreshold` (`reflection.observationTokens`), the Reflector merges the observations through reflection into a more condensed long-term memory (`reflection.blockAfter: 1.1` means synchronous reflection at 110% of the threshold), and the cycle repeats to achieve rolling compression of long conversations.
- **Retrieval entry `getSystemMessage()`**: reads `activeObservations` from the storage domain and wraps it into an `# Observational Memory` section, injected into the next request as a system prompt; when the record does not exist or is empty it returns `null`, and the whole read is wrapped in `try/catch` — an OM failure must never affect the main conversation path.
- **Concurrent-write protection**: two turns can cross the threshold together (a background observation plus a foreground retry). Both read the same `generationCount`, and the loser's write replaces the winner's `observedMessageIds` — those messages are then observed again on the next pass and the log keeps growing. `claimObservationalGeneration()` uses that column as an optimistic lock via CAS, and claims **before** calling the Observer model; otherwise the loser has already paid for a model call it discards.
- **UI progress reporting `loadOMProgress()`**: returns the full progress the renderer's `OMTokenTracker` needs (`pendingTokens` / `threshold` / `observationTokens` / `generationCount`). Thresholds come from the config rather than storage, so **a thread that has never been observed still shows how far it is from the trigger**; it returns `{}` when OM is disabled and the component hides itself.
- **Current implementation limits**: the Reflector (folding observations into a condensed long-term `reflection` section) is not implemented — `kind` only ever yields `none` or `observed`, so `reflection.*` settings currently have no effect and the log only grows. OM applies solely to the main session's `AgentController` request path; subagents (`agent.stream()`) are one-shot tasks with no persisted session history and do not participate.

#### 3.5.6 Cross-Session Project-Level Working Memory & Rules (L3 Project Memory)

To solve cross-session context amnesia where an agent forgets repository architectural constraints, development habits, and project rules in newly created threads, a lightweight, Git-friendly Project Working Memory and Rules system is implemented in `packages/core/src/memory/project-memory.ts`:

1. **Storage Architecture & File Layout**:
   - **Project Context (`project-context.json`)**: Located at `<projectRoot>/.myagent/project-context.json` (gracefully falling back to global `~/.myagent/project-context.json` if absent), storing developer preferences (`preferences`), engineering conventions (`conventions`), and architectural notes (`notes`) as clean JSON.
   - **Rules Documents (`rules/*.md`)**: Located under `<projectRoot>/.myagent/rules/*.md` and `~/.myagent/rules/*.md`, allowing team guidelines and coding conventions to be maintained as discrete Markdown documents suitable for Git version control and PR reviews.
2. **Automatic System Prompt Context Injection**:
   - During system prompt construction (`packages/core/src/prompts/index.ts`), `formatProjectWorkingMemory(ctx.workingDir)` is invoked automatically.
   - If context or rules exist, an authoritative `<project-working-memory>` XML section is injected into the model prompt header, guaranteeing that all modes (ReAct, Plan, Fast) immediately understand repository constraints at the start of any conversation. **This injection is read-only and is independent of tool availability below.**
3. **Autonomous Agent Memory Tool (`project_memory`)**:
   - The agent is equipped with the `project_memory` tool (`packages/core/src/tools/project-memory.ts`) exposing five actions:
     - `read`: Read current project working memory context and registered rules;
     - `update_context`: Incrementally update preferences, conventions, and architectural notes with automatic deduplication;
     - `save_rule`: Save or update individual Markdown rule documents in `.myagent/rules/<name>.md`;
     - `delete_rule`: Delete obsolete or superseded rule files;
     - `list_rules`: List all active project-level and global rule files.
   - **Mode availability**: the tool is listed in `WRITE_TOOL_NAMES` and `PLAN_TOOL_NAMES` in `harness/tools.ts`, so ReAct / Build / Plan hold it while **Fast mode does not** (Fast keeps only read-only tools). The system prompt injection described in point 2 still applies in all four modes, so Fast is bound by existing rules but cannot write new ones.
   - When a user states repository conventions (e.g. "always use pnpm", "place shared UI components under components/ui"), the Agent autonomously records these into working memory for perpetual recall across all threads. The base prompt (`packages/core/src/prompts/base.ts`) also documents the tool, so the model knows to persist long-lived conventions into `.myagent/` without reading these docs first.

#### 3.5.7 Model Provider Prompt Caching Alignment Mechanics

Mainstream Large Language Models (Anthropic Claude 3.5/3.7, Google Gemini 1.5/2.0, DeepSeek-V3/R1, OpenAI GPT-4o) natively support Prompt Caching (context prefix caching). When prompt prefixes (System Prompt + historical turns) remain byte-level stable across requests, cache hits deliver immense benefits:

- **Time to First Token (TTFT) reduced by 50%~80%**;
- **Input Token cost slashed by 75%~90%**.

To completely eliminate cache hash disruptions caused by dynamic timestamps, unsorted tool declarations, and non-deterministic UUIDs, a dedicated caching acceleration layer is implemented in `packages/core/src/core/llm/prompt-cache.ts`:

1. **Byte-Stable Static Prefix Orchestration**:
   - **Layered System Prompt**: High-frequency static elements (identity, mode workflows, `.myagent/` project rules, repository instructions) are placed strictly at the prompt header, while ephemeral dynamic context (session task checklists, PR review guidelines) is appended to the tail;
   - **Deterministic Tool Alphabetization (`sortToolsByName`)**: Tool definitions are deterministically sorted in alphabetical order before LLM dispatch, eliminating schema hash discrepancies caused by non-deterministic JavaScript object key iteration;
   - **Deterministic Historical Tool IDs**: Historical `toolCallId` values are derived deterministically without injecting random UUIDs or runtime timestamps that invalidate prefix hashes.
2. **Multi-Provider Dual Breakpoints**:
   - **Breakpoint 1 (System Prompt Static Base)**: Marks the trailing system message with `cacheControl: { type: "ephemeral" }` (for Claude and Gemini protocols), permanently caching global instructions and all tool definitions;
   - **Breakpoint 2 (Conversation History Rolling Breakpoint)**: Marks the penultimate user message (the completed interaction preceding the current query) with `cacheControl`, caching multi-turn historical context;
   - **Zero-Config Prefix Cache Compatibility**: Models with automatic prefix caching (DeepSeek, OpenAI) natively enjoy up to 90% cache hit rates without requiring special headers.

#### 3.5.8 Dynamic Memory Factory, Token Estimation and Test Coverage

1. **Dynamic Memory Factory & Hot Model Switching**:
   - `getDynamicMemory()` returns a dynamic resolution function (`DynamicArgument`) computed fresh against the current request context;
   - Uses `` `${obsThreshold}:${refThreshold}:${omScope}` `` as cache key to reuse the singleton instance when thresholds and scope remain unchanged;
   - `observation.model` / `reflection.model` are deferred resolution closures, taking immediate effect upon desktop settings changes or model switches without requiring session restarts.
2. **Token Estimation & Non-Blocking `settled()`**:
   - **`TokenCounter`**: Implements the `ceil(len / 4)` heuristic for zero-dependency token estimation, uniformly called via `Memory.estimateTokens()`;
   - **`settled()`**: Directly returns `Promise.resolve()`, allowing background OM observation/reflection tasks to run asynchronously without blocking UI `agent_end` responses;
   - **Mastra Working Memory Overrides**: Statically bypasses Mastra's single-thread user profile system, cleanly delegating long-term memory to L2 OM and L3 `.myagent/`.
3. **Automated Test Suite Coverage**:
   - `packages/core/src/memory/__tests__/memory.test.ts`: Verifies in-memory SQLite thread CRUD, message ordering, transient signal filtering, OM configuration, and `settled()`;
   - `packages/core/src/core/controller/__tests__/memory-context.test.ts`: Comprehensively tests asset decoupling, AI SDK v6 tool chain repair, temporal output decay beyond 2 turns, and root user goal preservation;
   - `packages/core/src/core/llm/__tests__/prompt-cache.test.ts`: Tests alphabetical tool ordering, dual `cacheControl` breakpoint marking, and prefix stability;
   - `packages/core/src/memory/__tests__/project-memory.test.ts`: Tests project context JSON read/write, Markdown rules CRUD, and incremental deduplication;
   - `packages/core/src/tools/__tests__/project-memory.test.ts`: Tests end-to-end autonomous invocation of the `project_memory` tool by the agent;
   - `packages/core/src/prompts/__tests__/projectMemoryPrompt.test.ts`: Validates automated `<project-working-memory>` XML injection and graceful empty state fallbacks.

### 3.6 A2A Protocol Service (`packages/a2a/`)

`@my-agent/a2a` exposes the `packages/core` Harness as a standardized Agent-to-Agent interface, enabling external clients (CLI, other agents, or the desktop application itself) to drive sessions using the same protocol.

| Layer      | File                                     | Responsibility                                                                                                                                                                      |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP Entry | `packages/a2a/src/server/http-server.ts` | `startA2AServer()` starts listening, `createA2ARequestHandler()` yields reusable request handlers, `A2AServer` class encapsulates lifecycle; listens on `127.0.0.1:3888` by default |
| Router     | `packages/a2a/src/server/router.ts`      | JSON-RPC 2.0 method table dispatch, parameter validation, and error code mapping                                                                                                    |
| SSE Stream | `packages/a2a/src/server/sse.ts`         | `handleSSEStream()` subscribes to `harness.subscribe(...)`, pushing engine events line by line as `event: <name>` / `data: <json>`                                                  |
| CORS       | `packages/a2a/src/server/cors.ts`        | Restricts origins strictly to local loopback (`getLoopbackOrigin`), never wildcard                                                                                                  |
| Agent Card | `packages/a2a/src/card.ts`               | `createAgentCard()` generates the `/.well-known/agent-card.json` profile, declaring JSON-RPC 1.0 bindings and streaming support                                                     |
| Client     | `packages/a2a/src/client/client.ts`      | Peer SDK encapsulating JSON-RPC invocation and SSE event consumption                                                                                                                |

**HTTP Endpoints**

- `GET /.well-known/agent-card.json` (or `/agent-card.json`): Agent capability card
- `GET /health`: Health check
- `GET /a2a/stream`: SSE event stream
- `POST /a2a`: JSON-RPC main entry point

**JSON-RPC Method Registry**

| Method                                                               | Description                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `projects/list` / `projects/create` / `projects/open`                | Project enumeration, creation, and switching (`projects/open` invokes `onSwitchProject` callback to sync desktop sessions) |
| `threads/list` / `threads/create` / `threads/get` / `threads/delete` | Thread lifecycle CRUD                                                                                                      |
| `message/send` / `tasks/create`                                      | Send user message, spawn asynchronous task                                                                                 |
| `tasks/get` / `tasks/cancel` / `tasks/revert`                        | Task status query, cancellation, and snapshot-based reversion                                                              |
| `approvals/list` / `approvals/submit`                                | Fetch pending tool approvals, submit approval decision (human-in-the-loop closure)                                         |

`startA2AServer()` accepts `getHarness`, `onSwitchProject`, and `onProjectListChanged` hooks, allowing remote sessions to switch projects while the desktop sidebar dynamically refreshes and rebuilds the Harness without restarting the service.

### 3.7 CLI Command Line and Local Daemon (`packages/cli/`)

`@my-agent/cli` provides the `my-agent` executable, bringing the engine to terminal workflows. It consists of two components:

- **Command Layer** `packages/cli/src/cli.ts`: Parses argv and routes to six subcommands under `packages/cli/src/commands/`.
- **Daemon Layer** `packages/cli/src/daemon.ts`: `startDaemon()` hosts an A2A service instance in the background, writing `{ pid, port, host, baseUrl, cwd, startedAt }` to `getAppDataDir()/daemon.json`; on retrieval it probes process vitality with `process.kill(pid, 0)` and discards stale records if deceased.

| Subcommand | Purpose                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| `serve`    | Foreground launch of daemon and A2A service (`--port` / `--host` / `--cwd`) |
| `run`      | One-off task execution and result retrieval                                 |
| `chat`     | Interactive multi-turn terminal chat                                        |
| `project`  | Project enumeration and switching                                           |
| `thread`   | Thread listing, creation, switching, and deletion                           |
| `status`   | Inspect daemon process status                                               |

`packages/cli/src/client-runner.ts` translates commands into JSON-RPC requests directed to the daemon. The CLI does not retain its own Harness instance — all state is concentrated in the daemon, allowing multiple terminal sessions to share the same workspace context.

---

## 4. Core business and data-flow sequences

### 4.1 Streaming sequence for user messages, reasoning chains and execution blocks

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant React as Renderer (ChatView)
    participant Preload as Preload layer (preload.ts)
    participant Main as Main process (harness-handlers)
    participant Harness as Harness scheduler
    participant Agent as MyAgent Core (LLM)

    User->>React: Enter an instruction and click send
    React->>Preload: window.api.invoke({ type: "sendMessage", content })
    Preload->>Main: ipcRenderer.invoke("harness:command")
    Main->>Harness: harness.sendMessage({ content })
    Harness->>Agent: agent.stream(message, streamOptions)

    loop Streaming output iteration (ReAct Loop)
        Agent-->>Harness: Emit reasoning block delta (type: "thinking")
        Harness->>Main: emit("message_update", msg)
        Main->>Preload: webContents.send("harness:event", msg)
        Preload->>React: window.api.onEvent callback
        React->>React: Update the Working for … preview (82px auto-scroll)

        Agent-->>Harness: Emit answer text delta (type: "text")
        Harness->>Main: emit("message_update", msg)
        Main->>Preload: webContents.send("harness:event", msg)
        Preload->>React: window.api.onEvent callback
        React->>React: Stream-render the Markdown reply
    end

    Agent-->>Harness: Reply finished (stopReason: "complete")
    Harness->>Main: emit("message_end", msg)
    Main->>Preload: webContents.send("harness:event", msg)
    Preload->>React: Update to the finished state, stop the Streaming cursor

    Harness->>Main: emit("agent_end")
    Main->>Preload: webContents.send("harness:event", agent_end)
    Preload->>React: onEvent callback
    React->>Main: invoke({ type: "getTaskChangedFiles", messageId })
    Main->>Main: Collect this turn's changed files and diff, then flush to disk
    Main-->>React: changedFiles
    React->>React: SET_MESSAGE_CHANGED_FILES + AGENT_END computes durationMs
    React->>React: Execution block collapses into "Worked for …", with the changed-files card appended
```

### 4.2 Tool-call approval and human-in-the-loop flow

```mermaid
sequenceDiagram
    autonumber
    participant Agent as MyAgent Core
    participant Harness as Harness scheduler
    participant Main as Main process (permission-handlers)
    participant UI as Renderer (ToolApprovalDialog)
    actor User as User

    Agent->>Harness: Request a tool call (e.g. execute_command)
    Note over Harness: Check the current category permission policy (not YOLO mode and set to ask)
    Harness->>Main: emit(tool_approval_required, toolName, args)
    Main->>UI: webContents.send(harness:event)
    UI->>User: Show the approval confirmation dialog (with command details and risk warnings)

    alt User approves (Approve)
        User->>UI: Click to allow execution
        UI->>Main: window.api.invoke(respondToToolApproval, approve)
        Main->>Harness: harness.respondToToolApproval(approve)
        Harness->>Agent: Release and execute the tool, return the execution result
    else User declines (Decline)
        User->>UI: Click decline
        UI->>Main: window.api.invoke(respondToToolApproval, decline)
        Main->>Harness: harness.respondToToolApproval(decline)
        Harness->>Agent: Return the cancellation notice (Action cancelled by user)
    end
```

### 4.3 Git Worktree multi-session isolation

```mermaid
flowchart LR
    subgraph Client ["Frontend UI"]
        Tab1["Workspace Tab A<br/>(/repo-main)"]
        Tab2["Workspace Tab B<br/>(/repo-worktree-feat)"]
    end

    subgraph Sessions ["Main process sessions Map"]
        SessionA["WorktreeSession A<br/>- Harness instance A<br/>- PtySession terminal A<br/>- Linear link A"]
        SessionB["WorktreeSession B<br/>- Harness instance B<br/>- PtySession terminal B<br/>- Linear link B"]
    end

    subgraph Storage ["Local data layer"]
        DBA["LibSQL DB (Resource: repo-main)"]
        DBB["LibSQL DB (Resource: repo-worktree-feat)"]
    end

    Tab1 <--> |"IPC session channel"| SessionA
    Tab2 <--> |"IPC session channel"| SessionB
    SessionA <--> DBA
    SessionB <--> DBB
```

- When switching between or opening multiple workspaces, the main process maintains `sessions: Map<string, WorktreeSession>` keyed by project root path.
- All foreground/background communication events carry the `worktreePath` identifier, and frontend Hooks automatically compare it against the currently active workspace, ruling out cross-talk and misplacement of background session messages.

### 4.4 A2A Remote Session Drives Desktop Workspace

When external clients (CLI or other agents) operate on projects via A2A, the desktop UI must track changes in real time rather than staying on the old workspace. The pipeline is as follows:

```mermaid
sequenceDiagram
    autonumber
    participant Client as Remote Client (CLI / Agent)
    participant Server as A2A Service (packages/a2a)
    participant Main as Main Process (a2a-handlers)
    participant Renderer as Renderer Process

    Client->>Server: POST /a2a  projects/open { path }
    Server->>Server: router validates parameters
    Server->>Main: onSwitchProject(path)
    Main->>Main: Find / create WorktreeSession by path and switch active Harness
    Main-->>Server: { harness }
    Server->>Server: Switch to target project's Harness instance
    Server->>Main: onProjectListChanged()
    Main->>Renderer: Push project / session list changes
    Renderer->>Renderer: Switch to corresponding project tab and refresh sidebar
    Server-->>Client: JSON-RPC result
```

- The `getHarness` hook ensures the router always accesses the "current project's" Harness instead of a stale instance captured at startup.
- The event stream is similarly routed per-project: when a client subscribes to `/a2a/stream`, it receives events from the active Harness; after switching projects, the stream follows the new instance.
- Cross-platform approval loop consistency: if a remotely triggered tool call requires confirmation, it appears in `approvals/list`. Both the desktop `ToolApprovalCard` and remote `approvals/submit` can resolve it.

---

## 5. Multi-Package Directory Structure Mapping

The repository employs a pnpm workspace monorepo layout (`pnpm-workspace.yaml` declares `packages/*` and `apps/*`), consolidating the home-grown agent engine and protocol layers into `packages/`, with the desktop application as the sole `apps/` consumer.

```
my-agent/
├── apps/
│   └── desktop/                   # Electron desktop application (sole GUI shell)
│       └── src/
│           ├── index.ts           # Desktop unified export
│           ├── types.ts           # Cross-process shared types
│           ├── electron/          # Main process layer
│           │   ├── main.ts        # App lifecycle, window creation, Harness bootstrap and event forwarding
│           │   ├── preload.ts     # contextBridge secure bridge injection
│           │   ├── electron-state.ts    # Workspace-scoped integration state (Linear/GitHub bindings)
│           │   ├── notifications.ts     # Native system notifications and badges
│           │   ├── external-links.ts    # External link interception and system browser dispatch
│           │   ├── logging.ts           # Main process log persistence
│           │   ├── helpers.ts           # OAuth validation and automatic conversation title generation
│           │   ├── project-threads.ts       # Project session indexing and persistence
│           │   ├── project-thread-write.ts  # Session write channel
│           │   ├── task-changes-store.ts    # Task modified files and diff persistence
│           │   ├── git-task-snapshot.ts     # Git change snapshots
│           │   ├── updater/       # App self-updater checks, downloading, and installation
│           │   ├── __tests__/     # Main process unit tests
│           │   └── ipc/           # Routing assembly for 19 IPC business sub-modules
│           │       ├── index.ts                  # Routing entry and dispatch
│           │       ├── harness-handlers.ts       # Message transport, mode and model scheduling
│           │       ├── project-handlers.ts       # Project detection, worktree switching and session construction
│           │       ├── repo-handlers.ts          # Repository metadata and remote URL resolution
│           │       ├── permission-handlers.ts    # Permission checks, tool approval, question interception
│           │       ├── a2a-handlers.ts           # A2A service lifecycle and remote session attachment
│           │       ├── pty-handlers.ts           # node-pty pseudo-terminal lifecycle and I/O
│           │       ├── git-handlers.ts           # Git status extraction and diff comparison
│           │       ├── file-handlers.ts          # Read-only file inspection and editor services
│           │       ├── context-handlers.ts       # Context file/directory additions, removals, and stats
│           │       ├── integration-handlers.ts   # Linear / GitHub two-way integration protocol
│           │       ├── mcp-handlers.ts           # MCP server connection lifecycle management
│           │       ├── settings-handlers.ts      # App preferences and model parameter persistence
│           │       ├── auth-handlers.ts          # OAuth credential rotation and callbacks
│           │       ├── dashboard-handlers.ts     # Token statistics and runtime duration aggregation
│           │       ├── slash-command-handlers.ts # Slash command loading and dynamic injection
│           │       ├── feedback-handlers.ts      # Message feedback reporting
│           │       ├── logging-handlers.ts       # Renderer log forwarding
│           │       ├── update-handlers.ts        # Version checks and update status
│           │       └── types.ts                  # IPC contract types
│           └── renderer/          # Renderer process UI layer (React 19 + TypeScript + Vite)
│               ├── index.html     # Page entry
│               ├── main.tsx       # React mount entry
│               ├── App.tsx        # Top-level layout shell, shortcut registration and state assembly
│               ├── components/    # Core UI panels and interactive components
│               │   ├── ChatView.tsx           # Conversation pipeline: message grouping, one execution block per turn
│               │   ├── AssistantMessage.tsx   # Assistant body rendering (Markdown / code highlighting)
│               │   ├── ExecutionBlock.tsx     # Execution block: Working for … / Worked for …
│               │   ├── UserMessage.tsx        # User message bubble: sticky, collapsible, image preview
│               │   ├── ToolExecution.tsx      # Tool execution status card
│               │   ├── ToolApprovalCard.tsx   # Tool approval card (once/conversation/project/global 4-tier scopes)
│               │   ├── SubagentExecution.tsx  # Nested subagent execution visualization
│               │   ├── FilesChangedBar.tsx    # Changed-files card and inline diff for the turn
│               │   ├── AppModals.tsx          # Centralized global modal mounting
│               │   ├── TerminalPanel.tsx      # Embedded terminal panel built on xterm.js
│               │   ├── FileEditor.tsx         # Syntax-highlighted code editor/viewer
│               │   ├── DiffEditor.tsx         # Diff panel
│               │   ├── TaskBoard.tsx          # Task board (Linear / GitHub Issues)
│               │   ├── ProjectList.tsx        # Project and session list (including project-list/ directory)
│               │   ├── Settings.tsx           # Settings panel (including settings/ directory)
│               │   ├── ModelSelector.tsx      # Model switcher and auth status
│               │   ├── CommandPalette.tsx     # Cmd+K global command palette
│               │   ├── PlanApproval.tsx       # Plan & Solve proposal approval
│               │   ├── AskQuestionDialog.tsx  # Agent question dialog
│               │   ├── SessionReplayModal.tsx # Session recording replay
│               │   └── graph/                 # Flow diagram visualization powered by @xyflow/react
│               ├── hooks/         # Custom business React Hooks
│               │   ├── useHarnessEvents.ts    # IPC event-bus subscription and state dispatch
│               │   ├── useChatReducer.ts      # Chat and tool state machine
│               │   ├── useProjectManager.ts   # Multi-project and worktree state
│               │   ├── useProjectThreads.ts   # Project session list and switching
│               │   ├── useThreadActions.ts    # Session-level actions (rename/delete/export)
│               │   ├── useThreadModelPermissions.ts # Session-level models and permission policies
│               │   ├── useGitOperations.ts    # Git operations and diff fetching
│               │   ├── useDialogManager.ts    # Modal dialog stack management
│               │   ├── useAuthManager.ts      # Authentication state and credentials
│               │   ├── useMessageQueue.ts     # Outbound message queue
│               │   ├── useTabManager.ts       # Multi-tab management
│               │   └── useKeyboardShortcuts.ts # Global keyboard shortcuts
│               ├── utils/         # Renderer utility functions
│               ├── types/         # Renderer TypeScript type definitions
│               ├── styles/        # Global styles and theme tokens
│               ├── assets/        # Static assets
│               └── __tests__/     # Renderer unit tests
│
├── packages/
│   ├── core/                      # @my-agent/core headless agent engine
│   │   └── src/
│   │       ├── index.ts           # Engine public unified entry point
│   │       ├── client.ts          # Engine client entry
│   │       ├── core/              # Core runtime
│   │       │   ├── agent/         # Agent class and streaming streamText pipeline
│   │       │   ├── controller/    # AgentController scheduling container and Session class
│   │       │   ├── context/       # RequestContext lifecycle context
│   │       │   ├── tools/         # Tool adapters, argument validation and JSON Schema conversion
│   │       │   ├── memory/        # Core Memory abstract class
│   │       │   ├── llm/           # Unified language-model resolution and dynamic wrapping
│   │       │   ├── graph/         # Execution mode graphs (ReAct / Plan & Solve / Fast)
│   │       │   ├── recorder/      # Session recording (JSONL) and offline replay
│   │       │   ├── workspace/     # Workspace resolution and environment abstraction
│   │       │   ├── base/          # Runtime base classes and shared contracts
│   │       │   └── logger/        # Structured logging
│   │       ├── harness/           # Agent assembly and facade proxy layer
│   │       │   ├── index.ts       # createMyAgent / adapter assembly and HarnessProxy
│   │       │   ├── instructions.ts    # Dynamic system-prompt assembly
│   │       │   ├── model-resolver.ts  # Model resolution and credential binding
│   │       │   ├── subagents.ts       # Default subagents assembly
│   │       │   ├── tools.ts           # Dynamic tool assembly and per-mode filtering
│   │       │   ├── thinking.ts        # Reasoning-chain parsing and tag filtering
│   │       │   ├── settings.ts        # Workspace and user settings persistence
│   │       │   ├── state.ts           # Session state-machine types and schema
│   │       │   ├── workspace.ts       # Harness-side workspace context
│   │       │   └── project-purge.ts   # Project data purging
│   │       ├── agents/            # Tiered subagent definitions (explore / plan / execute)
│   │       ├── prompts/           # System prompt set (base / build / plan / fast)
│   │       ├── tools/             # Host extension tool implementations
│   │       │   ├── shell.ts                   # execute_command
│   │       │   ├── file-view.ts               # view
│   │       │   ├── write.ts                   # write_file
│   │       │   ├── file-editor.ts             # Precision text editing
│   │       │   ├── grep.ts                    # search_content
│   │       │   ├── glob.ts                    # find_files
│   │       │   ├── string-replace-lsp.ts      # string_replace_lsp
│   │       │   ├── ast-smart-edit.ts          # ast_smart_edit
│   │       │   ├── subagent.ts                # Subagent spawning tool
│   │       │   ├── submit-plan.ts             # submit_plan proposal submission
│   │       │   ├── request-sandbox-access.ts  # request_sandbox_access dynamic elevation
│   │       │   ├── navigate-browser.ts        # Browser navigation and extraction
│   │       │   ├── computer-use.ts            # Headless browser vision interaction
│   │       │   ├── web-search.ts              # Live web search (Tavily)
│   │       │   ├── wrap-with-confirmation.ts  # Tool confirmation wrapper
│   │       │   └── utils.ts                   # Path sandbox enforcement and write locks
│   │       ├── store/             # Native serverless SQLite storage (LibSQL / node:sqlite)
│   │       │   ├── store.ts       # SQLiteStore main class (WAL mode)
│   │       │   ├── memory-store.ts    # Thread/message and observational memory persistence
│   │       │   ├── migrations.ts      # Versioned migrations
│   │       │   ├── schema.ts          # DDL schemas and indexes
│   │       │   ├── types.ts           # Storage configuration and domain interfaces
│   │       │   └── index.ts
│   │       ├── memory/            # Observational memory module
│   │       │   ├── memory.ts      # Message CRUD, session restoration, OM prompt injection
│   │       │   ├── token-counter.ts   # Heuristic token estimation
│   │       │   └── types.ts
│   │       ├── mcp/               # MCP client and management (Stdio / SSE)
│   │       ├── lsp/               # LSP client, process management and TS/JS adapter
│   │       ├── browser/           # Playwright BrowserManager
│   │       ├── hooks/             # Project extension hooks (HookManager / phase automation)
│   │       ├── acp/               # Agent Client Protocol terminal management and event bus
│   │       ├── auth/              # Credential storage and OAuth PKCE adapters
│   │       ├── snapshot/          # Git task snapshots and task changes persistence
│   │       ├── providers/         # Model provider adapters
│   │       ├── ipc/               # Engine-side IPC contracts and event definitions
│   │       ├── constants/         # Global constants
│   │       ├── utils/             # Project detection, path safety, token estimation, instruction loader
│   │       └── permissions.ts     # Tool permission classification policies (read / edit / execute / mcp / YOLO)
│   │
│   ├── a2a/                       # @my-agent/a2a protocol service and client
│   │   ├── bin/a2a-server.js      # my-agent-a2a executable entry
│   │   ├── src/server/http-server.ts  # createA2ARequestHandler / startA2AServer / A2AServer
│   │   ├── src/server/router.ts       # JSON-RPC routing (projects / threads / tasks / approvals)
│   │   ├── src/server/sse.ts          # SSE streaming event push
│   │   ├── src/server/cors.ts         # CORS policies
│   │   ├── src/client/client.ts       # A2A client
│   │   └── tests/                     # Protocol tests
│   │
│   └── cli/                       # @my-agent/cli command-line interface and local daemon
│       ├── bin/my-agent.js        # my-agent executable entry
│       ├── src/cli.ts             # Argument parsing and command registration
│       ├── src/daemon.ts          # Daemon: daemon.json disk persistence + A2A hosting
│       ├── src/client-runner.ts   # Client command runner
│       ├── src/commands/          # serve / run / chat / project / thread / status
│       └── tests/                 # CLI and daemon tests
│
├── scripts/                       # Build and release scripts (build-dispatch / build-local / update-readme-release)
├── resources/                     # App icons and packaging resources
├── docs/                          # Supplementary documentation
├── electron.vite.config.ts        # Electron 3-process build configuration
├── tsconfig.base.json             # Cross-package shared TS configuration
└── vitest.config.ts               # Unified test configuration
```

**Package Dependency Direction** (one-way downward, acyclic):

```mermaid
flowchart LR
    desktop["apps/desktop"] --> core["packages/core<br/>@my-agent/core"]
    desktop --> a2a["packages/a2a<br/>@my-agent/a2a"]
    cli["packages/cli<br/>@my-agent/cli"] --> core
    cli --> a2a
    a2a --> core
```

- `packages/core` does not depend on any Electron / DOM APIs, running in pure Node environments — a prerequisite for CLI and A2A services to share the same engine.
- `packages/a2a` only depends on `core`, agnostic to desktop GUI; both desktop and CLI expose the same JSON-RPC session capabilities through it.
- `packages/cli` depends on `core` and `a2a`, acting both as a CLI entry and daemon host.
- `apps/desktop` depends on `core` and `a2a`, serving as the sole GUI consumer.

<!-- This document is continuously maintained; in case of discrepancy with the code, the code takes precedence. -->
