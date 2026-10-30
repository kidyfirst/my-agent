# 更新日志 (Changelog)

所有关键更新与版本演进均记录于此。遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

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
