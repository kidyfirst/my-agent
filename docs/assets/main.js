/**
 * MyAgent - Official Landing & Download Page Client Script
 * Handles OS & Architecture detection, GitHub Releases API integration,
 * dynamic download button updating, and clipboard utilities.
 */

;(function () {
	"use strict"

	const GITHUB_REPO = "kidyfirst/my-agent"
	const DEFAULT_VERSION = "v1.0.0"
	const BASE_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases`

	// Fallback direct download links if GitHub API is unreachable or before first release tag
	const FALLBACK_ASSETS = {
		macArmDmg: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-1.0.0-mac-arm64.dmg`,
		macArmZip: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-1.0.0-mac-arm64.zip`,
		macX64Dmg: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-1.0.0-mac-x64.dmg`,
		macX64Zip: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-1.0.0-mac-x64.zip`,
	}

	/**
	 * Detect client Operating System and CPU Architecture
	 */
	function detectClientPlatform() {
		const ua = navigator.userAgent || ""
		const platform = navigator.platform || ""

		let os = "other"
		let arch = "unknown"

		if (
			/Macintosh|MacIntel|MacPPC|Mac68K/i.test(platform) ||
			/Mac OS X/i.test(ua)
		) {
			os = "mac"
			// Detect Apple Silicon vs Intel
			// Check for Apple GPU via WebGL
			try {
				const canvas = document.createElement("canvas")
				const gl =
					canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
				if (gl) {
					const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
					if (debugInfo) {
						const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
						if (/Apple/i.test(renderer) && !/Intel/i.test(renderer)) {
							arch = "arm64"
						} else if (/Intel/i.test(renderer)) {
							arch = "x64"
						}
					}
				}
			} catch (e) {
				// Fallback
			}

			// If still unknown on modern Mac, arm64 (M1/M2/M3/M4) is modern default
			if (arch === "unknown") {
				arch = "arm64"
			}
		} else if (
			/Win32|Win64|Windows|WinCE/i.test(platform) ||
			/Windows/i.test(ua)
		) {
			os = "windows"
			arch = "x64"
		} else if (/Linux/i.test(platform) || /Linux/i.test(ua)) {
			os = "linux"
			arch = "x64"
		}

		return { os, arch }
	}

	/**
	 * Format file size in bytes to human readable MB
	 */
	function formatBytes(bytes) {
		if (!bytes || isNaN(bytes)) return ""
		const mb = bytes / (1024 * 1024)
		return `${mb.toFixed(1)} MB`
	}

	/**
	 * Format ISO date string into YYYY-MM-DD
	 */
	function formatDate(isoStr) {
		if (!isoStr) return ""
		try {
			const d = new Date(isoStr)
			return d.toISOString().split("T")[0]
		} catch (e) {
			return ""
		}
	}

	/**
	 * Fetch latest release details from GitHub API
	 */
	async function fetchLatestRelease() {
		try {
			const response = await fetch(
				`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
				{
					headers: { Accept: "application/vnd.github.v3+json" },
				},
			)

			if (!response.ok) {
				throw new Error(`GitHub API returned status ${response.status}`)
			}

			const data = await response.json()
			return data
		} catch (err) {
			console.warn(
				"Could not fetch latest release from GitHub API:",
				err.message,
			)
			return null
		}
	}

	/**
	 * Map assets from release data to our standard targets
	 */
	function parseReleaseAssets(release) {
		const mapped = {
			tag: release ? release.tag_name : DEFAULT_VERSION,
			date: release ? formatDate(release.published_at) : "2026-10-26",
			assets: {
				macArmDmg: { url: FALLBACK_ASSETS.macArmDmg, size: "" },
				macArmZip: { url: FALLBACK_ASSETS.macArmZip, size: "" },
				macX64Dmg: { url: FALLBACK_ASSETS.macX64Dmg, size: "" },
				macX64Zip: { url: FALLBACK_ASSETS.macX64Zip, size: "" },
				winExe: { url: "", size: "" },
				winZip: { url: "", size: "" },
				linuxAppImage: { url: "", size: "" },
				linuxDeb: { url: "", size: "" },
			},
		}

		if (release && Array.isArray(release.assets)) {
			for (const asset of release.assets) {
				const name = asset.name.toLowerCase()
				const info = {
					url: asset.browser_download_url,
					size: formatBytes(asset.size),
				}

				if (name.includes("mac") || name.endsWith(".dmg")) {
					if (name.includes("arm64") && name.endsWith(".dmg")) {
						mapped.assets.macArmDmg = info
					} else if (name.includes("arm64") && name.endsWith(".zip")) {
						mapped.assets.macArmZip = info
					} else if (
						(name.includes("x64") || name.includes("intel")) &&
						name.endsWith(".dmg")
					) {
						mapped.assets.macX64Dmg = info
					} else if (
						(name.includes("x64") || name.includes("intel")) &&
						name.endsWith(".zip")
					) {
						mapped.assets.macX64Zip = info
					}
				} else if (name.endsWith(".exe")) {
					mapped.assets.winExe = info
				} else if (name.includes("win") && name.endsWith(".zip")) {
					mapped.assets.winZip = info
				} else if (name.endsWith(".appimage")) {
					mapped.assets.linuxAppImage = info
				} else if (name.endsWith(".deb")) {
					mapped.assets.linuxDeb = info
				}
			}
		}

		return mapped
	}

	/**
	 * Initialize download buttons and platform matrix
	 */
	async function init() {
		const client = detectClientPlatform()
		const releaseData = await fetchLatestRelease()
		const release = parseReleaseAssets(releaseData)

		// Update version badge
		const versionBadges = document.querySelectorAll(".js-version-tag")
		versionBadges.forEach((el) => {
			el.textContent = release.tag
		})

		const dateBadges = document.querySelectorAll(".js-release-date")
		dateBadges.forEach((el) => {
			el.textContent = release.date
		})

		// Update matrix download links
		const setLink = (id, assetInfo) => {
			const btn = document.getElementById(id)
			if (btn && assetInfo && assetInfo.url) {
				btn.href = assetInfo.url
				const sizeEl = btn.querySelector(".js-asset-size")
				if (sizeEl && assetInfo.size) {
					sizeEl.textContent = `(${assetInfo.size})`
				}
			}
		}

		setLink("btn-mac-arm-dmg", release.assets.macArmDmg)
		setLink("btn-mac-arm-zip", release.assets.macArmZip)
		setLink("btn-mac-x64-dmg", release.assets.macX64Dmg)
		setLink("btn-mac-x64-zip", release.assets.macX64Zip)
		setLink("btn-win-exe", release.assets.winExe)
		setLink("btn-win-zip", release.assets.winZip)
		setLink("btn-linux-appimage", release.assets.linuxAppImage)
		setLink("btn-linux-deb", release.assets.linuxDeb)

		// Setup Primary Hero CTA based on detected client
		const heroBtn = document.getElementById("hero-download-btn")
		const heroTip = document.getElementById("hero-os-tip")

		if (heroBtn && heroTip) {
			if (client.os === "mac") {
				if (client.arch === "arm64") {
					heroBtn.href = release.assets.macArmDmg.url
					heroBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.79 1.06-1.88.94-2.98-.94.04-2.07.63-2.73 1.4-.58.67-1.09 1.76-.95 2.84 1.05.08 2.12-.53 2.74-1.26z"/></svg>
            <span>下载 macOS 版 (${release.tag})</span>
          `
					heroTip.innerHTML = `已自动适配 <strong>Apple Silicon (M1/M2/M3/M4)</strong> · <a href="#downloads">查看所有平台与格式</a>`
					highlightPlatformCard("platform-mac-arm")
				} else {
					heroBtn.href = release.assets.macX64Dmg.url
					heroBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.79 1.06-1.88.94-2.98-.94.04-2.07.63-2.73 1.4-.58.67-1.09 1.76-.95 2.84 1.05.08 2.12-.53 2.74-1.26z"/></svg>
            <span>下载 macOS Intel 版 (${release.tag})</span>
          `
					heroTip.innerHTML = `已自动适配 <strong>Intel 处理器</strong> · <a href="#downloads">查看所有平台与格式</a>`
					highlightPlatformCard("platform-mac-x64")
				}
			} else if (client.os === "windows") {
				heroBtn.href = release.assets.winExe.url || "#downloads"
				heroBtn.innerHTML = `<span>下载 Windows 版 (${release.tag})</span>`
				heroTip.innerHTML = `已自动适配 <strong>Windows 64位</strong> · <a href="#downloads">查看所有平台与格式</a>`
				highlightPlatformCard("platform-win")
			} else if (client.os === "linux") {
				heroBtn.href = release.assets.linuxAppImage.url || "#downloads"
				heroBtn.innerHTML = `<span>下载 Linux 版 (${release.tag})</span>`
				heroTip.innerHTML = `已自动适配 <strong>Linux x64</strong> · <a href="#downloads">查看所有平台与格式</a>`
				highlightPlatformCard("platform-linux")
			} else {
				heroBtn.href = "#downloads"
				heroBtn.innerHTML = `<span>立即下载 MyAgent (${release.tag})</span>`
				heroTip.innerHTML = `请在下方选择适合您的操作系统版本`
			}
		}

		// Setup Clipboard Button
		const copyBtn = document.getElementById("copy-cmd-btn")
		if (copyBtn) {
			copyBtn.addEventListener("click", () => {
				const cmd = "xattr -cr /Applications/MyAgent.app"
				navigator.clipboard.writeText(cmd).then(() => {
					const originalText = copyBtn.textContent
					copyBtn.textContent = "已复制!"
					copyBtn.style.color = "#34d399"
					setTimeout(() => {
						copyBtn.textContent = originalText
						copyBtn.style.color = ""
					}, 2000)
				})
			})
		}
	}

	function highlightPlatformCard(cardId) {
		const card = document.getElementById(cardId)
		if (card) {
			card.classList.add("highlight")
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init)
	} else {
		init()
	}
})()
