export interface MessageHistoryOptions {
	storage?: any
	lastMessages?: number
	tokenLimit?: any
	tokenCounter?: any
}

export class MessageHistory {
	id = "message-history"
	name = "MessageHistory"
	storage: any
	lastMessages?: number
	tokenLimit?: any
	tokenCounter?: any

	constructor(options: MessageHistoryOptions) {
		this.storage = options.storage
		this.lastMessages = options.lastMessages
		this.tokenLimit = options.tokenLimit
		this.tokenCounter = options.tokenCounter
	}

	getMemoryContext(
		requestContext: any,
		messageList?: any,
	): { threadId: string; resourceId?: string } | null {
		const threadId =
			requestContext?.get?.("threadId") ||
			requestContext?.get?.("thread")?.id ||
			messageList?.threadId ||
			messageList?.memoryInfo?.threadId
		const resourceId =
			requestContext?.get?.("resourceId") ||
			messageList?.resourceId ||
			messageList?.memoryInfo?.resourceId
		if (threadId) {
			return { threadId, resourceId }
		}
		return null
	}

	async processInput(args: {
		messageList: any
		requestContext: any
		[key: string]: any
	}): Promise<any> {
		const { messageList, requestContext } = args
		const context = this.getMemoryContext(requestContext, messageList)
		if (!context || !this.storage) return messageList

		const { threadId } = context
		try {
			const limit =
				typeof this.lastMessages === "number" ? this.lastMessages : 50
			const list = await this.storage.listMessages({
				threadId,
				limit,
				perPage: limit,
				orderBy: { field: "createdAt", direction: "ASC" },
			})
			const msgs = Array.isArray(list) ? list : (list?.messages ?? [])
			if (
				msgs.length > 0 &&
				typeof messageList?.prependMessages === "function"
			) {
				messageList.prependMessages(msgs)
			}
		} catch (err) {
			console.warn("[MessageHistory] processInput error:", err)
		}
		return messageList
	}

	async processOutputResult(args: {
		messageList: any
		requestContext: any
		result?: any
		[key: string]: any
	}): Promise<any> {
		const { messageList, requestContext } = args
		const context = this.getMemoryContext(requestContext, messageList)
		if (!context || !this.storage) return messageList

		const { threadId, resourceId } = context
		try {
			let messagesToSave: any[] = []
			if (typeof messageList?.getNewMessages === "function") {
				messagesToSave = messageList.getNewMessages()
			} else if (typeof messageList?.get?.response?.db === "function") {
				const input = messageList.get.input.db?.() || []
				const response = messageList.get.response.db?.() || []
				messagesToSave = [...input, ...response]
			} else if (Array.isArray(messageList)) {
				messagesToSave = messageList
			}

			if (messagesToSave.length > 0) {
				const normalized = messagesToSave.map((m: any) => ({
					...m,
					threadId: m.threadId || threadId,
					resourceId: m.resourceId || resourceId,
				}))
				await this.storage.saveMessages({ messages: normalized })
			}
		} catch (err) {
			console.warn("[MessageHistory] processOutputResult error:", err)
		}
		return messageList
	}
}
