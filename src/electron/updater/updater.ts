import { app, shell, BrowserWindow } from "electron"
import fs from "node:fs"
import path from "node:path"
import https from "node:https"
import http from "node:http"
import yaml from "js-yaml"
import { safeSend } from "../helpers.js"

export interface UpdateInfo {
	hasUpdate: boolean
	currentVersion: string
	latestVersion?: string
	releaseName?: string
	releaseNotes?: string
	downloadUrl?: string
	fileName?: string
	publishedAt?: string
	error?: string
}

export interface DownloadProgress {
	percent: number
	downloadedBytes: number
	totalBytes: number
}

const GITHUB_REPO = "kidyfirst/my-agent"

/**
 * Compare two semantic version strings (e.g. "1.0.1" vs "1.0.0", or with "v" prefix)
 */
export function isNewerVersion(latest: string, current: string): boolean {
	const parse = (v: string) =>
		v
			.replace(/^v/i, "")
			.trim()
			.split(".")
			.map((n) => parseInt(n, 10) || 0)

	const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest)
	const [cMaj = 0, cMin = 0, cPat = 0] = parse(current)

	if (lMaj > cMaj) return true
	if (lMaj < cMaj) return false
	if (lMin > cMin) return true
	if (lMin < cMin) return false
	return lPat > cPat
}

/**
 * Find matching asset in release asset list for the current platform and architecture
 */
export function findMatchingAsset(
	assets: Array<{ name: string; browser_download_url: string; size: number }>,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
): { downloadUrl: string; fileName: string } | null {
	if (!Array.isArray(assets) || assets.length === 0) return null

	const isMac = platform === "darwin"
	const isWin = platform === "win32"
	const isLinux = platform === "linux"
	const isArm64 = arch === "arm64"

	if (isMac) {
		// Prefer dmg for arm64 or x64
		const dmgAssets = assets.filter((a) =>
			a.name.toLowerCase().endsWith(".dmg"),
		)
		if (isArm64) {
			const armDmg = dmgAssets.find((a) =>
				a.name.toLowerCase().includes("arm64"),
			)
			if (armDmg)
				return {
					downloadUrl: armDmg.browser_download_url,
					fileName: armDmg.name,
				}
		} else {
			const x64Dmg = dmgAssets.find(
				(a) =>
					a.name.toLowerCase().includes("x64") ||
					a.name.toLowerCase().includes("intel"),
			)
			if (x64Dmg)
				return {
					downloadUrl: x64Dmg.browser_download_url,
					fileName: x64Dmg.name,
				}
		}
		// If specific arch dmg not found, any dmg
		if (dmgAssets[0]) {
			return {
				downloadUrl: dmgAssets[0].browser_download_url,
				fileName: dmgAssets[0].name,
			}
		}
		// Fallback to zip
		const zipAsset = assets.find(
			(a) =>
				a.name.toLowerCase().endsWith(".zip") &&
				(isArm64 ? a.name.includes("arm64") : a.name.includes("x64")),
		)
		if (zipAsset)
			return {
				downloadUrl: zipAsset.browser_download_url,
				fileName: zipAsset.name,
			}
	} else if (isWin) {
		const exe = assets.find((a) => a.name.toLowerCase().endsWith(".exe"))
		if (exe)
			return { downloadUrl: exe.browser_download_url, fileName: exe.name }
	} else if (isLinux) {
		const appImage = assets.find((a) =>
			a.name.toLowerCase().endsWith(".appimage"),
		)
		if (appImage)
			return {
				downloadUrl: appImage.browser_download_url,
				fileName: appImage.name,
			}
		const deb = assets.find((a) => a.name.toLowerCase().endsWith(".deb"))
		if (deb)
			return { downloadUrl: deb.browser_download_url, fileName: deb.name }
	}

	return null
}

/**
 * Fallback to check update using raw electron-builder manifest (latest-*.yml)
 * hosted directly on GitHub Releases assets. This endpoint has NO GitHub API rate limits.
 */
