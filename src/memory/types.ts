import type {
	MemoryConfigInternal,
	SharedMemoryConfig,
	StorageThreadType,
	ObservationalMemoryOptions,
	RequestContext,
} from "../core/index.js"

export type { StorageThreadType }

export interface ObservationalMemoryConfig {
	enabled?: boolean
	scope?: string
	observation?: {
		bufferTokens?: number
		bufferActivation?: number
		messageTokens?: number
		blockAfter?: number
		model?: ((opts: { requestContext: RequestContext }) => unknown) | unknown
	}
	reflection?: {
		bufferActivation?: number
		blockAfter?: number
		observationTokens?: number
		model?: ((opts: { requestContext: RequestContext }) => unknown) | unknown
	}
}

export interface MemoryOptions extends Omit<
	MemoryConfigInternal,
	"observationalMemory"
> {
	observationalMemory?:
		| boolean
		| ObservationalMemoryConfig
		| ObservationalMemoryOptions
}

export type MemoryConstructorConfig = Omit<
	SharedMemoryConfig,
	"options" | "storage"
> & {
	id?: string
	name?: string
	storage?: any
	options?: MemoryOptions
}
