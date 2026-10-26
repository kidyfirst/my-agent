import type { MyAgentDBMessage } from "../agent/types.js"

export interface StorageThreadType {
	id: string
	title?: string
	resourceId: string
	createdAt: Date
	updatedAt: Date
	metadata?: Record<string, unknown>
}

export interface MemoryConfigInternal {
	[key: string]: unknown
}

export interface SharedMemoryConfig {
	id?: string
	name?: string
	storage?: any
	options?: any
	[key: string]: unknown
}

export interface ObservationalMemoryOptions {
	[key: string]: unknown
}

export interface StorageListMessagesInput {
	threadId?: string | string[]
	resourceId?: string
	page?: number
	perPage?: number | false
	orderBy?: { field: string; direction: "ASC" | "DESC" }
	filter?: Record<string, unknown>
}

export interface StorageListThreadsInput {
	resourceId?: string
	page?: number
	perPage?: number
	orderBy?: { field: string; direction: "ASC" | "DESC" }
	filter?: Record<string, unknown>
}

export interface StorageListThreadsOutput {
	threads: StorageThreadType[]
	total?: number
	page?: number
	perPage?: number
	hasMore?: boolean
}

export interface StorageCloneThreadInput {
	sourceThreadId: string
	newThreadId?: string
	title?: string
	resourceId?: string
	metadata?: Record<string, unknown>
}

export type MessageDeleteInput =
	| string[]
	| { id?: string }[]
	| { messageIds: string[] }

export interface WorkingMemoryTemplate {
	[key: string]: unknown
}

export interface ObservabilityContext {
	[key: string]: unknown
}
