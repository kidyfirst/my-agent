import path from "node:path"
import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { getAppDataDir } from "../utils/project.js"

export interface AssetMetadata {
	assetId: string
	filename: string
	mimeType: string
	size: number
	path: string
	url: string
}

export interface SaveAssetOptions {
	filename?: string
	mimeType?: string
	projectRoot?: string
	assetId?: string
}

export class AssetManager {
	/**
	 * Get the assets storage directory.
	 * Prefers `<projectRoot>/.myagent/assets`.
	 * Fallback to `<getAppDataDir()>/assets`.
	 */
	static getAssetsDir(projectRoot?: string): string {
		let dir: string
		if (projectRoot && fs.existsSync(projectRoot)) {
			dir = path.join(projectRoot, ".myagent", "assets")
			AssetManager.ensureGitignore(path.join(projectRoot, ".myagent"))
		} else {
			dir = path.join(getAppDataDir(), "assets")
		}

		if (!fs.existsSync(dir)) {
			try {
				fs.mkdirSync(dir, { recursive: true })
			} catch {}
		}
		return dir
	}

	/**
	 * Ensure .myagent/.gitignore ignores assets/
	 */
	private static ensureGitignore(myagentDir: string) {
		try {
			if (!fs.existsSync(myagentDir)) {
				fs.mkdirSync(myagentDir, { recursive: true })
			}
			const gitignorePath = path.join(myagentDir, ".gitignore")
			if (!fs.existsSync(gitignorePath)) {
				fs.writeFileSync(gitignorePath, "assets/\n", "utf-8")
			} else {
				const content = fs.readFileSync(gitignorePath, "utf-8")
				if (!content.includes("assets")) {
					fs.appendFileSync(gitignorePath, "\nassets/\n", "utf-8")
				}
			}
		} catch {}
	}

	/**
	 * Guess file extension from filename or MIME type.
	 */
	static getExtension(filename?: string, mimeType?: string): string {
		if (filename && filename.includes(".")) {
			const ext = path.extname(filename).toLowerCase().replace(/^\./, "")
			if (ext) return ext
		}
		if (mimeType) {
			const lower = mimeType.toLowerCase()
			if (lower === "image/png") return "png"
			if (lower === "image/jpeg" || lower === "image/jpg") return "jpg"
			if (lower === "image/gif") return "gif"
			if (lower === "image/webp") return "webp"
			if (lower === "image/svg+xml") return "svg"
			if (lower === "text/plain") return "txt"
			if (lower === "application/json") return "json"
			if (lower === "application/pdf") return "pdf"
		}
		return "bin"
	}

	/**
	 * Save an asset (base64 string or Buffer) to `.myagent/assets`.
	 */
	static async saveAsset(
		data: string | Buffer,
		options: SaveAssetOptions = {},
	): Promise<AssetMetadata> {
		const assetId =
			options.assetId || `ast_${randomUUID().replace(/-/g, "").slice(0, 12)}`
		let rawMime = options.mimeType
		let buffer: Buffer

		if (Buffer.isBuffer(data)) {
			buffer = data
		} else if (typeof data === "string") {
			if (data.startsWith("data:")) {
				const commaIdx = data.indexOf(",")
				const metaPart = data.slice(5, commaIdx)
				const base64Part = data.slice(commaIdx + 1)
				if (!rawMime) {
					rawMime = metaPart.split(";")[0]
				}
				buffer = Buffer.from(base64Part, "base64")
			} else {
				// Raw base64 string
				buffer = Buffer.from(data, "base64")
			}
		} else {
			buffer = Buffer.from("")
		}

		const ext = AssetManager.getExtension(options.filename, rawMime)
		const filename = options.filename || `${assetId}.${ext}`
		const mimeType =
			rawMime ||
			(ext === "png"
				? "image/png"
				: ext === "jpg"
					? "image/jpeg"
					: "application/octet-stream")
		const size = buffer.length

		const targetDir = AssetManager.getAssetsDir(options.projectRoot)
		const targetFile = path.join(targetDir, `${assetId}.${ext}`)

		await fs.promises.writeFile(targetFile, buffer)

		// Calculate relative path for portability if in project root
		let storedPath = targetFile
		if (options.projectRoot && targetFile.startsWith(options.projectRoot)) {
			storedPath = path.relative(options.projectRoot, targetFile)
		}

		return {
			assetId,
			filename,
			mimeType,
			size,
			path: storedPath,
			url: `myagent-asset://${assetId}.${ext}`,
		}
	}

	/**
	 * Resolve an asset ID to its physical file path.
	 * Checks project directory first, then global app data directory.
	 */
	static resolveAssetPath(
		assetId: string,
		projectRoot?: string,
	): string | null {
		if (!assetId) return null
		const baseName = assetId.includes(".") ? assetId : `${assetId}`

		// Directories to check
		const dirsToCheck: string[] = []
		if (projectRoot) {
			dirsToCheck.push(path.join(projectRoot, ".myagent", "assets"))
		}
		dirsToCheck.push(path.join(getAppDataDir(), "assets"))

		for (const dir of dirsToCheck) {
			if (!fs.existsSync(dir)) continue

			// Direct match with extension
			const directPath = path.join(dir, baseName)
			if (fs.existsSync(directPath)) {
				return directPath
			}

			// Prefix match (if assetId has no extension)
			try {
				const files = fs.readdirSync(dir)
				const matched = files.find(
					(f) => f === assetId || f.startsWith(`${assetId}.`),
				)
				if (matched) {
					return path.join(dir, matched)
				}
			} catch {}
		}

		return null
	}

	/**
	 * Retrieve asset metadata and content.
	 */
	static async getAsset(
		assetId: string,
		projectRoot?: string,
	): Promise<{
		assetId: string
		filePath: string
		filename: string
		mimeType: string
		size: number
		buffer: Buffer
		base64: string
		text?: string
	} | null> {
		const filePath = AssetManager.resolveAssetPath(assetId, projectRoot)
		if (!filePath) return null

		try {
			const stat = await fs.promises.stat(filePath)
			const buffer = await fs.promises.readFile(filePath)
			const filename = path.basename(filePath)
			const ext = path.extname(filename).replace(/^\./, "").toLowerCase()
			let mimeType = "application/octet-stream"
			if (ext === "png") mimeType = "image/png"
			else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg"
			else if (ext === "gif") mimeType = "image/gif"
			else if (ext === "webp") mimeType = "image/webp"
			else if (ext === "svg") mimeType = "image/svg+xml"
			else if (
				ext === "txt" ||
				ext === "md" ||
				ext === "ts" ||
				ext === "js" ||
				ext === "json"
			)
				mimeType = "text/plain"

			const base64 = buffer.toString("base64")
			let text: string | undefined
			if (mimeType.startsWith("text/") || mimeType === "application/json") {
				text = buffer.toString("utf-8")
			}

			return {
				assetId,
				filePath,
				filename,
				mimeType,
				size: stat.size,
				buffer,
				base64,
				text,
			}
		} catch {
			return null
		}
	}
}
