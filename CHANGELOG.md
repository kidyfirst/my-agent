# 更新日志 (Changelog)

所有关键更新与版本演进均记录于此。遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [v0.1.5] - 2026-11-05

### 🗂️ 右侧栏全面 Tab 化 (Tabbed Right Sidebar)

- **五个面板并列成 tab**：Files / Review / Terminal / Browser / Overview 收进同一条 tab 条，支持拖拽调宽；每个会话独立记忆自己开着哪些 tab、是否可见、是否最大化，切回来就是离开时的样子。
- **最大化与隐藏**：右上角新增两个图标——最大化用 `flex-basis` 插值动画向左铺满会话区（`⇧⌘M` 同效），再点还原；隐藏按钮位于面板右缘，面板收起后由会话窗口右侧的按钮接回，两处互斥不重叠。
- **Overview 下拉菜单脱离裁剪**：菜单改为 portal 到 `body` + `position: fixed`，不再被 38px 高、带 `overflow: hidden` 的标题栏切掉。

### 🌐 内嵌浏览器面板 (Embedded Browser Panel)

- **webview 多标签**：Browser tab 内自带标签条，agent 导航时自动接管跟随页或新开一页，用户手动打开的页面不会被 agent 覆盖。
- **快照卡改在面板内打开**：computer use 快照卡右上角按钮不再唤起系统浏览器，而是把 URL 送到右侧 Browser 面板；隐藏的 webview 用 `visibility` 保活，重新显示不会白屏。

### 🖱️ Computer Use 重写为纯函数工具 (Text-first Computer Use)

- **所有 provider 都能调用**：放弃只被部分厂商识别的 provider 定义式 computer tool，改造成普通 function tool，DeepSeek 等模型同样可以驱动浏览器，且重新走统一的审批与 `tool_start` / `tool_end` 事件。
- **`screenshot` 返回文本快照**：遍历 DOM 取出最多 120 个可交互元素（编号 + 中心点坐标 + 可见文本），而不是把 base64 图片塞进 tool result 里烧 token。
- **动作帧另行推送**：每次动作后把 JPEG 帧镜像到桌面端预览卡（400ms 节流、无订阅者不拍、异常不影响工具执行）。

### ⌨️ 快捷键与标题栏提示 (Shortcuts & Tooltips)

- **自定义快捷键气泡**：左侧栏 `⌘B`、右侧面板 `⇧⌘B`、会话搜索 `⌘K`、命令面板 `⇧⌘P`、Overview `⌥⌘O`，hover 即显示「动作 + 键位」；同步写入 Electron 菜单 accelerator，避免菜单抢占后收不到按键。
- **光标语义修正**：会话标题只在点击真能切回对话时才显示手型，会话已在前台时是普通箭头。

### 🧩 其它打磨 (Polish)

- Terminal 收敛为单 shell，去掉整条 header 与 tab；移除 xterm 6 自带的 SmoothScrollableElement 滚动条。
- diff 头部改用统一的 `Open in…` 下拉，不再各自实现一套。
- 文件与会话 tab 不再换行，超长省略并在 hover 时给出完整路径。
- Subagent 迁移到多核 worker thread 模型，重文件与检索类工具离线执行，主进程不再掉帧。

---

## [v0.1.4] - 2026-11-03

### 🏗️ Monorepo 架构重构 (Monorepo Refactor)

- 代码库拆分为 `packages/core`（调度引擎与工具）、`packages/a2a`（A2A 协议）、`packages/cli`（守护进程）与 `apps/desktop`（Electron 客户端），移除遗留的根 `src/`，各端共享同一套核心。

### 🔐 工具授权重设计 (Tool Approval Redesign)

- 授权请求从对话框改为内联卡片，支持一次性 / 会话内 / 项目级多档作用域；审批记录落 SQLite 审计表，可回溯。
- Electron 由 40 升级至 45，随之上调原生能力与安全基线。

### 🤖 多 Agent 与 Subagent (Multi-Agent)