export async function checkUpdatesFromReleaseManifest(
	currentVersion: string,
): Promise<UpdateInfo> {
	const platformYml =
		process.platform === "darwin"
			? "latest-mac.yml"
			: process.platform === "win32"
				? "latest.yml"
				: "latest-linux.yml"

	const ymlUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/${platformYml}`
	const res = await fetch(ymlUrl)
	if (!res.ok) {
		return { hasUpdate: false, currentVersion }
	}

	const text = await res.text()
	const parsed = yaml.load(text) as {
		version: string
		files?: Array<{ url: string; size: number }>
		releaseDate?: string
	}

	if (!parsed?.version) {
		return { hasUpdate: false, currentVersion }
	}

	const latestVersion = parsed.version.replace(/^v/i, "").trim()
	if (!isNewerVersion(latestVersion, currentVersion)) {
		return { hasUpdate: false, currentVersion, latestVersion }
	}

	// Match asset for the current OS and architecture
	let fileName = ""
	const files = parsed.files?.map((f) => f.url) || []
	const isArm64 = process.arch === "arm64"

	if (process.platform === "darwin") {
		const dmgFiles = files.filter((f) => f.endsWith(".dmg"))
		const matchedDmg = isArm64
			? dmgFiles.find((f) => f.includes("arm64"))
			: dmgFiles.find((f) => f.includes("x64") || f.includes("intel"))
		fileName =
			matchedDmg ||
			dmgFiles[0] ||
			files.find(
				(f) =>
					f.endsWith(".zip") &&
					(isArm64 ? f.includes("arm64") : f.includes("x64")),
			) ||
			`my-agent-${latestVersion}-mac-${process.arch}.dmg`
	} else if (process.platform === "win32") {
		fileName =
			files.find((f) => f.endsWith(".exe")) ||
			files.find((f) => f.endsWith(".zip")) ||
			`my-agent-${latestVersion}-win-x64.exe`
	} else {
		fileName =
			files.find((f) => f.endsWith(".AppImage")) ||
			files.find((f) => f.endsWith(".deb")) ||
			`my-agent-${latestVersion}-linux-x64.AppImage`
	}

	const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${latestVersion}/${fileName}`

	return {
		hasUpdate: true,
		currentVersion,
		latestVersion,
		releaseName: `v${latestVersion}`,
		releaseNotes: `版本 v${latestVersion} 现已发布，包含全平台安装包及功能更新。`,
		downloadUrl,
		fileName,
		publishedAt: parsed.releaseDate,
	}
}

/**
 * Check GitHub Releases for newer version of the application
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
	const currentVersion = app?.getVersion?.() || "1.0.0"

	try {
		const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
		const res = await fetch(url, {
			headers: {
				"User-Agent": `MyAgent-App/${currentVersion}`,
				Accept: "application/vnd.github.v3+json",
			},
		})

		if (!res.ok) {
			if (res.status === 403 || res.status >= 500) {
				console.warn(
					`[Updater] GitHub API returned HTTP ${res.status}, falling back to static release manifest...`,
				)
				return await checkUpdatesFromReleaseManifest(currentVersion)
			}
			if (res.status === 404) {
				return { hasUpdate: false, currentVersion }
			}
			throw new Error(`GitHub API returned HTTP ${res.status}`)
		}

		const data = (await res.json()) as {
			tag_name: string
			name?: string
			body?: string
			html_url: string
			published_at?: string
			assets: Array<{
				name: string
				browser_download_url: string
				size: number
			}>
		}

		const latestTag = data.tag_name || ""
		const latestVersion = latestTag.replace(/^v/i, "").trim()

		if (!isNewerVersion(latestVersion, currentVersion)) {
			return { hasUpdate: false, currentVersion, latestVersion }
		}

		const match = findMatchingAsset(data.assets)
		const downloadUrl = match ? match.downloadUrl : data.html_url
		const fileName =
			match?.fileName || `my-agent-${latestVersion}-${process.platform}.dmg`

		return {
			hasUpdate: true,
			currentVersion,
			latestVersion,
			releaseName: data.name,
			releaseNotes: data.body,
			downloadUrl,
			fileName,
			publishedAt: data.published_at,
		}
	} catch (err: any) {
		console.warn(
			"[Updater] Check for updates via API failed, attempting static manifest fallback:",
			err.message,
		)
		try {
			return await checkUpdatesFromReleaseManifest(currentVersion)
		} catch (fallbackErr: any) {
			console.warn(
				"[Updater] Fallback manifest check also failed:",
				fallbackErr.message,
			)
			return { hasUpdate: false, currentVersion, error: err.message }
		}
	}
}

/**
 * Download a file with redirect follow and progress updates
 */
