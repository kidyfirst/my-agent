#!/usr/bin/env node

/**
 * scripts/update-readme-release.js
 *
 * Rewrites the download matrix between the markers
 * <!-- LATEST_RELEASE_START --> and <!-- LATEST_RELEASE_END --> in **every**
 * README edition that carries them — README.md (zh) and README_EN.md (en) — so
 * the English mirror can never advertise an older version than the Chinese one.
 *
 * Editions are discovered rather than hard-coded: adding a README.xx.md with the
 * markers is enough for it to be kept in sync. The language of an edition is
 * read from its own `<html lang>`-ish hint: the file name suffix (EN) first,
 * Chinese otherwise.
 */

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

const pkgPath = path.join(rootDir, "package.json")
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
const targetVersion = process.argv[2]
	? process.argv[2].replace(/^v/, "")
	: pkg.version || "0.1.0"
const appName = pkg.name || "my-agent"
const appTitle = pkg.build?.productName || pkg.productName || "My Agent"
const githubRepo = "kidyfirst/my-agent"

const START = "<!-- LATEST_RELEASE_START -->"
const END = "<!-- LATEST_RELEASE_END -->"

/**
 * One downloadable artifact. Package formats, architectures and file suffixes
 * are language-independent; only the prose is translated.
 */
const ARTIFACTS = [
	{
		platform: "🍏 **macOS**",
		arch: {
			zh: "**Apple Silicon** (M1 / M2 / M3 / M4)",
			en: "**Apple Silicon** (M1 / M2 / M3 / M4)",
		},
		format: { zh: "`.dmg` 安装镜像", en: "`.dmg` installer" },
		suffix: "mac-arm64.dmg",
		note: { zh: "推荐 Mac 用户首选", en: "Recommended for most Macs" },
	},
	{
		platform: "🍏 **macOS**",
		arch: {
			zh: "**Apple Silicon** (M1 / M2 / M3 / M4)",
			en: "**Apple Silicon** (M1 / M2 / M3 / M4)",
		},
		format: { zh: "`.zip` 免安装包", en: "`.zip` portable build" },
		suffix: "mac-arm64.zip",
		note: { zh: "解压即用", en: "Unzip and run" },
	},
	{
		platform: "🍏 **macOS**",
		arch: { zh: "**Intel x86_64** 芯片", en: "**Intel x86_64**" },
		format: { zh: "`.dmg` 安装镜像", en: "`.dmg` installer" },
		suffix: "mac-x64.dmg",
		note: { zh: "适配 Intel 架构 Mac", en: "For Intel-based Macs" },
	},
	{
		platform: "🍏 **macOS**",
		arch: { zh: "**Intel x86_64** 芯片", en: "**Intel x86_64**" },
		format: { zh: "`.zip` 免安装包", en: "`.zip` portable build" },
		suffix: "mac-x64.zip",
		note: { zh: "解压即用", en: "Unzip and run" },
	},
	{
		platform: "🪟 **Windows**",
		arch: {
			zh: "**Windows 10 / 11** (64 位)",
			en: "**Windows 10 / 11** (64-bit)",
		},
		format: { zh: "`.exe` 安装程序", en: "`.exe` installer" },
		suffix: "win-x64.exe",
		note: { zh: "NSIS 引导向导安装", en: "NSIS guided setup" },
	},
	{
		platform: "🪟 **Windows**",
		arch: {
			zh: "**Windows 10 / 11** (64 位)",
			en: "**Windows 10 / 11** (64-bit)",
		},
		format: { zh: "`.zip` 免安装便携版", en: "`.zip` portable build" },
		suffix: "win-x64.zip",
		note: { zh: "解压即可直接运行", en: "Unzip and run" },
	},
	{
		platform: "🐧 **Linux**",
		arch: { zh: "**Linux x86_64** (通用)", en: "**Linux x86_64** (generic)" },
		format: { zh: "`.AppImage` 便携镜像", en: "`.AppImage` portable image" },
		suffix: "linux-x86_64.AppImage",
		note: {
			zh: "`chmod +x` 后直接双击执行",
			en: "`chmod +x`, then run it",
		},
	},
	{
		platform: "🐧 **Linux**",
		arch: {
			zh: "**Debian / Ubuntu / Deepin**",
			en: "**Debian / Ubuntu / Deepin**",
		},
		format: { zh: "`.deb` 系统软件包", en: "`.deb` package" },
		suffix: "linux-amd64.deb",
		note: {
			zh: "`sudo dpkg -i` 系统级安装",
			en: "Install with `sudo dpkg -i`",
		},
	},
]