- `subagent` 工具接入动态工具集与 harness，按角色派发独立上下文与工具子集。
- 执行卡重做：应用重启后仍能从持久化的 `<subagent-meta>` 标签还原工具调用历史、模型与耗时。

### 🎛️ 运行期纠偏 (Steering)

- 工具审批期间与任务运行期间都可插入 steering prompt，不必中断再重开一轮。

### 🩺 流式看门狗 (Stream Stall Watchdog)

- 连续 120s 无增量即判定为死流并显式失败，避免「服务繁忙」这类只建连不响应的服务把任务挂死；工具执行期间自动停表，不会误杀长时间运行的 subagent。

### 🐛 修复与体验 (Fixes & UX)

- 任务结束后未清除 `isStreaming`，导致时间戳与反馈按钮消失。
- 审批卡中的长命令改为中间截断，作用域后缀始终可见。
- thinking 滑块旋钮垂直居中，激活填充延伸到旋钮右缘。
- DeepSeek 图片 part 被序列化成 `[object Object]`、base64 data URL 格式错误。
- A2A 项目操作与桌面会话切换、侧边栏刷新联动。
- 聊天区新增 sticky header 渐隐、底部渐隐与「回到最新」按钮。

---

## [v0.1.3] - 2026-11-02

### ↩️ 任务回滚 (Task Rollback)

- 任务开始时对工作区打 git tree 快照作为基线，中断后可在提示条上直接回滚：新增文件删除，被改动或删除的文件还原到基线内容；基线状态持久化到 `active-baselines.json`，重启后仍可回滚。

### 🧠 多线程执行稳定性 (Multi-thread Stability)

- 控制器引入按线程的运行表与串行队列，`abort` 支持只终止指定线程；侧边栏会话行显示运行中与「等待工具授权」徽标，多个线程并行时状态不再互相覆盖。

### 🛡️ 退出保护 (Window Close Safety)

- 有任务正在执行时关闭窗口或退出应用，会先弹确认框，可选「继续等待」或「终止任务并退出」；后者先 abort 所有运行中的 harness 再退出。

### 🌐 Provider 列表健壮性 (Provider Catalog Robustness)

- models.dev 与 Netlify AI Gateway 的模型目录拉取加 10s 超时与结构容错，网络异常时降级为空目录，而不是抛错阻塞启动。

### 🐛 修复 (Fixes)

- 执行上下文不再泄漏到模型自行构造的 tool 参数里。
- 提示词补充：URL 之后的标点应放在链接之外。

---

## [v0.1.2] - 2026-10-30

### 🧭 三种执行模式 (Execution Modes)

- 新增 ReAct / Plan & Solve / Fast 三档执行模式，统一跑在可组合的 graph 调度器上；Fast 模式用只读工具子集换取更短的往返，每个线程各自维护模式与记忆。

### ⏺️ 会话录制与离线回放 (Session Recording & Replay)

- 完整记录一次会话的事件流，可在没有模型、没有网络的情况下回放，用于复现问题与调试；录制器支持重复回放与逐段跳读。

### 👥 侧边栏多项目会话 (Multi-project Sessions)

- 同一项目下并行多个会话，worktree 支持重命名；新增全局搜索，跨项目检索历史会话。

### 💬 社区与反馈 (Community & Feedback)

- 侧边栏社区卡片：Star、赞助、分享三个入口。
- 每条回复下方新增 copy / helpful / bad-response 反馈条，bad-response 可附说明，反馈计数持久化。

### 🔌 平台能力 (Platform)

- 内置 MCP server 配置与热重载、静默执行模式（quiet exec，git 探测失败不再往终端刷 `fatal: not a git repository`）、结构化日志处理器与数据库迁移框架。

### 📚 文档与发布 (Docs & Release)

- README 提供中英双语版本与赞助入口，发布脚本自动把版本号与下载矩阵同步到 GitHub Pages 站点。

---

## [v0.1.1] - 2026-10-27

