import type { MyAgentDBMessage } from "../core/index.js"

export interface SQLiteStoreConfig {
	id?: string
	url?: string
	authToken?: string
	db?: any
}

export interface StorageThreadType {
	id: string
	resourceId: string
	title: string
	metadata?: Record<string, any> | null
	createdAt: Date
	updatedAt: Date
}

export interface StorageListThreadsInput {
	page?: number
	perPage?: number | false
	orderBy?: {
		field: string
		direction: "ASC" | "DESC"
	}
	filter?: {
		resourceId?: string
		metadata?: Record<string, any>
	}
}

export interface StorageListThreadsOutput {
	threads: StorageThreadType[]
	total: number
	page: number
	perPage: number | false
	hasMore: boolean
}

export interface StorageListMessagesInput {
	threadId: string | string[]
	resourceId?: string
	page?: number
	perPage?: number | false
	orderBy?: {
		field: string
		direction: "ASC" | "DESC"
	}
	filter?: {
		dateRange?: {
			start?: Date | string
			end?: Date | string
			startExclusive?: boolean
			endExclusive?: boolean
		}
		metadata?: Record<string, any>
	}
	include?: any[]
}

export interface StorageListMessagesOutput {
	messages: MyAgentDBMessage[]
	total: number
	page: number
	perPage: number | false
	hasMore: boolean
}

export interface ObservationalMemoryRecord {
	id: string
	lookupKey: string
	scope: string
	resourceId?: string | null
	threadId?: string | null
	activeObservations: string
	activeObservationsPendingUpdate?: string | null
	originType: string
	config: string
	generationCount: number
	supersededBy?: string | null
	lastObservedAt?: Date | string | null
	lastReflectionAt?: Date | string | null
	pendingMessageTokens: number
	totalTokensObserved: number
	observationTokenCount: number
	isObserving: boolean
	isReflecting: boolean
	observedMessageIds?: string[] | null
	observedTimezone?: string | null
	bufferedObservations?: string | null
	bufferedObservationTokens?: number | null
	bufferedMessageIds?: string[] | null
	bufferedReflection?: string | null
	bufferedReflectionTokens?: number | null
	bufferedReflectionInputTokens?: number | null
	reflectedObservationLineCount?: number | null
	bufferedObservationChunks?: any | null
	isBufferingObservation: boolean
	isBufferingReflection: boolean
	lastBufferedAtTokens: number
	lastBufferedAtTime?: Date | string | null
	metadata?: Record<string, any> | null
	createdAt: Date
	updatedAt: Date
}