/** Every string the release block needs, per language. */
function strings(lang, v, baseUrl) {
	const isEn = lang === "en"
	const badges = [
		`[![Latest Release](https://img.shields.io/github/v/release/${githubRepo}?color=blue&label=${
			isEn ? "Latest" : "%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC%20Latest"
		}&logo=github)](https://github.com/${githubRepo}/releases/latest)`,
		`[![Downloads](https://img.shields.io/github/downloads/${githubRepo}/total?color=success&label=${
			isEn ? "Downloads" : "%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F%20Downloads"
		})](https://github.com/${githubRepo}/releases)`,
		"[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](LICENSE)",
		`[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](${
			isEn ? "#downloads-for-all-platforms" : "#全平台客户端下载"
		})`,
		`[![ChangeLog](https://img.shields.io/badge/ChangeLog-${
			isEn ? "notes" : "%E7%89%88%E6%9C%AC%E6%97%A5%E5%BF%97"
		}-blueviolet)](https://kidyfirst.github.io/my-agent/changelog.html)`,
	]

	return {
		title: isEn
			? "## 📥 Client downloads and release notes (ChangeLog)"
			: "## 📥 客户端下载与版本日志 (ChangeLog)",
		badges,
		versionLine: isEn
			? `**Latest stable version: \`v${v}\`**  `
			: `**当前最新稳定版本：\`v${v}\`**  `,
		linksLine: isEn
			? `🌐 **[Official download site (GitHub Pages)](https://kidyfirst.github.io/my-agent/)** ｜ 📋 **[Release notes (ChangeLog)](https://kidyfirst.github.io/my-agent/changelog.html)** ｜ 📦 **[GitHub Releases](https://github.com/${githubRepo}/releases)**`
			: `🌐 **[访问官方在线下载站 (GitHub Pages)](https://kidyfirst.github.io/my-agent/)** ｜ 📋 **[查看版本更新日志 (ChangeLog)](https://kidyfirst.github.io/my-agent/changelog.html)** ｜ 📦 **[GitHub Releases 资产归档](https://github.com/${githubRepo}/releases)**`,
		tableTitle: isEn
			? "### Downloads for all platforms"
			: "### 全平台客户端下载",
		tableHead: isEn
			? `| Platform | Architecture / device | Package | Direct download (v${v}) | Notes |`
			: `| 操作系统 / 平台 | 架构 / 适用机型 | 安装包格式 | 直接下载链接 (v${v}) | 说明 |`,
		important: isEn
			? [
					"> [!IMPORTANT]",
					"> **macOS says the app “is damaged” or “cannot be opened”:**  ",
					"> The community build is not signed with a paid Apple Developer certificate, so Gatekeeper tags everything downloaded through a browser. If the first launch is refused, clear the quarantine flag once:",
					">",
					"> ```bash",
					`> xattr -cr "/Applications/${appTitle}.app"`,
					"> ```",
					">",
					"> Or allow it in System Settings: **System Settings → Privacy & Security → scroll down and click “Open Anyway”**.",
				]
			: [
					"> [!IMPORTANT]",
					"> **macOS 首次打开提示“已损坏 / 无法验证开发者”处理方法：**  ",
					"> 由于开源社区版本未购买苹果商业开发者签名证书，macOS Gatekeeper 安全机制在从浏览器下载应用后会附带隔离属性。若首次打开提示“已损坏，应移到废纸篓”或“无法打开”，只需在终端执行一次以下命令解除隔离即可正常打开：",
					">",
					"> ```bash",
					`> xattr -cr "/Applications/${appTitle}.app"`,
					"> ```",
					">",
					"> 或在系统设置中授权：**【系统设置】->【隐私与安全性】-> 下滑找到并点击【仍要打开】**。",
				],
		tip: isEn
			? [
					"> [!TIP]",
					">",
					`> - Full history and per-version details: 👉 **[online ChangeLog](https://kidyfirst.github.io/my-agent/changelog.html)** or **[all releases on GitHub](https://github.com/${githubRepo}/releases)**.`,
				]
			: [
					"> [!TIP]",
					">",
					`> - 完整更新履历与历史版本详情请参阅 👉 **[在线 ChangeLog 日志](https://kidyfirst.github.io/my-agent/changelog.html)** 或 **[GitHub Releases 全部发布归档](https://github.com/${githubRepo}/releases)**。`,
				],
	}
}

function generateReleaseSection(lang) {
	const v = targetVersion
	const baseUrl = `https://github.com/${githubRepo}/releases/download/v${v}`
	const s = strings(lang, v, baseUrl)

	const rows = ARTIFACTS.map((a) => {
		const file = `${appName}-${v}-${a.suffix}`
		return `| ${a.platform} | ${a.arch[lang] ?? a.arch.zh} | ${a.format[lang] ?? a.format.zh} | [${file}](${baseUrl}/${file}) | ${a.note[lang] ?? a.note.zh} |`
	})

	return [
		START,
		"",
		s.title,
		"",
		'<div align="center">',
		"",
		...s.badges,
		"",
		s.versionLine,
		s.linksLine,
		"",
		"</div>",
		"",
		s.tableTitle,
		"",
		s.tableHead,
		"| :--- | :--- | :--- | :--- | :--- |",
		...rows,
		"",
		...s.important,
		"",
		...s.tip,
		"",
		"---",
		END,
	].join("\n")
}

