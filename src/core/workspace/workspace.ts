import type { LocalFilesystem } from "./filesystem.js"
import type { LocalSandbox } from "./sandbox.js"

export interface WorkspaceConfig {
	id: string
	name?: string
	filesystem?: LocalFilesystem | any
	sandbox?: LocalSandbox | any
	tools?: Record<string, unknown>
	[key: string]: unknown
}

export class Workspace {
	id: string
	name: string
	private _customFs?: LocalFilesystem | any
	private _customSandbox?: LocalSandbox | any
	private _toolsConfig?: Record<string, unknown>

	constructor(config: WorkspaceConfig) {
		this.id = config.id
		this.name = config.name ?? config.id
		this._customFs = config.filesystem
		this._customSandbox = config.sandbox
		this._toolsConfig = config.tools
	}

	get filesystem(): any {
		return this._customFs
	}

	set filesystem(fs: any) {
		this._customFs = fs
	}

	get sandbox(): any {
		return this._customSandbox
	}

	set sandbox(sb: any) {
		this._customSandbox = sb
	}

	setToolsConfig(toolsConfig: Record<string, unknown>): void {
		this._toolsConfig = toolsConfig
	}

	getToolsConfig(): Record<string, unknown> | undefined {
		return this._toolsConfig
	}

	async init(): Promise<void> {}

	async destroy(): Promise<void> {}

	getInfo(): Record<string, unknown> {
		return {
			id: this.id,
			name: this.name,
			filesystem: Boolean(this._customFs),
			sandbox: Boolean(this._customSandbox),
			tools: this._toolsConfig,
		}
	}

	serializeForSpan(): Record<string, unknown> {
		return {
			id: this.id,
			name: this.name,
		}
	}
}
