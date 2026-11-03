# My Agent Monorepo & A2A 架构规约与编码任务书 (WorkBuddy Handover)

> **面向协作 Agent (WorkBuddy)** 的架构蓝图、模块边界与编码任务清单。  
> 当前特性分支：`feat/monorepo-a2a`  
> 状态：基础架构隔离与骨架搭建完毕，`@my-agent/core`（255个单测全通）、`@my-agent/a2a`（12个单测全通）、`@my-agent/cli`（5个单测全通）均已通过 TypeScript 类型检查。

---

## 1. 整体系统分层架构

```
                     ┌────────────────────────────────────────┐
                     │   External Agents (Codex, Claude, etc)  │
                     └───────────────────┬────────────────────┘
                                         │ A2A Protocol (JSON-RPC / SSE)
                                         ▼
┌──────────────────┐           ┌────────────────────┐
│   CLI Terminal   │◄─────────►│    packages/a2a    │
│  (packages/cli)  │           │   (A2A Protocol)   │
└────────┬─────────┘           └─────────┬──────────┘
         │                               │
         │       Local RPC / In-Process  │
         └───────────────┬───────────────┘
                         ▼
           ┌───────────────────────────┐
           │       packages/core       │◄─── 唯一权威内核 (Single Source of Truth)
           │    (Headless Agent Core)  │      - 状态机 / Session / Thread
           └─────────────┬─────────────┘      - Git Task 快照 / 工具审批
                         │
                         │ Event Bus (harness:event)
                         ▼
           ┌───────────────────────────┐
           │       apps/desktop        │
           │    (Electron + React UI)  │◄─── 纯表现层 (Presentation Layer)
           └───────────────────────────┘
```

---

## 2. 严格的边界与依赖规则 (Boundary Rules)

1. **`packages/core` (`@my-agent/core`)**:
   - **职责**：纯净无头 Agent 核心引擎，包含 LLM 编排、Memory、SQLiteStore、Tools、LSP、MCP、Prompt、Git 快照回滚。
   - **红线**：**严禁依赖任何 Electron、DOM 或 CLI 模块**，保证能够在 Node.js 后台、CLI 或云端服务器中独立运行。
2. **`packages/a2a` (`@my-agent/a2a`)**:
   - **职责**：A2A (Agent-to-Agent) 协议服务端与客户端，提供 `/.well-known/agent-card.json`、`/a2a` (JSON-RPC 2.0) 和 `/a2a/stream` (SSE)。
   - **红线**：仅依赖 `@my-agent/core`，**严禁引入 UI 表现层或 Electron 依赖**。
3. **`packages/cli` (`@my-agent/cli`)**:
   - **职责**：命令行交互入口与本地守护进程（Daemon）。提供 `my-agent serve`、`my-agent run`、`project`、`thread`、`status` 命令。
   - **红线**：所有针对项目的操作优先接入已运行的 Daemon，未运行时自动退化为 in-process 执行。
4. **`apps/desktop` (Electron GUI)**:
   - **职责**：桌面端表现层与本地窗口管理。
   - **红线**：**Electron 绝不调用 A2A**。无论操作来自 Desktop UI、CLI 还是外部 A2A Agent，底层均经由 Core Harness 处理，并统一通过 `harness:event` 事件总线实时推送到 React 界面。

---

## 3. WorkBuddy 核心编码任务列表 (Tasks)

### Task 1: 完善 `packages/cli` 交互式聊天终端 (`my-agent chat`)

- **目标**：在 `packages/cli/src/commands/chat.ts` 中实现交互式终端会话（REPL）。
- **要求**：
  - 启动后检查 Daemon 是否运行；若运行则通过 `A2AClient` 保持 SSE 长连接；
  - 实时将 Agent 的思考过程与文本增量流式打字输出到终端；
  - 遇到需要审批的工具调用时，在终端提示 `[y/N]` 确认并回传 approval。

### Task 2: 增强 `packages/a2a` 安全性与配置

- **目标**：为 A2A HTTP Server 增加可选鉴权与跨域配置。
- **文件**：`packages/a2a/src/server/http-server.ts`
- **要求**：
  - 支持配置 `apiKey` / `bearerToken`；
  - 若开启鉴权，在请求头比对 `Authorization: Bearer <token>`，失败返回 HTTP 401；
  - 添加单元测试覆盖鉴权成功与失败分支。

### Task 3: 编写外部 Agent 注册适配器 (`docs/a2a-integration.md`)

- **目标**：编写与 OpenAI Codex / Claude Code / Cursor 连接的配置示例与自动探测脚本。
- **说明**：说明外部 Agent 如何在本地检测 `http://127.0.0.1:3888/.well-known/agent-card.json` 并调用 A2A 协议控制本 Agent。

### Task 4: 桌面端表现层最终解耦 (`apps/desktop`)

- **目标**：确保根目录下 `src/renderer` 与 `src/electron` 完全平滑过渡到 `apps/desktop`，并且现有测试与打包命令 `npm run build`、`npm run typecheck` 始终 100% 保持绿色通过。

---

## 4. 常用验证命令

```bash
# 验证各个包的类型检查
npm run typecheck
npx tsc -p packages/core/tsconfig.json --noEmit
npx tsc -p packages/a2a/tsconfig.json --noEmit
npx tsc -p packages/cli/tsconfig.json --noEmit

# 运行单元测试
npx vitest run packages/a2a
npx vitest run packages/cli
npx vitest run packages/core

# 构建桌面应用
npm run build
```