### 🚀 多模态视觉与消息体验升级 (Multimodal Vision & Chat UX)

- **多模态视觉模型支持**：放开对 DeepSeek Flash（DeepSeek-V4.1-Flash）等多模态模型的图片输入通道，引入 `wrapLanguageModel` 中间件规范化兼容 AI SDK v4 文件传输，彻底解决图片请求序列化报错问题。
- **纯净消息交互与去重拦截**：
  - 移除对用户原始消息拼接内部提示文案的侵入式逻辑，保持用户气泡与数据库存储 1:1 真实一致；
  - 增强前端乐观消息比对与时间戳过期判定，彻底消除大模型回复后用户消息重复追加到底部的问题。
- **任务耗时体验优化**：统一在回复顶部呈现 `Worked for x.xs` 耗时指示与执行步骤详情，文字答复与多步任务均获得一致的视觉体验。

### 🌐 官方文档与特性展示 (Documentation & Features)

- **核心特性真实 UI 呈现**：官方文档网站全面替换为基于真实应用运行界面的 16:9 高清局部特性图（自主 ReAct 闭环循环、纯原生 MCP 协议支持、Git Worktree 安全隔离、极速内嵌 PTY 终端、观察性记忆与历史恢复）。
- **文档精简与聚焦**：移除冗余的 Codex 同心圆环特性说明，突出专业开发者底座定位。

---

## [v0.1.0] - 2026-10-26

### 🚀 核心架构与功能特性 (Core Features & Architecture)

- **全新自主独立架构**：自研核心调度引擎与 Agent 控制器，脱离第三方高耦合框架，提供轻量、高效的纯原生 AI 体验。
- **自主 ReAct 执行闭环**：支持大模型自主推理、规划步骤、调用工具、校验结果与自动自我修正。
- **原生 MCP (Model Context Protocol) 支持**：完整自研标准 MCP 客户端规范，支持 Stdio 进程与 HTTP/JSON-RPC 协议通道，实现外部工具服务器自动发现、动态注入与安全管理。
- **多模型生态接入**：原生兼容并优化 Gemini (Gemini 2.5/3.8)、DeepSeek、Claude、OpenAI Codex 等主流大语言模型，支持 API Key 零泄露本地安全加密存储。
- **Git Worktree 隔离工作空间**：支持在独立 Git 工作树分支中运行 Agent 任务，零污染开发者当前正在编辑的工作区代码，方便随时可视化比对 Diff 与一键合并。
- **原生内置全套工程工具**：
  - `execute_command`：在受控伪终端（node-pty + xterm.js）中实时流式执行终端命令，支持交互式输入与超时控制；
  - `read_file` / `write_file` / `find_files` / `search_content`：受控的文件查看、编辑与全文/正则代码搜索；
  - `string_replace_lsp`：基于精确匹配与 AST 语法的可靠代码替换，避免正则误改。
- **观察性记忆（Observational Memory）与会话恢复**：基于本地 SQLite（`myagent.db`）管理历史会话与上下文记忆摘要，启动和切换项目时自动无缝记忆并恢复最近会话。

### 🛠️ 桌面客户端体验与系统优化 (Desktop App & UX)

- **品牌与原生桌面支持**：正式确立 **`My Agent`** 品牌，完美适配 macOS（访达 Applications、启动台 Launchpad、程序坞 Dock 原生显示）、Windows 10/11 与 Linux 桌面。
- **Codex 风格同心圆环下载更新进度**：应用内集成自动更新系统，并在侧边栏更新按钮中呈现类似 Codex 的同心动态圆环流光与精准百分比进度动画。
- **轻量原生交互**：优化按钮 Tooltip 体验，采用原生 hover 提示避免界面元素遮挡；修复工作区空仓库与幽灵项显示异常。
- **全平台自动化 CI/CD 构建**：采用 GitHub Actions 构建矩阵，全自动生成 macOS (Apple Silicon arm64 & Intel x64)、Windows (x64) 以及 Linux (AppImage & deb) 安装包。
