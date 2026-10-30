/**
 * My Agent - Landing page language switch (zh-CN / en)
 *
 * Use data-i18n / data-i18n-html / data-i18n-title / data-i18n-alt /
 * data-i18n-aria / data-i18n-content attributes in the markup; main.js keeps
 * its OS-dependent copy in sync by swapping the attribute value and calling
 * DocsI18n.apply().
 */
;(function () {
	"use strict"

	var STORAGE_KEY = "my-agent-docs.lang"
	var DEFAULT_LANG = "zh"
	var PENDING_CLASS = "i18n-pending"

	var STRINGS = {
		zh: {
			"meta.title": "My Agent - 全栈自主 AI 工作台 | 官方下载",
			"meta.desc":
				"My Agent 是一款专为高效工程研发打造的桌面级自主 AI 工作台。搭载自研 ReAct 调度引擎、原生 MCP 协议客户端、双向 Git Worktree 隔离与极速内嵌终端。",

			"nav.features": "功能特性",
			"nav.downloads": "客户端下载",
			"nav.changelog": "更新日志",
			"nav.guide": "安装指引",
			"nav.githubTitle": "GitHub 源码仓库",

			"lang.switchTitle": "Switch to English",
			"lang.switchAria": "切换界面语言至英文",

			"hero.versionTitle": "查看更新详情",
			"hero.versionA": "最新版本",
			"hero.versionB": "现已发布",
			"hero.titleA": "自主原生核心 · 深度工作流集成",
			"hero.titleB": "全栈 AI 工作台",
			"hero.subtitle":
				"My Agent 是一款专为高效工程研发打造的桌面级自主 AI 工作台。搭载自研 ReAct 调度引擎、原生 MCP 协议客户端、双向 Git Worktree 隔离与极速内嵌终端，助你专注于更高维度的创造。",
			"hero.cta": "立即下载 My Agent",
			"hero.ctaMacArm": "下载 macOS 版",
			"hero.ctaMacX64": "下载 macOS Intel 版",
			"hero.ctaWin": "下载 Windows 版",
			"hero.ctaLinux": "下载 Linux 版",
			"hero.detecting": "正在智能识别操作系统...",
			"hero.tipMacArm":
				'已自动适配 <strong>Apple Silicon (M1/M2/M3/M4)</strong> · <a href="#downloads">查看所有平台与格式 ↓</a>',
			"hero.tipMacX64":
				'已自动适配 <strong>Intel 处理器</strong> · <a href="#downloads">查看所有平台与格式 ↓</a>',
			"hero.tipWin":
				'已自动适配 <strong>Windows 64位</strong> · <a href="#downloads">查看所有平台与格式 ↓</a>',
			"hero.tipLinux":
				'已自动适配 <strong>Linux x64</strong> · <a href="#downloads">查看所有平台与格式 ↓</a>',
			"hero.tipOther": "请在下方选择适合您的操作系统版本",

			"showcase.alt":
				"My Agent 深色主题界面：项目与会话列表、文件树、内嵌终端与执行模式选择",

			"features.title": "为专业开发者打造的强劲底座",
			"features.desc":
				"打破黑盒约束，回归掌控。原生性能、安全隔离与生态开放的深度结合。",

			"feat1.title": "自主 ReAct 闭环循环",
			"feat1.desc":
				"自研调度引擎，支持多轮复杂推理、步骤规划、代码智能检索、AST 精准替换与运行报错自我修复闭环。",
			"feat2.title": "纯原生 MCP 协议支持",
			"feat2.desc":
				"深度集成 Model Context Protocol 标准客户端，原生支持 Stdio 与 HTTP/JSON-RPC 服务发现与外部工具生态无缝对接。",
			"feat3.title": "Git Worktree 安全隔离",
			"feat3.desc":
				"任务自动运行在独立 Git 工作树分支中，代码修改与测试绝不污染当前正在编写的本地文件，安全无忧。",
			"feat4.title": "极速内嵌 PTY 终端",
			"feat4.desc":
				"深度定制 node-pty 与 xterm.js，支持双向交互式输入、窗口尺寸动态同步与长执行命令实时日志流式中继。",
			"feat5.title": "观察性记忆与历史恢复",
			"feat5.desc":
				"基于本地 SQLite 引擎存储完整会话，支持超长上下文后台关键事实抽取与压缩，启动即开即用、会话无缝接续。",
			"feat6.title": "三种执行模式自由切换",
			"feat6.desc":
				"ReAct 自主循环、Plan &amp; Solve 先规划后执行、Fast 直连流式响应并保留只读检索能力。切换模式即更换整张执行图与工具集，并按线程独立记忆各自的选择。",
			"feat7.title": "会话录制与离线回放",
			"feat7.desc":
				"一键把真实运行录制为紧凑 JSONL（含思考链与打字节奏），回放零请求零消耗，并按录制时的模型、模式与权限完整还原现场。",

			"dl.title": "全平台客户端下载",
			"dl.descA": "当前最新稳定版本",
			"dl.descB": "，选择适合您设备的安装包。",
			"dl.badgeMac": "推荐 Mac 用户",
			"dl.macArmArch": "适用于 M1 / M2 / M3 / M4 芯片 (ARM64)",
			"dl.macX64Arch": "适用于 Intel 架构 64位 Mac 设备",
			"dl.winArch": "适用于 Windows 10 / 11 64位",
			"dl.linuxArch": "Ubuntu / Debian / Arch / Fedora",
			"dl.btnDmg": "下载 .dmg 安装包",
			"dl.btnDmgSame": "下载 .dmg 安装包",
			"dl.btnZip": "免安装解压包 (.zip)",
			"dl.btnWinExe": "下载 Windows 安装程序",
			"dl.btnWinZip": "免安装便携包 (.zip)",
			"dl.btnAppImage": "下载 AppImage 独立包",
			"dl.btnDeb": "Debian / Ubuntu 安装包",

			"guide.title": "安装与安全提示 (macOS Gatekeeper)",
			"guide.desc":
				"若系统提示「应用已损坏」或「无法打开来自未验证开发者的应用」，请按下方指引操作。",
			"guide.h3": "🍎 macOS 隔离属性清除命令",
			"guide.body":
				"在 macOS 上若从浏览器直接下载并将 <strong>My Agent</strong> 移动到「应用程序」后打开提示报错，这是 macOS Gatekeeper 针对未签名应用添加的隔离属性（Quarantine）所致。只需打开「终端（Terminal）」并运行以下命令即可：",
			"guide.copy": "复制命令",
			"guide.copyTitle": "点击复制命令",
			"guide.copied": "已复制!",
			"guide.tip":
				'💡 提示：如果终端提示权限不足，可加上 <code>sudo</code> 执行：<code>sudo xattr -rd com.apple.quarantine "/Applications/My Agent.app"</code>。命令执行完成后，重新在应用程序中双击 <strong>My Agent</strong> 即可正常启动。',
		},

		en: {
			"meta.title":
				"My Agent - Full-stack Autonomous AI Coding Workbench | Download",
			"meta.desc":
				"My Agent is a desktop-grade autonomous AI coding workbench built for high-velocity engineering. It ships with a self-built ReAct scheduler, a native MCP client, bidirectional Git worktree isolation and a blazing-fast embedded terminal.",

			"nav.features": "Features",
			"nav.downloads": "Downloads",
			"nav.changelog": "Changelog",
			"nav.guide": "Install guide",
			"nav.githubTitle": "GitHub repository",

			"lang.switchTitle": "切换到中文",
			"lang.switchAria": "Switch the interface language to Chinese",

			"hero.versionTitle": "View release notes",
			"hero.versionA": "Version",
			"hero.versionB": "is out now",
			"hero.titleA": "Native autonomous core · Deep workflow integration",
			"hero.titleB": "The full-stack AI coding workbench",
			"hero.subtitle":
				"My Agent is a desktop-grade autonomous AI coding workbench built for high-velocity engineering. A self-built ReAct scheduler, a native MCP client, bidirectional Git worktree isolation and a blazing-fast embedded terminal — so you can focus on higher-order creation.",
			"hero.cta": "Download My Agent",
			"hero.ctaMacArm": "Download for macOS",
			"hero.ctaMacX64": "Download for macOS Intel",
			"hero.ctaWin": "Download for Windows",
			"hero.ctaLinux": "Download for Linux",
			"hero.detecting": "Detecting your operating system...",
			"hero.tipMacArm":
				'Detected <strong>Apple Silicon (M1/M2/M3/M4)</strong> · <a href="#downloads">See all platforms &amp; formats ↓</a>',
			"hero.tipMacX64":
				'Detected <strong>Intel processor</strong> · <a href="#downloads">See all platforms &amp; formats ↓</a>',
			"hero.tipWin":
				'Detected <strong>Windows 64-bit</strong> · <a href="#downloads">See all platforms &amp; formats ↓</a>',
			"hero.tipLinux":
				'Detected <strong>Linux x64</strong> · <a href="#downloads">See all platforms &amp; formats ↓</a>',
			"hero.tipOther":
				"Pick the build that matches your operating system below",

			"showcase.alt":
				"My Agent in dark theme: project and session list, file tree, embedded terminal and execution mode picker",

			"features.title": "A robust foundation built for professional developers",
			"features.desc":
				"Break out of the black box and take back control: native performance, hard isolation and an open ecosystem in one package.",

			"feat1.title": "Autonomous ReAct loop",
			"feat1.desc":
				"A purpose-built scheduler covering multi-round reasoning, step planning, semantic code search, precise AST patching and a self-healing loop for runtime errors.",
			"feat2.title": "Native MCP protocol support",
			"feat2.desc":
				"A first-class Model Context Protocol client with native Stdio and HTTP/JSON-RPC transport, service discovery and seamless integration with external tool ecosystems.",
			"feat3.title": "Git worktree isolation",
			"feat3.desc":
				"Every task runs on its own Git worktree branch, so agent edits and test runs never touch the files you are editing right now.",
			"feat4.title": "Blazing-fast embedded PTY",
			"feat4.desc":
				"Custom-tuned node-pty and xterm.js with two-way interactive input, live viewport resizing and streamed logs from long-running commands.",
			"feat5.title": "Observational memory & history restore",
			"feat5.desc":
				"Complete sessions persist in a local SQLite engine, and long contexts are compressed through background fact extraction — so every thread resumes instantly at launch.",
			"feat6.title": "Three execution modes, switch anytime",
			"feat6.desc":
				"ReAct for autonomous loops, Plan &amp; Solve for plan-then-execute, Fast for direct streaming answers with read-only lookups. Switching replaces the whole execution graph and toolset, and every thread remembers its own choice.",
			"feat7.title": "Session recording & offline replay",
			"feat7.desc":
				"Record a real run into a compact JSONL — thinking chain and typing cadence included. Replay it with zero requests and zero cost, restoring the exact model, mode and permissions of the recording.",

			"dl.title": "Download for every platform",
			"dl.descA": "Latest stable release",
			"dl.descB": " — pick the installer that matches your device.",
			"dl.badgeMac": "Recommended for Mac",
			"dl.macArmArch": "For M1 / M2 / M3 / M4 chips (ARM64)",
			"dl.macX64Arch": "For 64-bit Intel-based Macs",
			"dl.winArch": "For 64-bit Windows 10 / 11",
			"dl.linuxArch": "Ubuntu / Debian / Arch / Fedora",
			"dl.btnDmg": "Download .dmg installer",
			"dl.btnDmgSame": "Download .dmg installer",
			"dl.btnZip": "Portable .zip archive",
			"dl.btnWinExe": "Download Windows installer",
			"dl.btnWinZip": "Portable .zip bundle",
			"dl.btnAppImage": "Download standalone AppImage",
			"dl.btnDeb": "Debian / Ubuntu package",

			"guide.title": "Installation & security notes (macOS Gatekeeper)",
			"guide.desc":
				'If macOS reports "App is damaged" or "cannot be opened because the developer cannot be verified", follow the steps below.',
			"guide.h3": "🍎 Clear the macOS quarantine attribute",
			"guide.body":
				"When you download <strong>My Agent</strong> in a browser and move it into Applications, macOS may refuse to open it — Gatekeeper attaches a quarantine attribute to unsigned apps. Just open Terminal and run:",
			"guide.copy": "Copy command",
			"guide.copyTitle": "Click to copy the command",
			"guide.copied": "Copied!",
			"guide.tip":
				'💡 Tip: if Terminal reports insufficient permissions, run it with <code>sudo</code>: <code>sudo xattr -rd com.apple.quarantine "/Applications/My Agent.app"</code>. Afterwards, double-click <strong>My Agent</strong> in Applications and it will launch normally.',
		},
	}

	var current = DEFAULT_LANG

	function normalize(lang) {
		if (!lang) return null
		var value = String(lang).toLowerCase()
		if (value.indexOf("zh") === 0) return "zh"
		if (value.indexOf("en") === 0) return "en"
		return null
	}

	function detect() {
		try {
			var stored = normalize(window.localStorage.getItem(STORAGE_KEY))
			if (stored) return stored
		} catch (e) {
			/* storage disabled */
		}
		var nav = normalize(
			navigator.language || (navigator.languages && navigator.languages[0]),
		)
		return nav || DEFAULT_LANG
	}

	function t(key) {
		var table = STRINGS[current] || STRINGS[DEFAULT_LANG]
		var value = table[key]
		if (value === undefined) value = STRINGS[DEFAULT_LANG][key]
		return value === undefined ? key : value
	}

	function applyAttr(selector, attribute, readKey) {
		var nodes = document.querySelectorAll(selector)
		for (var i = 0; i < nodes.length; i++) {
			var el = nodes[i]
			var key = el.getAttribute(readKey)
			if (!key) continue
			el.setAttribute(attribute, t(key))
		}
	}

	function apply() {
		var isZh = current === "zh"
		document.documentElement.lang = isZh ? "zh-CN" : "en"
		document.documentElement.setAttribute("data-lang", current)

		document.title = t("meta.title")
		applyAttr("[data-i18n-content]", "content", "data-i18n-content")

		var textNodes = document.querySelectorAll("[data-i18n]")
		for (var i = 0; i < textNodes.length; i++) {
			var node = textNodes[i]
			node.textContent = t(node.getAttribute("data-i18n"))
		}

		var htmlNodes = document.querySelectorAll("[data-i18n-html]")
		for (var j = 0; j < htmlNodes.length; j++) {
			var htmlNode = htmlNodes[j]
			htmlNode.innerHTML = t(htmlNode.getAttribute("data-i18n-html"))
		}

		applyAttr("[data-i18n-title]", "title", "data-i18n-title")
		applyAttr("[data-i18n-alt]", "alt", "data-i18n-alt")
		applyAttr("[data-i18n-aria]", "aria-label", "data-i18n-aria")

		var toggle = document.getElementById("lang-toggle")
		if (toggle) {
			var label = toggle.querySelector(".js-lang-label")
			/* Show the language currently in use; the tooltip advertises the other one. */
			if (label) label.textContent = isZh ? "中文" : "EN"
			toggle.setAttribute("aria-label", t("lang.switchAria"))
			toggle.setAttribute("title", t("lang.switchTitle"))
		}
	}

	function setLang(lang, options) {
		var next = normalize(lang)
		if (!next) return
		current = next
		if (!options || options.persist !== false) {
			try {
				window.localStorage.setItem(STORAGE_KEY, next)
			} catch (e) {
				/* storage disabled */
			}
		}
		apply()
		try {
			window.dispatchEvent(
				new CustomEvent("docs:langchange", { detail: { lang: current } }),
			)
		} catch (e) {
			/* very old browsers */
		}
	}

	function boot() {
		apply()
		var toggle = document.getElementById("lang-toggle")
		if (toggle) {
			toggle.addEventListener("click", function () {
				setLang(current === "zh" ? "en" : "zh")
			})
		}
		document.documentElement.classList.remove(PENDING_CLASS)
	}

	window.DocsI18n = {
		t: t,
		apply: apply,
		setLang: setLang,
		getLang: function () {
			return current
		},
		onChange: function (cb) {
			window.addEventListener("docs:langchange", function (event) {
				cb(event.detail.lang)
			})
		},
	}

	current = detect()

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot)
	} else {
		boot()
	}
})()
