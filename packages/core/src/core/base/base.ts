export interface CoreBaseConfig {
	component?: string
	name?: string
}

export class CoreBase {
	readonly component: string
	readonly name: string
	logger?: any
	private _rawConfig: Record<string, any> = {}

	constructor(config: CoreBaseConfig = {}) {
		this.component = config.component || "CORE"
		this.name = config.name || "CoreBase"
	}

	__setLogger(logger: any): void {
		this.logger = logger
	}

	__setRawConfig(config: Record<string, any>): void {
		this._rawConfig = config
	}

	toRawConfig(): Record<string, any> {
		return this._rawConfig
	}
}

export const MyAgentBase = CoreBase
