import { randomUUID } from "node:crypto"
import type {
	MyAgentDBMessage,
	MyAgentMessageContentV2,
	MessageRole,
} from "./types.js"

export interface MessageListOptions {
	threadId?: string
	resourceId?: string
	generateMessageId?: () => string
}

export class MessageList {
	private readonly threadId?: string
	private readonly resourceId?: string
	private readonly generateMessageId: () => string
	private messages: MyAgentDBMessage[] = []

	constructor(options: MessageListOptions = {}) {
		this.threadId = options.threadId
		this.resourceId = options.resourceId
		this.generateMessageId = options.generateMessageId || (() => randomUUID())
	}

	add(messages: unknown[], _source?: string): this {
		if (!Array.isArray(messages)) return this

		for (const item of messages) {
			if (!item || typeof item !== "object") continue

			const raw = item as Record<string, any>
			const id = raw.id || this.generateMessageId()
			const role: MessageRole = raw.role || "user"
			const createdAt =
				raw.createdAt instanceof Date
					? raw.createdAt
					: raw.createdAt
						? new Date(raw.createdAt)
						: new Date()
			const threadId = raw.threadId || this.threadId
			const resourceId = raw.resourceId || this.resourceId
			const type = raw.type

			let content: MyAgentMessageContentV2

			if (
				raw.content &&
				typeof raw.content === "object" &&
				raw.content.format === 2 &&
				Array.isArray(raw.content.parts)
			) {
				content = raw.content as MyAgentMessageContentV2
			} else {
				const textContent =
					typeof raw.content === "string"
						? raw.content
						: raw.content?.content || ""
				content = {
					format: 2,
					parts: [{ type: "text", text: textContent }],
					content: textContent,
					toolInvocations: raw.toolInvocations,
					reasoning: raw.reasoning,
					experimental_attachments: raw.experimental_attachments,
					metadata: raw.metadata,
				}
			}

			const dbMsg: MyAgentDBMessage = {
				id,
				role,
				createdAt,
				threadId,
				resourceId,
				type,
				content,
			}

			this.messages.push(dbMsg)
		}

		return this
	}

	get get() {
		return {
			all: {
				db: (): MyAgentDBMessage[] => [...this.messages],
			},
		}
	}
}
