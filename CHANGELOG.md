# 更新日志 (Changelog)

所有关键更新与版本演进均记录于此。遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [v1.0.0] - 2026-10-26

### 🚀 新特性与重大重构 (Major Features & Architecture)

- **全新独立自主架构**：自主实现 `src/core` 调度层、Agent 控制器、事件总线与会话机制，全面解耦第三方框架依赖。
- **纯原生 MCP 客户端**：自研实现标准 MCP（Model Context Protocol）协议客户端，支持 Stdio 进程与 HTTP JSON-RPC 传输通道，实现服务器动态发现、工具注入与生命周期管理。
- **自动化历史会话恢复**：解决每次启动打开空白会话的问题，在启动和切换项目时自动记忆并无缝打开上次活跃的历史会话窗口。
- **完整的原生开发工具集**：主 Agent 原生内置终端命令执行（`execute_command`）、文件操作（`view`, `write_file`, `find_files`, `search_content`）及 AST 智能语法树编辑与 LSP 字符串替换。

### 🛠️ 优化与修复 (Improvements & Fixes)

- **进程安全退出保障**：全面消除关闭应用或窗口时因 PTY 异步事件引发的 `TypeError: Object has been destroyed` 异常，完善生命周期清理。
- **模型权限与智能回退**：自动校验用户登录状态，优先使用已授权模型（如 DeepSeek），避免无效模型引发的配置警告。
- **数据库平滑迁移**：历史线程、消息记录与观察性记忆数据全面统一同步至本地 `myagent.db` SQLite 数据库。
- **控制台噪声过滤**：自动过滤 macOS 系统的输入法与 Mach Port 系统级调试日志，保持终端与开发环境清爽整洁。

---

## [v0.9.0] - 2026-10-20

### 🚀 新特性 (Features)

- **多模型无缝切换**：支持 DeepSeek、OpenAI Codex、Claude、Gemini 等主流大语言模型。
- **内置终端集成**：基于 `node-pty` 和 `xterm.js` 提供高性能内嵌式终端体验。
- **YOLO 极速权限模式**：支持一键切换全局自动授权 / 安全确认执行策略。
- **观察性记忆（Observational Memory）**：支持后台长对话摘要与动态记忆压缩，突破长上下文瓶颈。

### 🛠️ 优化与修复 (Improvements)

- 支持深色 / 浅色主题随系统自动切换。
- 优化文件树与快速文件查找（Quick File Open）响应速度。