function downloadFileWithProgress(
	fileUrl: string,
	targetPath: string,
	onProgress: (progress: DownloadProgress) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(fileUrl)
		const requestModule = parsedUrl.protocol === "http:" ? http : https

		const makeRequest = (targetUrl: string) => {
			const req = requestModule.get(
				targetUrl,
				{
					headers: {
						"User-Agent": "MyAgent-App",
					},
				},
				(res) => {
					// Follow 301/302/307/308 redirects
					if (
						(res.statusCode === 301 ||
							res.statusCode === 302 ||
							res.statusCode === 307 ||
							res.statusCode === 308) &&
						res.headers.location
					) {
						res.resume()
						const redirectUrl = new URL(
							res.headers.location,
							targetUrl,
						).toString()
						makeRequest(redirectUrl)
						return
					}

					if (res.statusCode && res.statusCode >= 400) {
						reject(new Error(`Server returned HTTP ${res.statusCode}`))
						return
					}

					const totalBytes = Number(res.headers["content-length"]) || 0
					let downloadedBytes = 0

					const fileStream = fs.createWriteStream(targetPath)

					res.on("data", (chunk: Buffer) => {
						downloadedBytes += chunk.length
						const percent =
							totalBytes > 0
								? Math.min(
										100,
										Math.round((downloadedBytes / totalBytes) * 100),
									)
								: 0
						onProgress({ percent, downloadedBytes, totalBytes })
					})

					res.pipe(fileStream)

					fileStream.on("finish", () => {
						fileStream.close((err) => {
							if (err) reject(err)
							else resolve()
						})
					})

					fileStream.on("error", (err) => {
						fs.unlink(targetPath, () => {})
						reject(err)
					})
				},
			)

			req.on("error", (err) => {
				fs.unlink(targetPath, () => {})
				reject(err)
			})
		}

		makeRequest(fileUrl)
	})
}

/**
 * Download the latest installer and launch it
 */
export async function downloadAndInstallUpdate(
	downloadUrl: string,
	fileName: string,
	window: BrowserWindow | null,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	if (!downloadUrl) {
		throw new Error("No download URL provided")
	}

	// If downloadUrl is a webpage, simply open in browser
	if (!downloadUrl.includes("/releases/download/")) {
		await shell.openExternal(downloadUrl)
		return { success: true }
	}

	const safeName =
		fileName ||
		path.basename(new URL(downloadUrl).pathname) ||
		"my-agent-update"
	const downloadsDir = app.getPath("downloads") || app.getPath("temp")
	const targetPath = path.join(downloadsDir, safeName)

	try {
		await downloadFileWithProgress(downloadUrl, targetPath, (progress) => {
			if (window && !window.isDestroyed()) {
				safeSend(window, "harness:event", {
					type: "update_download_progress",
					percent: progress.percent,
					downloadedBytes: progress.downloadedBytes,
					totalBytes: progress.totalBytes,
				})
			}
		})

		if (window && !window.isDestroyed()) {
			safeSend(window, "harness:event", {
				type: "update_download_complete",
				filePath: targetPath,
				fileName: safeName,
			})
		}

		// Open installer directly (on macOS this mounts the .dmg and shows Finder)
		await shell.openPath(targetPath)

		return { success: true, filePath: targetPath }
	} catch (err: any) {
		console.error("[Updater] Download and install failed:", err)
		if (window && !window.isDestroyed()) {
			safeSend(window, "harness:event", {
				type: "update_download_error",
				error: err.message,
			})
		}
		return { success: false, error: err.message }
	}
}
