#!/usr/bin/env node

/**
 * scripts/update-readme-release.js
 *
 * Automatically updates README.md with the latest package download matrix
 * and ChangeLog link between the markers:
 * <!-- LATEST_RELEASE_START --> and <!-- LATEST_RELEASE_END -->
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

const pkgPath = path.join(rootDir, "package.json")
const readmePath = path.join(rootDir, "README.md")

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
const currentVersion = pkg.version || "0.1.0"
const appName = pkg.name || "my-agent"
const appTitle = pkg.build?.productName || pkg.productName || "My Agent"
const githubRepo = "kidyfirst/my-agent"

function generateReleaseSection() {
	const v = currentVersion
	const baseUrl = `https://github.com/${githubRepo}/releases/download/v${v}`

	const lines = [
		"<!-- LATEST_RELEASE_START -->",
		"## 📥 客户端下载与版本日志 (ChangeLog)",
		"",
		'<div align="center">',
		"",
		`[![Latest Release](https://img.shields.io/github/v/release/${githubRepo}?color=blue&label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC%20Latest&logo=github)](https://github.com/${githubRepo}/releases/latest)`,
		`[![Downloads](https://img.shields.io/github/downloads/${githubRepo}/total?color=success&label=%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F%20Downloads)](https://github.com/${githubRepo}/releases)`,
		"[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](LICENSE)",
		"[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#全平台客户端下载)",
		"[![ChangeLog](https://img.shields.io/badge/ChangeLog-%E7%89%88%E6%9C%AC%E6%97%A5%E5%BF%97-blueviolet)](https://kidyfirst.github.io/my-agent/changelog.html)",
		"",
		`**当前最新稳定版本：\`v${v}\`**  `,
		`🌐 **[访问官方在线下载站 (GitHub Pages)](https://kidyfirst.github.io/my-agent/)** ｜ 📋 **[查看版本更新日志 (ChangeLog)](https://kidyfirst.github.io/my-agent/changelog.html)** ｜ 📦 **[GitHub Releases 资产归档](https://github.com/${githubRepo}/releases)**`,
		"",
		"</div>",
		"",
		"### 全平台客户端下载",
		"",
		"| 操作系统 / 平台 | 架构 / 适用机型 | 安装包格式 | 直接下载链接 (v" +
			v +
			") | 说明 |",
		"| :--- | :--- | :--- | :--- | :--- |",
		`| 🍏 **macOS** | **Apple Silicon** (M1 / M2 / M3 / M4) | \`.dmg\` 安装镜像 | [my-agent-${v}-mac-arm64.dmg](${baseUrl}/${appName}-${v}-mac-arm64.dmg) | 推荐 Mac 用户首选 |`,
		`| 🍏 **macOS** | **Apple Silicon** (M1 / M2 / M3 / M4) | \`.zip\` 免安装包 | [my-agent-${v}-mac-arm64.zip](${baseUrl}/${appName}-${v}-mac-arm64.zip) | 解压即用 |`,
		`| 🍏 **macOS** | **Intel x86_64** 芯片 | \`.dmg\` 安装镜像 | [my-agent-${v}-mac-x64.dmg](${baseUrl}/${appName}-${v}-mac-x64.dmg) | 适配 Intel 架构 Mac |`,
		`| 🍏 **macOS** | **Intel x86_64** 芯片 | \`.zip\` 免安装包 | [my-agent-${v}-mac-x64.zip](${baseUrl}/${appName}-${v}-mac-x64.zip) | 解压即用 |`,
		`| 🪟 **Windows** | **Windows 10 / 11** (64 位) | \`.exe\` 安装程序 | [my-agent-${v}-win-x64.exe](${baseUrl}/${appName}-${v}-win-x64.exe) | NSIS 引导向导安装 |`,
		`| 🪟 **Windows** | **Windows 10 / 11** (64 位) | \`.zip\` 免安装便携版 | [my-agent-${v}-win-x64.zip](${baseUrl}/${appName}-${v}-win-x64.zip) | 解压即可直接运行 |`,
		`| 🐧 **Linux** | **Linux x86_64** (通用) | \`.AppImage\` 便携镜像 | [my-agent-${v}-linux-x64.AppImage](${baseUrl}/${appName}-${v}-linux-x64.AppImage) | \`chmod +x\` 后直接双击执行 |`,
		`| 🐧 **Linux** | **Debian / Ubuntu / Deepin** | \`.deb\` 系统软件包 | [my-agent-${v}-linux-x64.deb](${baseUrl}/${appName}-${v}-linux-x64.deb) | \`sudo dpkg -i\` 系统级安装 |`,
		`| 🐧 **Linux** | **Linux x86_64** (免安装) | \`.zip\` 压缩归档包 | [my-agent-${v}-linux-x64.zip](${baseUrl}/${appName}-${v}-linux-x64.zip) | 适用于无 root 环境 |`,
		"",
		"> [!IMPORTANT]",
		"> **macOS 首次打开提示“已损坏 / 无法验证开发者”处理方法：**  ",
		"> 由于开源社区版本未购买苹果商业开发者签名证书，macOS Gatekeeper 安全机制在从浏览器下载应用后会附带隔离属性。若首次打开提示“已损坏，应移到废纸篓”或“无法打开”，只需在终端执行一次以下命令解除隔离即可正常打开：",
		"> ```bash",
		`> xattr -cr "/Applications/${appTitle}.app"`,
		"> ```",
		"> 或在系统设置中授权：**【系统设置】->【隐私与安全性】-> 下滑找到并点击【仍要打开】**。",
		"",
		"> [!TIP]",
		`> - 完整更新履历与历史版本详情请参阅 👉 **[在线 ChangeLog 日志](https://kidyfirst.github.io/my-agent/changelog.html)** 或 **[GitHub Releases 全部发布归档](https://github.com/${githubRepo}/releases)**。`,
		"",
		"---",
		"<!-- LATEST_RELEASE_END -->",
	]

	return lines.join("\n")
}

function updateReadme() {
	if (!fs.existsSync(readmePath)) {
		console.error(`README not found at ${readmePath}`)
		process.exit(1)
	}

	let content = fs.readFileSync(readmePath, "utf8")
	const sectionContent = generateReleaseSection()

	const startMarker = "<!-- LATEST_RELEASE_START -->"
	const endMarker = "<!-- LATEST_RELEASE_END -->"

	const startIndex = content.indexOf(startMarker)
	const endIndex = content.indexOf(endMarker)

	if (startIndex !== -1 && endIndex !== -1) {
		// Replace existing block
		content =
			content.substring(0, startIndex) +
			sectionContent +
			content.substring(endIndex + endMarker.length)
		console.log("Updated existing release section in README.md")
	} else {
		// Insert after introductory paragraph (before ## 目录)
		const tocMatch = content.indexOf("## 目录")
		if (tocMatch !== -1) {
			content =
				content.substring(0, tocMatch) +
				sectionContent +
				"\n\n" +
				content.substring(tocMatch)
			console.log(
				"Inserted release section before Table of Contents in README.md",
			)
		} else {
			content = content + "\n\n" + sectionContent + "\n"
			console.log("Appended release section to README.md")
		}
	}

	// Ensure Table of Contents link
	const oldTocRegex = /- \[📥 [^\]]+\]\([^\)]+\)\n(\s+-[^\n]+\n)*/g
	content = content.replace(oldTocRegex, "")

	content = content.replace(
		"## 目录\n\n1. [整体架构设计]",
		"## 目录\n\n- [📥 客户端下载与版本日志 (ChangeLog)](#-客户端下载与版本日志-changelog)\n1. [整体架构设计]",
	)

	fs.writeFileSync(readmePath, content, "utf8")
	console.log(`Successfully updated README.md for version v${currentVersion}!`)
}

updateReadme()
