# My Agent 项目架构与模块实现说明

<div align="center">

**简体中文** ｜ [English](README_EN.md)

</div>

本项目是一个基于 **Electron**、**React** 构建的桌面级智能编码助手。项目采用多进程解耦架构，结合现代自主 Agent 的 ReAct 循环与观察性记忆机制，支持多工作区会话隔离、工具流式执行与多面板 IDE 协同交互。

<!-- FEEDBACK_BADGES_START — 与 src/utils/feedback.ts 的 FEEDBACK_BADGES 保持一致 -->

<div align="center">

![Helpful](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fabacus.jasoncameron.dev%2Fget%2Fkidyfirst%2Fmy-agent-likes&query=%24.value&label=likes&color=FF8C42&style=flat&cacheSeconds=300)
![Bad response](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fabacus.jasoncameron.dev%2Fget%2Fkidyfirst%2Fmy-agent-bad&query=%24.value&label=bad%20response&color=6b7280&style=flat&cacheSeconds=300)

<sub>每条回复下方都有 复制 · 👍 Helpful · 👎 Bad response。点赞是匿名的：不登录、不落库、不上报身份，只让上面两个公开计数器 +1；重启应用后高亮消失，只留下总数。</sub>

</div>

<!-- FEEDBACK_BADGES_END -->

---

<!-- LATEST_RELEASE_START -->

## 📥 客户端下载与版本日志 (ChangeLog)

<div align="center">

