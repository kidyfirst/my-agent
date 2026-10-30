/**
 * My Agent - Official Landing & Download Page Client Script
 * Handles OS & Architecture detection, GitHub Releases API integration,
 * dynamic download button updating, and clipboard utilities.
 */

;(function () {
	"use strict"

	const GITHUB_REPO = "kidyfirst/my-agent"
	const DEFAULT_VERSION = "v0.1.1"
	const BASE_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases`
	const I18N = window.DocsI18n

	// OS glyphs used by the primary hero CTA
	const OS_ICONS = {
		mac: "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.79 1.06-1.88.94-2.98-.94.04-2.07.63-2.73 1.4-.58.67-1.09 1.76-.95 2.84 1.05.08 2.12-.53 2.74-1.26z",
		windows:
			"M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.801",
		linux:
			"M12.003 0c-2.457 0-4.043 1.942-4.043 4.398 0 1.259.452 2.738.995 4.093-1.09.432-2.179 1.144-2.846 2.052-.906 1.233-.872 2.651-.872 4.148 0 1.559.39 3.275 1.579 4.35 1.05.947 2.502 1.344 3.904 1.488.47.781 1.096 1.493 1.83 2.087-.456.195-.916.353-1.378.48-1.095.302-2.146.402-2.91.564-.468.099-.54.34-.343.606.336.453 1.27.734 2.215.734 1.844 0 3.864-.897 5.029-2.122 1.165 1.225 3.185 2.122 5.029 2.122.945 0 1.879-.281 2.215-.734.197-.266.125-.507-.343-.606-.764-.162-1.815-.262-2.91-.564-.462-.127-.922-.285-1.378-.48.734-.594 1.36-1.306 1.83-2.087 1.402-.144 2.854-.541 3.904-1.488 1.189-1.075 1.579-2.791 1.579-4.35 0-1.497.034-2.915-.872-4.148-.667-.908-1.756-1.62-2.846-2.052.543-1.355.995-2.834.995-4.093C16.046 1.942 14.46 0 12.003 0z",
	}

	// Fallback direct download links for v0.1.1
	const FALLBACK_ASSETS = {
		macArmDmg: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-mac-arm64.dmg`,
		macArmZip: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-mac-arm64.zip`,
		macX64Dmg: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-mac-x64.dmg`,
		macX64Zip: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-mac-x64.zip`,
		winExe: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-win-x64.exe`,
		winZip: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-win-x64.zip`,
		linuxAppImage: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-linux-x86_64.AppImage`,
		linuxDeb: `${BASE_RELEASE_URL}/download/${DEFAULT_VERSION}/my-agent-0.1.1-linux-amd64.deb`,
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
			// Detect Apple Silicon vs Intel via WebGL unmasked renderer
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

			// If still unknown on modern Mac, arm64 (M1/M2/M3/M4) is default
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
				"Could not fetch latest release from GitHub API, using fallback:",
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
				macArmDmg: { url: FALLBACK_ASSETS.macArmDmg, size: "146.9 MB" },
				macArmZip: { url: FALLBACK_ASSETS.macArmZip, size: "140.3 MB" },
				macX64Dmg: { url: FALLBACK_ASSETS.macX64Dmg, size: "152.5 MB" },
				macX64Zip: { url: FALLBACK_ASSETS.macX64Zip, size: "145.8 MB" },
				winExe: { url: FALLBACK_ASSETS.winExe, size: "117.1 MB" },
				winZip: { url: FALLBACK_ASSETS.winZip, size: "164.4 MB" },
				linuxAppImage: { url: FALLBACK_ASSETS.linuxAppImage, size: "151.5 MB" },
				linuxDeb: { url: FALLBACK_ASSETS.linuxDeb, size: "110.9 MB" },
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

		// Setup Primary Hero CTA based on detected client.
		// Only the icon, the i18n key and the target link change here; the copy
		// itself is resolved by i18n.js so it follows the language switch.
		const heroBtn = document.getElementById("hero-download-btn")
		const heroTip = document.getElementById("hero-os-tip")

		if (heroBtn && heroTip) {
			const heroLabel = heroBtn.querySelector(".js-hero-label")
			const heroIcon = heroBtn.querySelector(".js-os-icon")

			const applyHero = ({ href, labelKey, iconPath, tipKey, cardId }) => {
				if (href) heroBtn.href = href
				if (heroLabel && labelKey) heroLabel.setAttribute("data-i18n", labelKey)
				if (heroIcon && iconPath) heroIcon.innerHTML = `<path d="${iconPath}"/>`
				if (tipKey) heroTip.setAttribute("data-i18n-html", tipKey)
				if (I18N) {
					I18N.apply()
				} else if (heroLabel && labelKey) {
					heroLabel.textContent = heroLabel.textContent
				}
				if (cardId) highlightPlatformCard(cardId)
			}

			if (client.os === "mac") {
				if (client.arch === "arm64") {
					applyHero({
						href: release.assets.macArmDmg.url,
						labelKey: "hero.ctaMacArm",
						iconPath: OS_ICONS.mac,
						tipKey: "hero.tipMacArm",
						cardId: "platform-mac-arm",
					})
				} else {
					applyHero({
						href: release.assets.macX64Dmg.url,
						labelKey: "hero.ctaMacX64",
						iconPath: OS_ICONS.mac,
						tipKey: "hero.tipMacX64",
						cardId: "platform-mac-x64",
					})
				}
			} else if (client.os === "windows") {
				applyHero({
					href: release.assets.winExe.url || "#downloads",
					labelKey: "hero.ctaWin",
					iconPath: OS_ICONS.windows,
					tipKey: "hero.tipWin",
					cardId: "platform-win",
				})
			} else if (client.os === "linux") {
				applyHero({
					href: release.assets.linuxAppImage.url || "#downloads",
					labelKey: "hero.ctaLinux",
					iconPath: OS_ICONS.linux,
					tipKey: "hero.tipLinux",
					cardId: "platform-linux",
				})
			} else {
				applyHero({
					href: "#downloads",
					labelKey: "hero.cta",
					tipKey: "hero.tipOther",
				})
			}
		}

		// Setup Clipboard Button
		const copyBtn = document.getElementById("copy-cmd-btn")
		if (copyBtn) {
			copyBtn.addEventListener("click", () => {
				const cmd = 'xattr -cr "/Applications/My Agent.app"'
				navigator.clipboard.writeText(cmd).then(() => {
					copyBtn.textContent = I18N ? I18N.t("guide.copied") : "已复制!"
					copyBtn.style.color = "#34d399"
					setTimeout(() => {
						if (I18N) {
							/* Re-resolve from the dictionary so the label matches the current language */
							I18N.apply()
						} else {
							copyBtn.textContent = "复制命令"
						}
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