/** READMEs this script owns, in the order they are updated. */
function editions() {
	return fs
		.readdirSync(rootDir)
		.filter((f) => /^README([._-][A-Za-z-]+)?\.md$/.test(f))
		.sort()
		.map((file) => ({
			file,
			path: path.join(rootDir, file),
			lang: /README[._-](en|EN)/.test(file) ? "en" : "zh",
		}))
}

function updateEdition({ file, path: filePath, lang }) {
	let content = fs.readFileSync(filePath, "utf8")
	const startIndex = content.indexOf(START)
	const endIndex = content.indexOf(END)

	if (startIndex === -1 || endIndex === -1) {
		console.log(`Skipped ${file}: no release markers`)
		return
	}

	content =
		content.substring(0, startIndex) +
		generateReleaseSection(lang) +
		content.substring(endIndex + END.length)

	// Make sure the block is reachable from the table of contents.
	const tocItem =
		lang === "en"
			? "- [📥 Client downloads and release notes (ChangeLog)](#-client-downloads-and-release-notes-changelog)"
			: "- [📥 客户端下载与版本日志 (ChangeLog)](#-客户端下载与版本日志-changelog)"
	const tocHeading = lang === "en" ? "## Table of contents" : "## 目录"
	if (!content.includes(tocItem) && content.includes(tocHeading)) {
		content = content.replace(
			`${tocHeading}\n\n`,
			`${tocHeading}\n\n${tocItem}\n\n`,
		)
	}

	fs.writeFileSync(filePath, content, "utf8")
	console.log(`Updated ${file} for version v${targetVersion}`)
}

const targets = editions().filter((e) => fs.existsSync(e.path))
if (targets.length === 0) {
	console.error("No README found")
	process.exit(1)
}
for (const edition of targets) updateEdition(edition)

/**
 * The generator writes compact tables; this repo keeps its markdown
 * prettier-formatted (aligned pipes, CJK width aware). Running the local binary
 * keeps a release commit free of table-reflow noise — and a checkout without dev
 * dependencies still ends up with a valid, if unaligned, README.
 */
function formatEditions(files) {
	const bin = path.join(
		rootDir,
		"node_modules",
		".bin",
		process.platform === "win32" ? "prettier.cmd" : "prettier",
	)
	if (!fs.existsSync(bin)) {
		console.log("prettier not installed; skipping table alignment")
		return
	}
	try {
		// stderr is piped so a formatting hiccup cannot fail the release script.
		execFileSync(bin, ["--write", ...files], {
			cwd: rootDir,
			stdio: ["ignore", "pipe", "pipe"],
		})
	} catch {
		console.warn("prettier failed; the READMEs are written but unaligned")
	}
}

formatEditions(targets.map((t) => t.path))

/**
 * The GitHub Pages download site carries the version in three "current
 * version" labels and inside every artifact URL, and nothing else rewrites it.
 * Without this step a release leaves the public site advertising the previous
 * build — and linking to files that only exist under the new tag.
 *
 * The patterns are matched rather than the previous version being passed in,
 * so the sync is idempotent and works straight after a version bump.
 */
function syncDocsSite() {
	const filePath = path.join(rootDir, "docs", "index.html")
	if (!fs.existsSync(filePath)) {
		console.log("Skipped docs/index.html: not found")
		return
	}
	const before = fs.readFileSync(filePath, "utf8")
	const after = before
		.replace(
			// `v<semver>/my-agent-<semver>-<suffix>`: the version appears twice
			// per URL. Only the numbers are matched — a looser `[^/"]+` would
			// swallow the platform prefix too ("mac-arm64.dmg" → "arm64.dmg").
			new RegExp(`releases/download/v[\\d.]+/${appName}-[\\d.]+-`, "g"),
			`releases/download/v${targetVersion}/${appName}-${targetVersion}-`,
		)
		.replace(/(class="js-version-tag">)v[^<]*(<)/g, `$1v${targetVersion}$2`)
	if (after === before) {
		console.log(`docs/index.html already at v${targetVersion}`)
		return
	}
	fs.writeFileSync(filePath, after, "utf8")
	console.log(`Updated docs/index.html to v${targetVersion}`)
}

syncDocsSite()

// Also ensure package.json version is synced if CLI passed a version
if (pkg.version !== targetVersion && process.argv[2]) {
	pkg.version = targetVersion
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n", "utf8")
	console.log(`Updated package.json version to ${targetVersion}`)
}

console.log(
	`Done: ${targets.map((t) => t.file).join(", ")} at v${targetVersion}`,
)
