import fs from "node:fs/promises"
import path from "node:path"

export interface LocalFilesystemOptions {
	basePath: string
	allowedPaths?: string[]
}

export class LocalFilesystem {
	basePath: string
	allowedPaths: string[]

	constructor(options: LocalFilesystemOptions) {
		this.basePath = path.resolve(options.basePath)
		this.allowedPaths = (options.allowedPaths ?? [this.basePath]).map((p) =>
			path.resolve(p),
		)
	}

	setAllowedPaths(allowedPaths: string[]): void {
		this.allowedPaths = allowedPaths.map((p) => path.resolve(p))
	}

	resolvePath(relativePath: string): string {
		if (path.isAbsolute(relativePath)) {
			return relativePath
		}
		return path.resolve(this.basePath, relativePath)
	}

	async readFile(
		filePath: string,
		encoding: BufferEncoding = "utf-8",
	): Promise<string> {
		const resolved = this.resolvePath(filePath)
		return fs.readFile(resolved, { encoding })
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const resolved = this.resolvePath(filePath)
		await fs.mkdir(path.dirname(resolved), { recursive: true })
		await fs.writeFile(resolved, content, "utf-8")
	}

	async appendFile(filePath: string, content: string): Promise<void> {
		const resolved = this.resolvePath(filePath)
		await fs.mkdir(path.dirname(resolved), { recursive: true })
		await fs.appendFile(resolved, content, "utf-8")
	}

	async deleteFile(filePath: string): Promise<void> {
		const resolved = this.resolvePath(filePath)
		await fs.unlink(resolved)
	}

	async exists(filePath: string): Promise<boolean> {
		const resolved = this.resolvePath(filePath)
		try {
			await fs.access(resolved)
			return true
		} catch {
			return false
		}
	}

	async stat(filePath: string) {
		const resolved = this.resolvePath(filePath)
		return fs.stat(resolved)
	}

	async mkdir(dirPath: string): Promise<void> {
		const resolved = this.resolvePath(dirPath)
		await fs.mkdir(resolved, { recursive: true })
	}

	async readdir(dirPath: string): Promise<string[]> {
		const resolved = this.resolvePath(dirPath)
		return fs.readdir(resolved)
	}
}