[![Latest Release](https://img.shields.io/github/v/release/kidyfirst/my-agent?color=blue&label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC%20Latest&logo=github)](https://github.com/kidyfirst/my-agent/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/kidyfirst/my-agent/total?color=success&label=%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F%20Downloads)](https://github.com/kidyfirst/my-agent/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#全平台客户端下载)
[![ChangeLog](https://img.shields.io/badge/ChangeLog-%E7%89%88%E6%9C%AC%E6%97%A5%E5%BF%97-blueviolet)](https://kidyfirst.github.io/my-agent/changelog.html)

**当前最新稳定版本：`v0.1.2`**  
🌐 **[访问官方在线下载站 (GitHub Pages)](https://kidyfirst.github.io/my-agent/)** ｜ 📋 **[查看版本更新日志 (ChangeLog)](https://kidyfirst.github.io/my-agent/changelog.html)** ｜ 📦 **[GitHub Releases 资产归档](https://github.com/kidyfirst/my-agent/releases)**

</div>

### 全平台客户端下载

| 操作系统 / 平台 | 架构 / 适用机型                       | 安装包格式           | 直接下载链接 (v0.1.2)                                                                                                                       | 说明                      |
| :-------------- | :------------------------------------ | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------ |
| 🍏 **macOS**    | **Apple Silicon** (M1 / M2 / M3 / M4) | `.dmg` 安装镜像      | [my-agent-0.1.2-mac-arm64.dmg](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-mac-arm64.dmg)                 | 推荐 Mac 用户首选         |
| 🍏 **macOS**    | **Apple Silicon** (M1 / M2 / M3 / M4) | `.zip` 免安装包      | [my-agent-0.1.2-mac-arm64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-mac-arm64.zip)                 | 解压即用                  |
| 🍏 **macOS**    | **Intel x86_64** 芯片                 | `.dmg` 安装镜像      | [my-agent-0.1.2-mac-x64.dmg](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-mac-x64.dmg)                     | 适配 Intel 架构 Mac       |
| 🍏 **macOS**    | **Intel x86_64** 芯片                 | `.zip` 免安装包      | [my-agent-0.1.2-mac-x64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-mac-x64.zip)                     | 解压即用                  |
| 🪟 **Windows**  | **Windows 10 / 11** (64 位)           | `.exe` 安装程序      | [my-agent-0.1.2-win-x64.exe](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-win-x64.exe)                     | NSIS 引导向导安装         |
| 🪟 **Windows**  | **Windows 10 / 11** (64 位)           | `.zip` 免安装便携版  | [my-agent-0.1.2-win-x64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-win-x64.zip)                     | 解压即可直接运行          |
| 🐧 **Linux**    | **Linux x86_64** (通用)               | `.AppImage` 便携镜像 | [my-agent-0.1.2-linux-x86_64.AppImage](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-linux-x86_64.AppImage) | `chmod +x` 后直接双击执行 |
| 🐧 **Linux**    | **Debian / Ubuntu / Deepin**          | `.deb` 系统软件包    | [my-agent-0.1.2-linux-amd64.deb](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-linux-amd64.deb)             | `sudo dpkg -i` 系统级安装 |
| 🐧 **Linux**    | **Linux x86_64** (免安装)             | `.zip` 压缩归档包    | [my-agent-0.1.2-linux-x64.zip](https://github.com/kidyfirst/my-agent/releases/download/v0.1.2/my-agent-0.1.2-linux-x64.zip)                 | 适用于无 root 环境        |

> [!IMPORTANT]
> **macOS 首次打开提示“已损坏 / 无法验证开发者”处理方法：**  
> 由于开源社区版本未购买苹果商业开发者签名证书，macOS Gatekeeper 安全机制在从浏览器下载应用后会附带隔离属性。若首次打开提示“已损坏，应移到废纸篓”或“无法打开”，只需在终端执行一次以下命令解除隔离即可正常打开：
>
> ```bash
> xattr -cr "/Applications/My Agent.app"
> ```
>
> 或在系统设置中授权：**【系统设置】->【隐私与安全性】-> 下滑找到并点击【仍要打开】**。

> [!TIP]
>
> - 完整更新履历与历史版本详情请参阅 👉 **[在线 ChangeLog 日志](https://kidyfirst.github.io/my-agent/changelog.html)** 或 **[GitHub Releases 全部发布归档](https://github.com/kidyfirst/my-agent/releases)**。

---

<!-- LATEST_RELEASE_END -->

<!-- TIP_JAR_START — 二维码就是 src/renderer/assets/alipay-qr.png，同一份文件，别再放副本 -->

## ☕ 打赏猫球

<div align="center">

如果你觉得项目对你有帮助，打赏猫球吧 🐱

<img src="src/renderer/assets/alipay-qr.png" width="200" alt="支付宝收款二维码" />

<sub>支付宝扫一扫 · 金额随意，不打赏也一样好用</sub>

</div>

<!-- TIP_JAR_END -->

---

## 目录

- [My Agent 项目架构与模块实现说明](#my-agent-项目架构与模块实现说明)
  - [📥 客户端下载与版本日志 (ChangeLog)](#-客户端下载与版本日志-changelog)
    - [全平台客户端下载](#全平台客户端下载)
  - [☕ 打赏猫球](#-打赏猫球)
  - [目录](#目录)
  - [1. 整体架构设计](#1-整体架构设计)
    - [核心设计原则](#核心设计原则)
  - [2. 进程划分与通信机制](#2-进程划分与通信机制)
  - [3. 核心模块实现说明](#3-核心模块实现说明)
    - [3.1 主进程层 (`src/electron/`)](#31-主进程层-srcelectron)
    - [3.2 预加载与桥接层 (`src/electron/preload.ts`)](#32-预加载与桥接层-srcelectronpreloadts)
    - [3.3 渲染进程 UI 层 (`src/renderer/`)](#33-渲染进程-ui-层-srcrenderer)
      - [3.3.1 ChatView 渲染管线](#331-chatview-渲染管线)
      - [3.3.2 运行中与已结束两种展示形态](#332-运行中与已结束两种展示形态)
      - [3.3.3 用户消息吸顶与折叠](#333-用户消息吸顶与折叠)
      - [3.3.4 变更文件卡片与子智能体卡片](#334-变更文件卡片与子智能体卡片)
      - [3.3.5 滚动、空态与层叠](#335-滚动空态与层叠)
    - [3.4 Agent 运行与能力层 (智能体引擎 / `src/tools/`)](#34-agent-运行与能力层-智能体引擎--srctools)
      - [3.4.1 核心运行时对象体系 (Harness / HarnessProxy / ActiveSession / Agent)](#341-核心运行时对象体系-harness--harnessproxy--activesession--agent)
        - [1. 四大核心实体的职责边界与类定义契约](#1-四大核心实体的职责边界与类定义契约)
        - [2. 核心类与接口定义结构](#2-核心类与接口定义结构)
          - [(1) `Agent` 类定义（\[`src/core/agent/agent.ts`\](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/agent/agent.ts)）](#1-agent-类定义srccoreagentagenttsfileuserstimlyugitcodegithubmastra-code-uisrccoreagentagentts)
          - [(2) `Harness` / `AgentController` 类定义（\[`src/core/controller/controller.ts`\](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts)）](#2-harness--agentcontroller-类定义srccorecontrollercontrollertsfileuserstimlyugitcodegithubmastra-code-uisrccorecontrollercontrollerts)
          - [(3) `ActiveSession` (`Session<TState>`) 类定义（\[`src/core/controller/controller.ts:296`\](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts#L296)）](#3-activesession-sessiontstate-类定义srccorecontrollercontrollerts296fileuserstimlyugitcodegithubmastra-code-uisrccorecontrollercontrollertsl296)
          - [(4) `HarnessProxy` 与 `adapter` 门面（\[`src/harness/index.ts`\](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/harness/index.ts)）](#4-harnessproxy-与-adapter-门面srcharnessindextsfileuserstimlyugitcodegithubmastra-code-uisrcharnessindexts)
        - [3. 为什么要在 `adapter` 外包裹一层 `Proxy`？](#3-为什么要在-adapter-外包裹一层-proxy)
      - [3.4.2 存储引擎与数据库持久化](#342-存储引擎与数据库持久化)
      - [3.4.3 观察性记忆 (Observational Memory)](#343-观察性记忆-observational-memory)
      - [3.4.4 Agent ReAct 循环机制与工具流](#344-agent-react-循环机制与工具流)
      - [3.4.5 扩展工具生态与沙箱安全 (`src/tools/`, `src/lsp/`, `src/browser/`)](#345-扩展工具生态与沙箱安全-srctools-srclsp-srcbrowser)
      - [3.4.6 分级子智能体 (Subagents)](#346-分级子智能体-subagents)
      - [3.4.7 执行模式与图调度 (`src/core/graph/`)](#347-执行模式与图调度-srccoregraph)
      - [3.4.8 会话录制与离线回放 (`src/core/recorder/`)](#348-会话录制与离线回放-srccorerecorder)
    - [3.5 Memory 记忆模块 (`src/memory/`)](#35-memory-记忆模块-srcmemory)
      - [3.5.1 类继承关系与职责边界](#351-类继承关系与职责边界)
      - [3.5.2 存储域适配与线程/消息 CRUD](#352-存储域适配与线程消息-crud)
      - [3.5.3 Observational Memory 参数与触发阈值](#353-observational-memory-参数与触发阈值)
      - [3.5.4 动态 Memory 工厂与模型热切换](#354-动态-memory-工厂与模型热切换)
      - [3.5.5 分词估算与 Working Memory 空实现](#355-分词估算与-working-memory-空实现)
      - [3.5.6 配置入口与测试覆盖](#356-配置入口与测试覆盖)
  - [4. 核心业务与数据流时序](#4-核心业务与数据流时序)
    - [4.1 用户消息、思考链与执行块流式时序](#41-用户消息思考链与执行块流式时序)
    - [4.2 工具调用审批与人机协同流程](#42-工具调用审批与人机协同流程)
    - [4.3 Git Worktree 多会话隔离机制](#43-git-worktree-多会话隔离机制)
  - [5. 源码目录结构映射](#5-源码目录结构映射)

---

## 1. 整体架构设计

项目采用典型的 **四层分层架构**，由上至下分别为 **UI 渲染表现层**、**安全桥接层**、**主进程调度层** 以及 **Agent 运行时引擎**：

```mermaid
flowchart TD
    subgraph UI ["1. 渲染表现层 (Renderer Process - React 19 + Vite)"]
        ChatView["Chat 对话 / 思考链展示"]
        Panels["IDE 多面板 (Terminal, FileTree, DiffEditor)"]
        Hooks["状态与事件 Hooks (useHarnessEvents, useChatReducer)"]
    end

    subgraph Bridge ["2. 安全桥接层 (Preload Script)"]
        ContextBridge["contextBridge.exposeInMainWorld('api', ...)"]
        IPCTunnel["双向通道 (harness:command / harness:event)"]
    end

    subgraph Main ["3. 主进程调度层 (Electron Main Process)"]
        WindowMgr["窗口与生命周期 (main.ts)"]
        IPCRegistry["IPC 分发中心 (src/electron/ipc/)"]
        SessionMgr["WorktreeSession / ElectronState (多工作区分离)"]
        PtyService["node-pty 终端服务"]
        PermService["权限策略引擎 (permissions.ts)"]
    end

    subgraph AgentRuntime ["4. Agent 运行与能力引擎 (智能体引擎 / MyAgent Core)"]
        Harness["Harness 编排与事件总线"]
        ModeGraph["执行模式图调度 (ReAct / Plan & Solve / Fast)"]
        ReActLoop["Agent ReAct 自主循环 (maxSteps: 1000)"]
        MemoryOM["Observational Memory (观察与反思动态压缩)"]
        StorageEngine["LibSQL / SQLite 数据库存储"]
        ToolRegistry["核心工具集 (File, Grep, LSP, Playwright, MCP)"]
        SubagentEngine["分层子智能体 (explore, plan, execute)"]
        Recorder["录制 / 回放引擎 (JSONL, ReplayLanguageModel)"]
    end

    Hooks <--> |"window.api 上下文隔离"| ContextBridge
    IPCTunnel <--> |"IPC 双向消息通道"| IPCRegistry
    IPCRegistry <--> |"Harness 调度与事件总线"| Harness
    Harness --> ModeGraph
    ModeGraph --> ReActLoop
    Harness --> Recorder
```

### 核心设计原则

1. **严格的进程隔离（Context Isolation）**：渲染进程不直接接触 Node.js 原生 API 与敏感系统调用，所有能力通过 `preload.ts` 的白名单通道暴露。
2. **多 Worktree 会话隔离（Session Isolation）**：针对同一仓库的多个 Git 分支/工作区（Worktree），主进程分别实例化独立的 `WorktreeSession` 与 `Harness` 实例，保证会话、终端与状态互不干扰。
3. **自主 ReAct 循环而非静态工作流**：摒弃死板的 DAG 工作流，依托 LLM 的推理-行动循环（Think $\to$ Tool Call $\to$ Observe $\to$ Loop），实现灵活的代码检索、规划与改写。
4. **长上下文动态记忆压缩（Observational Memory）**：内置观察者与反思者模型，动态压缩长对话中的大量工具调用日志，防止上下文超出模型限制。
5. **模式即执行图（Mode as Graph）**：ReAct / Plan & Solve / Fast 三套执行模式分别对应独立的图定义，切模式即换整张调度图与工具集，而非只改提示词。
6. **可录制、可回放（Record & Replay）**：每次运行可落盘为紧凑 JSONL，回放时不触网、不落盘改动，配合运行时快照完整还原当时的模型、模式与权限上下文。

---

## 2. 进程划分与通信机制

Electron 体系中进程通信采用强类型的 IPC 约定：

| 通信通道                | 方向                  | 传输协议                            | 功能说明                                                                 |
| :---------------------- | :-------------------- | :---------------------------------- | :----------------------------------------------------------------------- |
| `harness:command`       | 渲染进程 $\to$ 主进程 | `ipcRenderer.invoke` (双向 Promise) | 前端发送命令，如发送消息、切换模型、切换模式、操作终端、保存设置等       |
| `harness:event`         | 主进程 $\to$ 渲染进程 | `webContents.send` (单向广播)       | 主进程向前端实时推送流式事件（消息流、思考链、工具执行、任务进度、通知） |
| `login:prompt-response` | 渲染进程 $\to$ 主进程 | `ipcRenderer.send` (单向)           | OAuth 登录弹窗/验证响应回调                                              |
| `set-badge-count`       | 渲染进程 $\to$ 主进程 | `ipcRenderer.send` (单向)           | 设置 macOS Dock 栏未读消息徽标                                           |
| `open-url`              | 主进程 $\to$ 渲染进程 | `webContents.send` (单向)           | 拦截外部链接并在应用内置浏览器面板打开                                   |

---

## 3. 核心模块实现说明

### 3.1 主进程层 (`src/electron/`)

主进程负责操作系统的原生能力对接、窗口管理、会话生命周期维护与安全分发。

- **窗口控制与入口 (`src/electron/main.ts`)**
  - 调用 `createWindow()` 实例化主窗口，配置 `webPreferences`（关闭 `nodeIntegration`，启用 `contextIsolation` 与 `preload`）。
  - 区分环境加载：开发环境读取 `process.env.ELECTRON_RENDERER_URL`（连接 Vite 开发服务器支持热更新）；生产环境通过 `mainWindow.loadFile` 加载打包后的 `dist/renderer/index.html`。
  - 注册应用全局菜单、macOS Dock 图标、外部链接拦截。
- **IPC 命令调度中心 (`src/electron/ipc/`)**
  主进程采用模块化 Handler 设计，在 `src/electron/ipc/index.ts` 中统合分发：
  - `harness-handlers.ts`：处理对话消息（`sendMessage`）、任务中断（`abort`）、用户插话（`steer`）、追加任务（`followUp`）、模式/模型切换。
  - `project-handlers.ts`：项目探测、工作区打开、Git Worktree 会话生命周期管理与多工程切换。
  - `permission-handlers.ts`：工具调用审批拦截（同意、拒绝、按类别永久放行）与人机交互问题应答（`ask_question` / `plan_approval`）。
  - `pty-handlers.ts`：基于 `node-pty` 实现底层伪终端实例的创建、标准输入输出流中继与终端窗口尺寸重置（Resize）。
  - `git-handlers.ts`：处理本地 Git 仓库状态检查、Diff 生成、分支拉取与切换。
  - `file-handlers.ts`：为前端编辑器面板提供受控的本地文件读取服务。
  - `mcp-handlers.ts`：管理 Model Context Protocol（MCP）服务器连接、状态监控与外部工具重载。
  - `settings-handlers.ts`：配置持久化（Thinking 深度等级、通知模式、AST 智能编辑开关等）。
  - `integration-handlers.ts`：负责 Linear 与 GitHub 双向集成（工单拉取、关联提交、状态联动）。
  - `auth-handlers.ts`：Anthropic 及 OpenAI OAuth 鉴权流程控制。
  - `dashboard-handlers.ts`：汇总跨会话的 Token 消耗、执行耗时与任务指标。
- **状态隔离与集成上下文 (`src/electron/electron-state.ts`)**
  - 为每个工作区路径维护一份 `ElectronState`，持久化记录关联的 Linear 任务 ID、GitHub PR 链接及专属凭证。
- **系统原生通知 (`src/electron/notifications.ts`)**
  - 当主窗口处于非聚焦（后台）状态时，若 Agent 任务完成或需要人工审批，调用系统原生通知与声效提示。

### 3.2 预加载与桥接层 (`src/electron/preload.ts`)

`preload.ts` 在页面 DOM 加载前执行，依托 `contextBridge` 为网页注入安全的 `window.api` 命名空间：

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

配合 `src/renderer/types/ipc.ts` 中的 `declare global { interface Window { api: ElectronAPI } }`，实现全链路的 TypeScript 静态类型推断与代码自动补全。

### 3.3 渲染进程 UI 层 (`src/renderer/`)

基于 **React 19** + **Vite** 构建的高性能 IDE 级界面，采用单向数据流与响应式订阅驱动：

- **渲染挂载入口 (`src/renderer/index.html` & `main.tsx`)**
  - `index.html` 提供 `#root` 挂载点，引入 ES Module `main.tsx`，将根组件 `<App />` 渲染到 DOM。
- **事件消费与状态机 (`src/renderer/hooks/useHarnessEvents.ts` & `src/renderer/types/chat.ts`)**
  - 订阅 `window.api.onEvent`，拦截主进程推送的 Agent 运行时事件。
  - 通过 `useChatReducer` 状态机处理动作：
    - `AGENT_START` / `AGENT_END`：标记全局运行态与加载光标。
    - `MESSAGE_START` / `MESSAGE_UPDATE` / `MESSAGE_END`：流式累加 Token 并实时更新对应消息块。
    - `TOOL_START` / `TOOL_UPDATE` / `TOOL_END`：更新工具调用入参与返回结果。
- **会话消息渲染组件族 (`src/renderer/components/`)**
  - `ChatView.tsx`：会话渲染管线，负责把 `messages` 归并为「用户消息 / 执行块 / 助手回复 / 子智能体 / 系统提示」五类渲染项，并把同一轮的多段工具调用折叠成一个执行块。
  - `AssistantMessage.tsx`：助手正文渲染，`text` 块走 `react-markdown` 富文本 + 代码高亮，每个代码块带独立复制按钮。
  - `ExecutionBlock.tsx`：执行块（思维链 + 工具调用）的统一展示组件，运行中与已结束两种形态见 [3.3.2](#332-运行中与已结束两种展示形态)。
  - `UserMessage.tsx`：用户消息气泡，支持吸顶、超长折叠、图片预览与一键复制。
  - `FilesChangedBar.tsx` / `SubagentExecution.tsx` / `TodoProgress.tsx`：变更文件卡片、子智能体执行卡片与任务进度条。
- **IDE 多面板组件生态**
  - `TerminalPanel.tsx`：基于 `@xterm/xterm` 与 `@xterm/addon-fit` 实现的高性能 ANSI 终端仿真器。
  - `FileTree.tsx` / `FileEditor.tsx` / `DiffEditor.tsx`：文件树浏览、代码高亮查看与 Git 变更 Side-by-Side 差异对比。
  - `TaskBoard.tsx`：集成 Linear/GitHub 工单看板，支持将 issue 一键绑定当前分支开发。
  - `ToolApprovalDialog.tsx` / `PlanApproval.tsx`：人机交互弹窗，拦截危险操作请求用户确认。

#### 3.3.1 ChatView 渲染管线

`ChatView.tsx` 不直接遍历 `messages` 渲染组件，而是先把消息体归并成渲染项（`RenderItem`），再由一个 `switch` 分发到具体组件。这一过程是串行的多轮 `useMemo` 处理，顺序如下：

1. **轮次时长预处理**：以 `user` / `system` 消息切分轮次，收集本轮内所有 assistant 消息 id 与最后一个非空的 `durationMs`，写入 `turnDurationById`。`agent_end` 只会把耗时写在最后一条 assistant 消息上，靠这张表把耗时还原到「本轮的第一个执行块」。
2. **逐消息解析**：先用 `normalizeMessageContent` 归一化 `content`（Agent 传入的可能是字符串、数组或 `parts`）。`tool_result` 块先建 `toolResultsById` 索引；随后按块类型分派：
   - `text` / `output` / `message`（或无 type 但带 `text` / `content` / `value`）：累积正文；
   - `thinking` / `reasoning` / `thought` / `redactedthinking`：生成思维链步骤，耗时优先取块内 `durationSec`，其次按消息耗时折算，最后按文本长度估算；
   - `toolcall` / `tooluse` / `toolinvocation`：生成工具步骤，`isDone` 由 `state === "result"` 或已存在结果判定，工具定义从 `tools` / `subagents` 映射中查名称与图标。
3. **刷新策略**：遇到正文块或子智能体时调用 `flushExecution()`，把当前累积的步骤落成一个执行块；遇到思维链或工具块时调用 `flushText()`，且**只在正文非空（或尾部为错误）时产出 assistant 项**，因此流式过程中不会出现空气泡。
4. **消息收尾**：消息解析完成后再次 flush，并把 `msg.changedFiles` 挂到本轮最后一条 assistant 项上；若没有任何正文项，则补一个只含文件卡片的 assistant 项。
5. **补漏**：状态机里已出现、但消息体中没有对应块的工具会被补进 `live-execution-block`；未渲染过的子智能体补成独立卡片。
6. **占位**：Agent 运行中且最后一项是用户消息时，插入 `active-execution-placeholder`，让 `Thinking for …` 立刻可见，而不必等第一个工具调用。
7. **收尾归并**：先合并相邻执行块（步骤按 id 去重）、丢弃空且非活跃的块；再做「一轮一个活动块」折叠——游标在 `user` / `system` 项处重置，同一轮后续所有执行块并入第一个块，`isActive` / `startedAt` / `durationMs` / `changedFiles` 取最新值。

第 7 步是「一轮只出现一个 `Worked for …`」的关键：早期实现每个 assistant 消息各带一个执行块，一轮里就会冒出多个标题，现在统一在渲染层折叠。

#### 3.3.2 运行中与已结束两种展示形态

`ExecutionBlock.tsx` 用同一组件承载两种状态，形态由 `isActive` 决定：

- **运行中**：标题为 `Thinking for 12.3s`（或 `1m 20s`），后面带 `(N steps)` 计数与向下箭头；折叠态下方是 82px 高的步骤预览窗，随新步骤自动滚到底，点击标题或预览窗展开全部步骤。
- **已结束**：整轮只留一行 `Worked for 1m 6s ⌄`，步骤默认完全隐藏，点击才展开；若该块没有任何步骤且非活跃，组件直接返回 `null`。
- **耗时来源**：`agent_end` 时写入消息的 `durationMs`；缺失时回退到 3.3.1 的 `turnDurationById`。数据库中没有耗时列，因此 `chatReducer` 的 `SET_MESSAGES` 会保留内存中的旧耗时，并给历史会话补到本轮最后一条 assistant 消息——更早的历史轮次仍可能只显示不带时长的 `Worked`。
- **时长格式**：不足 60 秒显示一位小数（`12.3s`），超过则显示 `Xm Ys`；运行中由 100ms 定时器按 `startedAt` 刷新。

#### 3.3.3 用户消息吸顶与折叠

`UserMessage.tsx` 负责让「当前视口中最新的提问」常驻顶部：

- 未展开时 `position: sticky` + `top: 0` + `zIndex: 20` + 不透明 `var(--bg)` 背景，滚动时停在视口顶端；展开态取消吸顶，恢复普通文档流。
- 内容高度超过阈值（气泡约 80px）时折叠，底部叠 24px 渐变遮罩与 chevron，点击切换展开；若 `window.getSelection()` 显示存在选区则不触发切换，保留「拖选复制」。
- 图片缩略图固定高度 60px、`object-fit: contain`，点击打开 `ImagePreviewModal`；气泡下方是时间戳与复制按钮。
- 布局细节：滚动容器自身不设内边距，内层 800px 列承担 `16px 24px 0`；吸顶容器用负外边距 `-24px` + 等量 padding 把背景铺到列边缘，避免吸顶卡片两侧露出被滚动的正文。

#### 3.3.4 变更文件卡片与子智能体卡片

- **变更文件卡片 (`FilesChangedBar.tsx`)**：`message.changedFiles` 非空时挂在 assistant 消息尾部。头部一行是 `N files changed +X -Y`，点击整行展开；展开后每个文件显示 `basename` + 目录 + 增删行数，`Review` 按钮阻止冒泡并直接打开差异编辑器。行内 diff 懒加载（`getTaskFileDiff`，按 `messageId` 取），`isLive` 表示任务仍在执行。
- **持久化 (`src/electron/task-changes-store.ts`)**：任务结束时的文件列表与 diff 写入 `<appData>/task-changes.json`（thread → message → files/diff，上限 40 个线程 × 80 个任务、单条 diff 200KB），重启后 `getMessages` 会重新挂回 `changedFiles`，删除线程时同步清理。
- **子智能体卡片 (`SubagentExecution.tsx`)**：整行可点，`🏗️` + `Agent` + 任务描述 + 完成耗时 + ✓/✗/运行中脉冲点；展开后展示子智能体内部的工具调用与最终结果。

#### 3.3.5 滚动、空态与层叠

- **自动滚动**：用 `isAutoScroll` 标记是否跟随底部（距底小于 100px 视为跟随），新消息与工具更新时先把 `scrollTop` 置到底部，再在下一帧补滚一次，避免 React 提交时机导致的位置偏差。
- **布局**：外层 `flex: 1` / `overflow-y: auto` / `overflow-x: hidden` / `scrollbar-gutter: stable`，内层 `max-width: 800px; margin: 0 auto; flex: 1 0 auto; min-height: 100%`，底部留 16px 占位。
- **空态与进度**：无渲染项且 Agent 空闲时展示 `AsciiLogo`；存在 `todos` 时在列表底部渲染 `TodoProgress`；`system` 消息渲染为带 `System Notice` 标签的提示块；连续重复的用户消息按文本去重。
- **层叠顺序**：吸顶卡片使用 `zIndex: 20`，所有可能下探到聊天区的浮层必须高于它——`OpenInDropdown` 为 400，编辑器内的模型/权限浮层为 200，命令面板与模态框为 1000 以上。

### 3.4 Agent 运行与能力层 (智能体引擎 / `src/tools/`)

项目通过自主研发的智能体运行时架构装配底层能力，由四大核心实体协同工作，实现模型交互、工具受控调用、多会话隔离与事件流式渲染。

#### 3.4.1 核心运行时对象体系 (Harness / HarnessProxy / ActiveSession / Agent)

在运行时架构中，上层（Electron IPC 处理器与前端 UI）并不直接操作单一复杂的底层类，而是通过一个经过代理包装的统一门面对象（`harness`）与整个系统交互。

```mermaid
graph TD
    Caller["上层调用者 (Electron IPC / UI Handlers)"] -->|调用统一契约接口| HarnessProxy["HarnessProxy (Proxy 实例)<br>src/harness/index.ts<br>统一门面 / 三级动态委托"]

    subgraph FallbackChain ["三级动态委托与属性降级链 (Proxy Fallback Chain)"]
        direction TB
        L1["1. 第一优先级：adapter (高层业务增强适配)<br>• init 上次会话自动恢复<br>• listMessages 双读 SQLite 兜底与耗时对齐<br>• messageQueue 队列读写"]
        L2["2. 第二优先级：activeSession (Session 实例)<br>• sendMessage() 驱动 ReAct 循环<br>• state / mode / model 状态机<br>• permissions 权限与 _pendingApprovals 审批门禁"]
        L3["3. 第三优先级：controller (Harness / AgentController 实例)<br>• 全局配置 / 存储引擎 (storage)<br>• 模式配置 (modes) / 子智能体注册表 (subagents)<br>• 会话工厂 (createSession)"]

        L1 -->|未找到时动态降级| L2
        L2 -->|未找到时动态降级| L3
    end

    HarnessProxy --> FallbackChain
    L2 -->|装配与驱动| AgentCore["Agent (智能体能力核心)<br>src/core/agent/agent.ts<br>• instructions 提示词管理<br>• tools 可用工具注册集<br>• stream() TransformStream 流式执行"]
    L3 -.->|配置注入| AgentCore
```

##### 1. 四大核心实体的职责边界与类定义契约

| 核心实体                                | 源码位置                                                                                                                             | 核心定位与职责                                                                                                                                                                                               |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Agent`**                             | [`src/core/agent/agent.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/agent/agent.ts)                              | **原子智能体能力封装体**。管理 System Instructions、Model 解析、Tools 列表注入与 Memory 关联，提供基础流式生成 `stream()`。                                                                                  |
| **`Harness`** (`AgentController`)       | [`src/core/controller/controller.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts)          | **工作区级调度宿主与 Session 工厂**。持有全局存储（Storage）、持久化记忆（Memory）、模式（Modes）、子智能体注册表（Subagents），负责多 Session 生命周期管理。                                                |
| **`ActiveSession`** (`Session<TState>`) | [`src/core/controller/controller.ts:296`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts#L296) | **有状态的单项目/工作区分支执行实例**。每个项目或 Git Worktree 对应一个独立的 Session。管理响应式状态、当前 Model/Mode、历史 Thread、工具审批门禁（`_pendingApprovals`），并承载主执行入口 `sendMessage()`。 |
| **`HarnessProxy`** (`MyAgentHarness`)   | [`src/harness/index.ts:1096`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/harness/index.ts#L1096)                         | **高级多态门面代理**。通过 ES6 `Proxy` 动态聚合 `adapter`、`activeSession` 和 `controller`，对外提供全功能、动态延迟绑定、零样板转发的统一接口。                                                             |

---

##### 2. 核心类与接口定义结构

###### (1) `Agent` 类定义（[`src/core/agent/agent.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/agent/agent.ts)）

```typescript
export class Agent {
	id: string
	name: string
	description?: string
	instructions?: any // 字符串或返回字符串的动态函数 (args: { requestContext }) => Promise<string>
	model?: any // 语言模型实例或解析函数 (args: { requestContext }) => Promise<LanguageModel>
	tools?: any // 工具映射字典或解析函数 Record<string, Tool>
	memory?: any // 记忆管理模块

	constructor(config: AgentConfig)

	// 获取并解析当前请求上下文的系统提示词
	async getInstructions(args?: {
		requestContext?: RequestContext
	}): Promise<string>
	// 动态获取当前请求上下文使用的语言模型
	async getModel(args?: { requestContext?: RequestContext }): Promise<any>
	// 列出当前所有可用的工具实例
	async listTools(args?: {
		requestContext?: RequestContext
	}): Promise<Record<string, any>>
	// 核心流式执行：调用 Vercel AI SDK 的 streamText，并通过内置 TransformStream 统一规范化输出事件流
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

###### (2) `Harness` / `AgentController` 类定义（[`src/core/controller/controller.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts)）

```typescript
export class AgentController<TState = any> {
	readonly id: string
	readonly agent: Agent // 关联的主 Agent 实例
	readonly storage: any // 全局存储引擎 (SQLite / LibSQL)
	readonly memory?: any // 观察性记忆模块 (OM)
	readonly defaultModeId: string // 默认模式 (如 "build")
	readonly modes: AgentMode[] // 注册的工作模式列表 (build, plan 等)
	readonly subagents: HarnessSubagent[] // 注册的子智能体列表 (explore, plan, execute)
	readonly toolCategoryResolver?: (toolName: string) => string // 工具类别解析器

	constructor(config: HarnessConfig<TState>)

	async init(): Promise<void>
	// 会话工厂：创建或获取对应工作区/资源的独立状态会话
	async createSession(options?: {
		resourceId?: string
	}): Promise<Session<TState>>
	getSession(sessionId: string): Session<TState> | undefined
	listModes(): AgentMode[]
	async listAvailableModels(): Promise<AvailableModelItem[]>
}
```

###### (3) `ActiveSession` (`Session<TState>`) 类定义（[`src/core/controller/controller.ts:296`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/core/controller/controller.ts#L296)）

```typescript
export class Session<TState = any> {
	readonly id: string
	readonly resourceId: string
	readonly controller: AgentController<TState>

	// 状态机与环境配置访问器
	readonly state: {
		get: () => TState
		set: (patch: Partial<TState>) => Promise<void>
	}
	readonly mode: {
		get: () => string
		switch: (opts: { modeId: string }) => Promise<void>
	}
	readonly model: { get: () => any; switch: (modelId: string) => Promise<void> }

	// 历史会话管理
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

	// 权限门禁与人机审批控制
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

	// 核心任务驱动：装配工具、注入审批拦截、驱动 streamText 循环并广播事件
	async sendMessage(options: SendMessageOptions): Promise<void>
	// 异步中断正在运行的任务与进程组
	async abort(): Promise<void>
	// 响应工具调用的人工审批 (Approve / Decline)
	respondToToolApproval(opts: {
		decision?: "approve" | "decline"
		toolCallId: string
	}): void
	// 订阅当前会话发出的全量生命周期事件 (tool_start, tool_end, message_delta 等)
	subscribe(listener: (event: HarnessEvent) => void): () => void
}
```

###### (4) `HarnessProxy` 与 `adapter` 门面（[`src/harness/index.ts`](file:///Users/timlyu/gitcode/github/mastra-code-ui/src/harness/index.ts)）

```typescript
// 1. adapter: 在会话之上封装高阶业务逻辑与存储兜底
const adapter: MyAgentHarness = {
    id: "myagent-code",
    controller,
    get activeSession() { return activeSession },
    async init() {
        await controller.init()
        const session = activeSession ?? (await sessionReady)
        await session.init?.()
        // 自动恢复上次打开的项目会话 Thread
        ...
    },
    async listMessages(options) {
        // 先读内存 session，随后双查 SQLite 存储补齐精确的执行耗时 durationMs
        ...
    },
    ...
}

// 2. harness: 基于 Proxy 构造三级动态查找链
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

##### 3. 为什么要在 `adapter` 外包裹一层 `Proxy`？

使用 `Proxy` 带来了四个不可替代的核心架构价值：

1. **解决 `activeSession` 异步延迟挂载的时序问题（Late-bound Dynamic Reference）**：
   在 `createMyAgent()` 初始化执行时，`activeSession` 依赖 `controller.createSession(...)` 异步 Promise 创建。若使用传统静态拷贝（如 `Object.assign`），在函数返回瞬间 `activeSession` 依然是 `null`，挂在它上面的方法会全量丢失；而 Proxy 在**属性被访问的瞬间动态求值**，一旦异步创建完毕，外部立刻能够透明访问。
2. **零样板转发（Zero-Boilerplate Delegation）**：
   `Session` 与 `AgentController` 包含了大量的内部方法与深层状态（如 `permissions`, `thread`, `om` 记忆, `storage` 等）。若不使用 Proxy，开发者就必须在 `adapter` 对象上手工手写数十个千篇一律的转发函数（`foo(...args) { return this.activeSession.foo(...args); }`），维护成本极高；通过 Proxy 实现了全量 API 的**透明自动降级委托**。
3. **保证 `this` 上下文绑定（Execution Context Binding）**：
   在属性访问时，Proxy 自动针对函数执行 `.bind(activeSession)` 或 `.bind(controller)`，确保底层方法执行时其内部的 `this` 永远指向原始实例本身，杜绝因上下文丢失导致访问内部私有属性（如 `this._state`, `this._pendingApprovals`）抛出 `TypeError: Cannot read properties of undefined`。
4. **高层业务覆盖优先（Override & Enrichment）**：
   Proxy 优先判断 `if (prop in target)`，这使得 `adapter` 能够精准重写关键业务方法（例如 `listMessages` 的 SQLite 补充查询兜底、`init` 的记忆恢复），未重写的方法则无缝透传到底层实现。

---

#### 3.4.2 存储引擎与数据库持久化

默认自动初始化嵌入式 LibSQL（SQLite）数据库，路径位于系统 AppData 目录，实现 Thread 历史记录、消息列表、Token 用量的本地零配置持久化。

#### 3.4.3 观察性记忆 (Observational Memory)

解决长时间编码对话中上下文窗口爆炸的痛点：

- **Observer 模型**：定期扫描会话中的工具输入与输出，抽取摘要观察记录。
- **Reflector 模型**：对高频事实与架构共识进行反思与提炼，动态维护长期记忆上下文。
- 具体实现见 [3.5 Memory 记忆模块](#35-memory-记忆模块-srcmemory)。

#### 3.4.4 Agent ReAct 循环机制与工具流

- 实例化核心智能体 `codeAgent`，在 `harness.sendMessage()` 中配置 `maxSteps: 1000`。
- 模型依据指令思考并自主决策调用工具；工具在宿主运行后将标准输出或异常反馈回模型，模型持续迭代直至完成整体任务。

#### 3.4.5 扩展工具生态与沙箱安全 (`src/tools/`, `src/lsp/`, `src/browser/`)

- **基础代码工具**：`view`（查看代码）、`grep`（内容正则搜索）、`glob`（文件匹配）、`execute_command`（受控命令执行）、`write_file`（写文件）。
- **AST 智能编辑**：`string_replace_lsp` 基于 LSP 协议实现精确的语法树级别代码替换。
- **浏览器自动化**：`navigate-browser` 与 `computer` 基于 Playwright 驱动无头/可视化浏览器进行前端界面回归与操作。
- **MCP 外部工具拓展**：动态挂载外部 Model Context Protocol 服务器提供的外部工具。
- **沙箱与路径防护**：所有读写与终端操作强制通过 `assertPathAllowed` 限制在 `projectRoot` 内，越界需经 `request_sandbox_access` 提权确认。

#### 3.4.6 分级子智能体 (Subagents)

内置派生不同权限梯队的轻量 Agent：

- `explore`：只读探索子智能体，负责代码库检索与依赖分析。
- `plan`：只读规划子智能体，负责功能设计与实施方案梳理。
- `execute`：写权限执行子智能体，执行具体代码修改并调用任务看板工具。

#### 3.4.7 执行模式与图调度 (`src/core/graph/`)

同一个模型、同一套工具，可以按任务性质切换三种**执行模式（Execution Mode）**。模式不是提示词开关，而是**整张执行图的替换**：每种模式注册一份独立的 `AgentGraphDefinition`（含拓扑描述 `topology` 与 `buildGraph(ctx)` 工厂），由 `modeId` 在运行时选择。

| 模式 ID | 界面名称         | 执行图形态                                                                                                 | 适用场景                                 |
| :------ | :--------------- | :--------------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| `react` | **ReAct**        | 单图自主循环：LLM 推理 → 工具调用 → 观察反馈 → 再推理，直至产出最终回答                                    | 绝大多数真实改码任务（界面默认）         |
| `plan`  | **Plan & Solve** | 两阶段图：先生成结构化计划（`PlanStep[]` / 任务看板），再逐项执行并按完成度回填状态                        | 大型重构、多文件特性开发，需要先看清路线 |
| `fast`  | **Fast**         | 单节点直连流式响应，仅挂载**只读工具**（读文件 / 代码搜索 / 网页检索），不提供任何写入、编辑或终端执行能力 | 问答、解释代码、查资料等轻量请求         |

实现要点：

- **枚举与别名**：`src/core/graph/types.ts` 定义 `ExecutionMode`（`REACT` / `FAST` / `PLAN`）；`GraphRegistry` 把 `build` 注册为 `react` 的别名（注册表自身的兜底 `defaultModeId` 仍是 `"build"`，最终解析到的就是 ReAct 图），因此旧的会话记录与录制文件不会失效。
- **调度入口**：`Harness.sendMessage()` 依据 `modeId` 选择图定义并构建该次运行的 StateGraph，因此 `maxSteps`、可用工具集、是否输出计划都由模式决定（例如 Plan 模式额外挂载任务看板工具）。
- **按线程记忆**：渲染层把所选模式存在 `modesByThread[threadKey]`，并与线程元数据一起持久化；切换线程会自动恢复成该线程上次使用的模式，不会出现「A 线程在 Plan、B 线程被一起改掉」。
- **Fast 的只读边界**：Fast 图用 `selectReadOnlyTools()`（`src/core/graph/readonly-tools.ts`）按权限分类过滤工具——只保留 `read` 类，因此 `write_file` / `string_replace_lsp` / `ast_smart_edit` / `execute_command` / MCP 工具都不会出现在模型面前；同时 `describeToolNames("fast")` 只登记 `view` / `search_content` / `find_files` / `request_sandbox_access`，提示词与真实工具集不会漂移。图内以 `stopWhen: stepCountIs(8)` 允许少量工具回合后强制成文。
- **可观测**：Agent Dashboard 与 Context 面板都会读 `modeId`，顶部状态条也实时显示当前模式；录制回放会把模式写进 `RecordedRuntime`，见下节。

#### 3.4.8 会话录制与离线回放 (`src/core/recorder/`)

把一次真实运行**完整录制成文件**，之后不调模型、不碰文件系统，原样重放整轮对话——用于问题复现、回归对比与演示。

```
src/core/recorder/
├── session-recorder.ts    # 边写边落盘的 JSONL 记录器
├── recording-manager.ts   # 单例管理器：录制器生命周期 + 录制文件枚举
├── replay.ts              # 录制脚本加载 / 校验 / ReplayLanguageModel
├── replay-runtime.ts      # 回放时的工具与运行时替身
├── types.ts               # SessionEvent / RecordedRuntime / ReplayScript 类型
└── index.ts
```

**录制**

- 触发：Composer 的录制按钮 → IPC `toggleSessionRecording`；执行中不允许开启（否则会录到半截 run），停止时会调用 `validateRecordingFile` 校验文件可用性。
- 落盘位置：`~/.myagent/sessions/<threadId>/<runId>.jsonl`（可用环境变量 `MYAGENT_SESSIONS_DIR` 覆盖）；启动时创建目录，追加写入，崩溃也不会丢已写入的部分。
- 事件流：`session`（版本、cwd、模型、runtime 快照）→ `run/start` → `step/start` → `assistant/stream` → `tool/result` → … → `run/end`。
- **紧凑聚合**：`assistant/stream` 不是逐 chunk 全存，而是按索引聚合为 `text-chunks` / `reasoning-chunks` / `tool-call-chunks`，并记录每个 chunk 之间的毫秒间隔 `dt: number[]`。这样既保留了「打字机节奏」和 DeepSeek 的 `reasoning_content` 思考链，文件体积又只有原始流的零头。
- **环境快照**：`RecordedRuntime` 记录 `modelId`、`modeId`、`permissionMode`、`thinkingLevel`，以及解析后的权限规则（分类策略 + 工具覆盖）与会话授权（`grants`）。没有它，回放会用「当前」的模型/模式/权限去跑，出现 Plan 模式隐藏了录制里用到的写工具、`read-only` 拒绝录制里跑过的命令、`auto-approve` 跳过录制里本该弹的审批等问题。

**回放**

- `ReplayLanguageModel` 实现 `LanguageModelV2` 接口，把录制好的流按原始 `dt` 时序吐给 Agent——**零网络请求、零 token 消耗**；工具调用同样被 `createReplayTools()` 换成录制结果的替身，不会真的改文件或执行命令。
- 支持即时（`instant`）与按倍速播放、`wrap` 循环重复播放。
- 进入回放时按 `RecordedRuntime` 还原模式与权限，并把会话授权注入，避免卡在等待一个不会到人的审批弹窗。
- 界面上通过 `SessionReplayModal` 选择或拖放录制文件即可开始，回放中的标签页会显示 Replay 状态，可随时停止回到正常会话。

### 3.5 Memory 记忆模块 (`src/memory/`)

`src/memory/` 是项目自研的 `Memory` 实现：它继承 `src/core` 的 `MyAgentMemory`，把线程/消息持久化、上下文召回与观察性记忆（OM）压缩统一收敛到一个可直接注入 `AgentController` 的实例中。

```
src/memory/
├── index.ts          # 对外出口：Memory / TokenCounter / 类型
├── memory.ts         # Memory 主类（继承 MyAgentMemory）
├── token-counter.ts  # 轻量分词估算器
├── types.ts          # ObservationalMemoryConfig / MemoryOptions / 构造配置
└── __tests__/memory.test.ts
```

#### 3.5.1 类继承关系与职责边界

| 层                 | 职责                                                                                                            |
| :----------------- | :-------------------------------------------------------------------------------------------------------------- |
| `MyAgentMemory`    | 核心基类，提供 OM 的 Observer/Reflector 编排、观察记录更新与压缩流程、注入系统提示词等全部"智能"部分。          |
| `Memory`（本项目） | 只覆写**存储字段读写**：线程 CRUD、消息读写、召回分页、系统提示取数、分词估算；并把 Working Memory 置为空实现。 |
| `TokenCounter`     | 纯函数式估算器，无外部依赖，避免引入 tiktoken 编码表带来的启动开销。                                            |

设计取向是「贴着存储层重写、把 LLM 侧逻辑留给上游」：OM 的观察抽取/反思合并由基类完成并落库，本类只负责把这些记录从存储层 (SQLiteStore) 里正确地取出、拼装并交给 Agent。

#### 3.5.2 存储域适配与线程/消息 CRUD

所有读写都先经由 `getMemoryStore()` 解析复合存储的 `memory` 域，拿不到 `storage` 或该域缺失时直接抛错，避免静默降级：

- **线程**：`createThread` / `saveThread` 在落库前补 `title`（`"New Thread"`），满足数据库 `NOT NULL` 约束；`getThreadById`、`listThreads`、`updateThread`、`deleteThread` 均直接透传到存储域。`copyThread` / `cloneThread` 用于「从历史会话派生新会话」，对 `threadId` 与 `sourceThreadId` 两种入参做兼容并归一化返回结构。
- **写入消息 (`saveMessages`)**：先用 `MessageList({ generateMessageId }).add(messages, "memory").get.all.db()` 做格式归一化（入参可能是字符串、数组或 parts 结构）；若消息缺 `resourceId` 则回查所属线程补齐；最后批量落库，并按正文长度估算本次写入的 token 用量返回。
- **召回消息 (`recall`)**：默认 `perPage: 100`、`page: 0`；未显式指定 `orderBy` 时按 `createdAt DESC` 取最新一页，再在内存中反转，从而保证「取最新 N 条、但按时间正序返回」。归一化后调用 `filterSystemReminderMessages` 过滤系统提醒与临时信号，附带 `total / page / perPage / hasMore` 分页信息，供 UI 做滚动加载。
- **删除消息 (`deleteMessages`)**：兼容 `string[]`、`{ id }[]`、`{ messageIds: [...] }` 三种入参形态，统一抽取 id 后批量删除。

#### 3.5.3 Observational Memory 参数与触发阈值

OM 的开关与全部阈值集中在 `options.observationalMemory`，类型定义在 `src/memory/types.ts`，实际装配在 `src/harness/index.ts` 的 `getDynamicMemory`：

```ts
observationalMemory: {
  enabled: true,
  scope,                                  // "thread" | "resource"
  observation: {
    bufferTokens: 1 / 5,                  // 每隔 messageTokens 的 20% 跑一次后台缓冲观察
    bufferActivation: 2000,               // 达到阈值时激活缓冲的比例，其余留作下轮储备
    messageTokens: obsThreshold,          // 观察触发阈值，默认 30_000
    blockAfter: 2,                        // 达到 2×messageTokens 时允许同步阻塞观察
    model: ({ requestContext }) => ...,   // Observer 模型
  },
  reflection: {
    bufferActivation: 1 / 2,
    blockAfter: 1.1,
    observationTokens: refThreshold,      // 反思触发阈值，默认 40_000
    model: ({ requestContext }) => ...,   // Reflector 模型
  },
}
```

- **`scope` 决定记忆可见范围**：`thread`（默认）每条会话独立观察与压缩；`resource` 则在同一 `resourceId` 的所有会话间共享观察记录。解析优先级见 `getOmScope()`（`src/utils/project.ts`）：`MYAGENT_OM_SCOPE` 环境变量 → 项目级 `<project>/.myagent/database.json` 的 `omScope` → 全局 `~/.myagent/database.json` → 默认 `thread`。
- **`bufferTokens`**：以「占 `messageTokens` 的比例」表示后台异步缓冲观察的间隔，`1/5` 即每积累到阈值的 20% 就在后台跑一次 Observer，把结果先存进缓冲区，真正越线时可直接激活而不阻塞。
- **`bufferActivation`**：越线时激活多少比例的缓冲观察，小于 1 的部分保留到下一轮，用于维持对话连贯性。
- **`blockAfter`**：允许「同步阻塞观察」的 token 阈值（取 `1 < x < 100` 时按 `messageTokens` 的倍数解析，取 `≥ 100` 时按绝对 token 数解析）。在 `messageTokens` 与 `blockAfter` 之间只跑异步缓冲，未观察消息最多可增长到 `blockAfter`（此处 `2 ×` ≈ 60k tokens）才插入一次同步观察，避免每个 Agent 步骤都被 LLM 观察调用拖慢。
- **双阈值阶梯**：会话增长到 `observationThreshold`（`observation.messageTokens`）时 Observer 抽取观察记录；观察记录本身累积到 `reflectionThreshold`（`reflection.observationTokens`）时 Reflector 把观察反思合并成更凝练的长期记忆（`reflection.blockAfter: 1.1` 表示 110% 阈值时同步反思），如此循环实现长对话的滚动压缩。
- **取数入口 `getSystemMessage()`**：从存储域读取 `activeObservations` 并包装成 `# Observational Memory` 段落，作为系统提示注入下一轮请求；记录不存在或为空时返回 `null`，且整段读取用 `try/catch` 包裹——OM 故障绝不能影响主对话链路。

#### 3.5.4 动态 Memory 工厂与模型热切换

`getDynamicMemory()` 返回的不是实例而是**取实例的函数**（`DynamicArgument`），Agent 每次需要解析 memory 时按当时的 request context 现算：

1. 从 `requestContext` 取 `controller` / `harness` 上的 `HarnessState`，读出 `observationThreshold`、`reflectionThreshold`、`observerModelId`、`reflectorModelId` 与 `projectPath`。
2. 以 `` `${obsThreshold}:${refThreshold}:${omScope}` `` 作为缓存键：只要阈值与作用域不变就复用已构建的实例，避免每轮回调都重建。
3. `observation.model` / `reflection.model` 写成闭包而非固定模型：调用时才读 `state.observerModelId ?? DEFAULT_OM_MODEL_ID`（Reflector 同理）并经 `resolveModel(..., { remapForCodexOAuth: true })` 解析，因此**运行中切换阈值或模型会立即生效**，无需重启会话。

模型变更的三条入口都位于 `src/electron/helpers.ts`（切换主模型、自动升级模型、切换失败后的回退）：它们会同时把 `observerModelId` / `reflectorModelId` 与 `currentModelId` 一起写入 state，保持三者对齐；渲染层设置面板再通过 `setObserverModel` / `setReflectorModel` 命令 + `harness.switchObserverModel()` / `switchReflectorModel()` 单独覆盖。

#### 3.5.5 分词估算与 Working Memory 空实现

- **`TokenCounter`**：采用 `ceil(len / 4)`（最少 1）的启发式估算，对代码与英文散文平均偏差可接受，且零依赖、零初始化成本；`countMessage()` 兼容 `content` 为字符串或 `{ content }` 结构。`Memory` 覆写 `estimateTokens()` 委托给它，因此 `saveMessages` / `recall` 返回的 `usage.tokens` 同源。
- **`settled()`**：直接 `Promise.resolve()`，即不等待后台 OM 任务（观察/反思）落地，保证本轮结束后 UI 侧的 `agent_end` 立即到达；未完成的观察由下一次 `bufferTokens` 检查或后续步骤自然接续。
- **Working Memory 系列**（`getWorkingMemory`、`getWorkingMemoryTemplate`、`updateWorkingMemory`、`__experimental_updateWorkingMemoryVNext`）：统一返回空值 / 空成功。基类为这些方法提供了默认实现，但本项目不需要「结构化用户画像」这一类工作记忆，长期记忆完全交给 OM 承担，因此显式覆写为空实现，而不是依赖基类可能触发的额外存储读写。

#### 3.5.6 配置入口与测试覆盖

- **UI 配置**：设置面板 `src/renderer/components/settings/MemorySection.tsx` 提供 Observer 模型、Reflector 模型、Observation threshold、Reflection threshold 四项；阈值变化会改变缓存键，进而触发 Memory 实例重建。
- **默认值**：`src/harness/state.ts` 中 `DEFAULT_OBS_THRESHOLD = 30_000`、`DEFAULT_REF_THRESHOLD = 40_000`、`DEFAULT_OM_MODEL_ID = process.env.DEFAULT_OM_MODEL_ID ?? DEFAULT_FALLBACK_MODEL_ID`。
- **测试**：`src/memory/__tests__/memory.test.ts` 使用内存态 SQLite（`file::memory:`）覆盖线程 CRUD 与分页、消息保存/召回顺序、系统提醒与信号过滤、召回分页、OM 配置与 `settled()`、`cloneThread`，以及与 `AgentController` 的线程生命周期集成。

---

## 4. 核心业务与数据流时序

### 4.1 用户消息、思考链与执行块流式时序

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant React as 渲染进程 (ChatView)
    participant Preload as 预加载层 (preload.ts)
    participant Main as 主进程 (harness-handlers)
    participant Harness as Harness 调度器
    participant Agent as MyAgent Core (LLM)

    User->>React: 输入指令并点击发送
    React->>Preload: window.api.invoke({ type: "sendMessage", content })
    Preload->>Main: ipcRenderer.invoke("harness:command")
    Main->>Harness: harness.sendMessage({ content })
    Harness->>Agent: agent.stream(message, streamOptions)

    loop 流式输出迭代 (ReAct Loop)
        Agent-->>Harness: 吐出思考块增量 (type: "thinking")
        Harness->>Main: emit("message_update", msg)
        Main->>Preload: webContents.send("harness:event", msg)
        Preload->>React: window.api.onEvent 回调
        React->>React: 更新 Thinking for … 预览（82px 自动滚动）

        Agent-->>Harness: 吐出回答文本增量 (type: "text")
        Harness->>Main: emit("message_update", msg)
        Main->>Preload: webContents.send("harness:event", msg)
        Preload->>React: window.api.onEvent 回调
        React->>React: 流式渲染 Markdown 回复
    end

    Agent-->>Harness: 完成回复 (stopReason: "complete")
    Harness->>Main: emit("message_end", msg)
    Main->>Preload: webContents.send("harness:event", msg)
    Preload->>React: 更新完成态，停止 Streaming 光标

    Harness->>Main: emit("agent_end")
    Main->>Preload: webContents.send("harness:event", agent_end)
    Preload->>React: onEvent 回调
    React->>Main: invoke({ type: "getTaskChangedFiles", messageId })
    Main->>Main: 取本轮变更文件与 diff 并落盘
    Main-->>React: changedFiles
    React->>React: SET_MESSAGE_CHANGED_FILES + AGENT_END 计算 durationMs
    React->>React: 执行块折叠为 "Worked for …"，尾部挂变更文件卡片
```

### 4.2 工具调用审批与人机协同流程

```mermaid
sequenceDiagram
    autonumber
    participant Agent as MyAgent Core
    participant Harness as Harness 调度器
    participant Main as 主进程 (permission-handlers)
    participant UI as 渲染进程 (ToolApprovalDialog)
    actor User as 用户

    Agent->>Harness: 申请调用工具 (如 execute_command)
    Note over Harness: 检查当前分类权限策略 (非 YOLO 模式且为 ask)
    Harness->>Main: emit(tool_approval_required, toolName, args)
    Main->>UI: webContents.send(harness:event)
    UI->>User: 弹出审批确认框 (含命令详情与风险提示)

    alt 用户批准 (Approve)
        User->>UI: 点击允许执行
        UI->>Main: window.api.invoke(respondToToolApproval, approve)
        Main->>Harness: harness.respondToToolApproval(approve)
        Harness->>Agent: 放行并执行工具，返回执行结果
    else 用户拒绝 (Decline)
        User->>UI: 点击拒绝
        UI->>Main: window.api.invoke(respondToToolApproval, decline)
        Main->>Harness: harness.respondToToolApproval(decline)
        Harness->>Agent: 返回取消提示 (Action cancelled by user)
    end
```

### 4.3 Git Worktree 多会话隔离机制

```mermaid
flowchart LR
    subgraph Client ["前端界面"]
        Tab1["工作区 Tab A<br/>(/repo-main)"]
        Tab2["工作区 Tab B<br/>(/repo-worktree-feat)"]
    end

    subgraph Sessions ["主进程 sessions Map"]
        SessionA["WorktreeSession A<br/>- Harness 实例 A<br/>- PtySession 终端 A<br/>- Linear 关联 A"]
        SessionB["WorktreeSession B<br/>- Harness 实例 B<br/>- PtySession 终端 B<br/>- Linear 关联 B"]
    end

    subgraph Storage ["本地数据层"]
        DBA["LibSQL DB (Resource: repo-main)"]
        DBB["LibSQL DB (Resource: repo-worktree-feat)"]
    end

    Tab1 <--> |"IPC 会话通道"| SessionA
    Tab2 <--> |"IPC 会话通道"| SessionB
    SessionA <--> DBA
    SessionB <--> DBB
```

- 当切换或打开多个工作区时，主进程维护由项目根路径为键的 `sessions: Map<string, WorktreeSession>`。
- 所有前后台通信事件均携带 `worktreePath` 标识，前端 Hook 会依据当前激活的工作区自动比对，杜绝后台会话消息错位串扰。

---

## 5. 源码目录结构映射

```
src/
├── core/                      # 自研智能体核心层 (Agent Runtime Core)
│   ├── agent/                 # Agent 核心类定义与 streamText 流式执行管道
│   ├── controller/            # AgentController 调度容器与 Session 会话类定义
│   ├── context/               # RequestContext 请求生命周期上下文
│   ├── tools/                 # 工具适配、参数校验与 JSON Schema 转换 (toModelTool)
│   ├── memory/                # 核心 Memory 抽象类定义
│   ├── llm/                   # 统一语言模型解析与动态包装
│   ├── graph/                 # 执行模式图定义 (ReAct / Plan & Solve / Fast) 与调度
│   ├── recorder/              # 会话录制 (JSONL) 与离线回放 (ReplayLanguageModel)
│   ├── workspace/             # 工作区解析与环境抽象
│   └── index.ts               # 核心层对外统一出口
│
├── harness/                   # 智能体装配与门面代理层 (Harness Facade)
│   ├── index.ts               # createMyAgent 入口、adapter 装配与 HarnessProxy 动态代理
│   ├── instructions.ts        # 动态系统提示词装配 (getDynamicInstructions)
│   ├── model-resolver.ts      # 模型解析与鉴权凭证绑定 (createModelResolver)
│   ├── subagents.ts           # 默认子智能体 (explore/plan/execute) 装配
│   ├── tools.ts               # 动态工具组装与不同运行模式过滤
│   ├── thinking.ts            # 思考链 (Thinking/Reasoning) 解析与标签过滤
│   ├── settings.ts            # 工作区与用户设置持久化
│   └── state.ts               # 会话状态机类型与 Schema 定义
│
├── agents/                    # 分级子智能体定义 (Subagents)
│   ├── explore.ts             # 只读代码探索子智能体 (代码检索、结构分析)
│   ├── plan.ts                # 只读架构规划子智能体 (设计实现方案)
│   ├── execute.ts             # 具备写入与终端执行能力的实施子智能体
│   └── index.ts               # 子智能体导出
│
├── prompts/                   # 系统提示词系统 (System Prompts)
│   ├── base.ts                # 通用基础提示词 (编码准则、Git 安全、沙箱约束)
│   ├── build.ts               # ReAct 模式提示词 (实现与验证循环，对应 modeId=react)
│   ├── plan.ts                # Plan & Solve 模式提示词 (先规划后执行)
│   ├── fast.ts                # Fast 模式提示词 (直连流式 + 只读工具边界)
│   └── index.ts               # buildFullPrompt 提示词装配入口
│
├── tools/                     # Agent 宿主扩展工具实现 (Tool Implementations)
│   ├── shell.ts               # execute_command (进程组管控、超时拦截、实时流式输出)
│   ├── file-view.ts           # view (文件只读查看、目录树巡检)
│   ├── write.ts               # write_file (写文件、覆盖、目录递归自动创建)
│   ├── grep.ts                # search_content (基于 ripgrep/正则的代码内容搜索)
│   ├── glob.ts                # find_files (文件名与路径通配符模式匹配)
│   ├── string-replace-lsp.ts  # string_replace_lsp (基于 LSP 的文本精准替换与诊断)
│   ├── ast-smart-edit.ts      # ast_smart_edit (基于 ast-grep 的语法结构重构)
│   ├── subagent.ts            # subagent 派生工具 (流式消费子 Agent 事件与结果)
│   ├── request-sandbox-access.ts # request_sandbox_access (动态沙箱提权提问交互)
│   ├── navigate-browser.ts    # 基于 Playwright 的网页导航与内容抓取
│   ├── computer-use.ts        # 基于无头浏览器的视觉操作工具
│   └── utils.ts               # 路径沙箱限制 (assertPathAllowed) 与并发写文件锁
│
├── store/                     # 原生无服务 SQLite 存储引擎 (LibSQL / node:sqlite)
│   ├── store.ts               # SQLiteStore 主类 (基于 WAL 模式的高性能本地数据库)
│   ├── memory-store.ts        # SQLiteMemoryStore (线程/消息持久化与观察性记忆存储)
│   ├── schema.ts              # SQLite DDL 表结构与性能索引定义
│   ├── types.ts               # 存储配置与领域接口定义
│   └── index.ts               # 存储层对外导出
│
├── memory/                    # 观察性记忆模块 (Observational Memory)
│   ├── memory.ts              # 继承 MyAgentMemory (消息 CRUD、会话秒级恢复、OM 系统提示注入)
│   ├── token-counter.ts       # 启发式分词估算器 (len / 4)
│   ├── types.ts               # ObservationalMemoryConfig / MemoryOptions
│   └── index.ts               # 记忆层对外导出
│
├── electron/                  # 主进程层 (Main Process)
│   ├── main.ts                # 应用主生命周期、窗口创建、Harness 初始化与事件转接
│   ├── preload.ts             # 安全预加载脚本，实现 contextBridge 注入
│   ├── electron-state.ts      # 工作区维度的集成状态管理 (Linear/GitHub 绑定)
│   ├── notifications.ts       # 原生系统通知与角标更新服务
│   ├── task-changes-store.ts  # 任务变更文件与 diff 的本地持久化 (task-changes.json)
│   ├── helpers.ts             # 会话辅助工具 (OAuth 校验、对话标题自动生成)
│   └── ipc/                   # 模块化 IPC 命令处理器 (14 个业务子模块)
│       ├── harness-handlers.ts       # 消息收发、模式与模型调度
│       ├── project-handlers.ts       # 项目探测、Worktree 切换与会话构建
│       ├── permission-handlers.ts    # 权限校验、工具审批、提问拦截
│       ├── pty-handlers.ts           # node-pty 伪终端生命周期与 I/O
│       ├── git-handlers.ts           # Git 状态提取与代码差异对比
│       ├── file-handlers.ts          # 文件只读读取与编辑器服务
│       ├── integration-handlers.ts   # Linear / GitHub 双向集成协议
│       ├── mcp-handlers.ts           # MCP 服务连接生命周期管理
│       ├── settings-handlers.ts      # 应用偏好与模型参数持久化
│       ├── auth-handlers.ts          # OAuth 身份凭证轮转与回调
│       ├── dashboard-handlers.ts     # Token 统计与 Agent 运行耗时聚合
│       ├── slash-command-handlers.ts # Slash 指令加载与动态注入
│       └── index.ts                  # IPC 路由总装与分发入口
│
├── renderer/                  # 渲染进程 UI 层 (React 19 + TypeScript + Vite)
│   ├── index.html             # 页面承载 HTML 入口
│   ├── main.tsx              # React 挂载入口
│   ├── App.tsx                # 应用顶层布局骨架、快捷键注册与状态装配
│   ├── components/            # 核心 UI 面板与交互组件
│   │   ├── ChatView.tsx              # 会话渲染管线：消息分组、一轮一个执行块、吸顶用户消息
│   │   ├── AssistantMessage.tsx      # 助手正文渲染 (Markdown / 代码高亮 / 复制)
│   │   ├── ExecutionBlock.tsx        # 执行块：运行中 Thinking for … / 结束 Worked for …
│   │   ├── UserMessage.tsx           # 用户消息气泡：吸顶、折叠、图片预览
│   │   ├── FilesChangedBar.tsx       # 本轮变更文件卡片与行内 diff
│   │   ├── TodoProgress.tsx          # 任务进度条
│   │   ├── ToolExecution.tsx         # 工具执行状态卡片组件
│   │   ├── SubagentExecution.tsx     # 子 Agent 执行嵌套可视化组件
│   │   ├── TerminalPanel.tsx         # 基于 xterm.js 的嵌入式终端面板
│   │   ├── FileEditor.tsx            # 语法高亮代码编辑器/查看器
│   │   ├── DiffEditor.tsx            # 代码变更对比面板
│   │   ├── TaskBoard.tsx             # 任务看板 (Linear / GitHub Issues)
│   │   ├── ToolApprovalDialog.tsx    # 工具审批拦截交互模态框
│   │   ├── ModelSelector.tsx         # 模型切换与鉴权状态下拉面板
│   │   └── CommandPalette.tsx        # Cmd+K 全局指令面板
│   ├── hooks/                 # 自定义业务 React Hooks
│   │   ├── useHarnessEvents.ts       # IPC 核心事件总线订阅与状态分发
│   │   ├── useChatReducer.ts         # 对话与工具状态机
│   │   ├── useProjectManager.ts      # 多工程与 Worktree 状态控制
│   │   └── useGitOperations.ts       # Git 操作与差异拉取
│   ├── types/                 # 渲染进程 TypeScript 类型定义
│   └── styles/                # 全局样式与主题变量
│
├── mcp/                       # Model Context Protocol (MCP) 客户端与管理
│   ├── client.ts              # MCP 客户端协议实现 (Stdio / SSE 通信信道)
│   ├── manager.ts             # MCP 服务器动态发现、生命周期与工具注入
│   └── types.ts               # MCP 协议标准定义
│
├── lsp/                       # 语言服务器协议 (LSP) 与 AST 智能改写集成
│   ├── client.ts              # LSP 客户端与诊断信息收集
│   ├── manager.ts             # 语言服务器进程生命周期管理
│   └── server.ts              # TypeScript/JavaScript 等语言服务适配
│
├── browser/                   # Playwright 浏览器自动化管理器 (BrowserManager)
├── hooks/                     # 项目扩展钩子管理 (HookManager / 阶段自动化任务)
├── acp/                       # Agent Client Protocol 终端管理与事件总线
├── auth/                      # 凭证存储 (AuthStorage) 与 OAuth 鉴权适配
├── permissions.ts             # 工具权限分类策略 (read / edit / execute / mcp / YOLO)
└── utils/                     # 通用工具函数 (项目探测、路径安全、Token 估算)
```
