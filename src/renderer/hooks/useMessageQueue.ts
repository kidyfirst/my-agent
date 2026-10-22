import { useState, useEffect, useCallback } from "react"
import type { ChatState, QueuedMessage, AttachedFile } from "../types/chat"

/**
 * Owns the per-thread message queue: persistence to the harness, the
 * active→idle auto-dequeue, and the user actions exposed by MessageQueueBar.
 */
export function useMessageQueue(
	chat: ChatState,
	dispatch: React.Dispatch<any>,
	currentThreadId: string | null,
	handleSend: (content: string, files?: AttachedFile[]) => Promise<void>,
) {
	const [prevIsAgentActive, setPrevIsAgentActive] = useState(chat.isAgentActive)

	const queueFor = (threadId: string) => chat.queuesByThread[threadId] || []

	const persist = useCallback(
		(queue: QueuedMessage[]) => {
			if (!currentThreadId) return
			window.api
				.invoke({ type: "setMessageQueue", threadId: currentThreadId, queue })
				.catch((err) => console.warn("Failed to persist message queue:", err))
		},
		[currentThreadId],
	)

	const loadQueue = useCallback(async (threadId: string | null) => {
		if (!threadId) return
		try {
			const queue = (await window.api.invoke({
				type: "getMessageQueue",
				threadId,
			})) as QueuedMessage[]
			if (Array.isArray(queue)) {
				dispatch({ type: "SET_THREAD_QUEUE", threadId, queue })
			}
		} catch (err) {
			console.warn(
				"[loadQueue] Failed to load message queue for thread:",
				threadId,
				err,
			)
		}
	}, [])

	// Load the queue for a thread, migrating any queue stashed under "default"
	useEffect(() => {
		if (!currentThreadId) return
		const defaultQueue = queueFor("default")
		if (defaultQueue.length > 0) {
			const merged = [...defaultQueue, ...queueFor(currentThreadId)]
			dispatch({
				type: "SET_THREAD_QUEUE",
				threadId: currentThreadId,
				queue: merged,
			})
			dispatch({ type: "CLEAR_THREAD_QUEUE", threadId: "default" })
			window.api
				.invoke({
					type: "setMessageQueue",
					threadId: currentThreadId,
					queue: merged,
				})
				.catch(() => {})
		} else {
			loadQueue(currentThreadId)
		}
	}, [currentThreadId, loadQueue])

	const sendNext = useCallback(
		(threadId: string, queue: QueuedMessage[]) => {
			if (queue.length === 0) return
			const [next, ...remaining] = queue
			dispatch({ type: "DEQUEUE_MESSAGE", threadId, id: next.id })
			// Start synchronously so subsequent renders already see isAgentActive
			dispatch({ type: "AGENT_START" })
			persist(remaining)
			handleSend(next.content, next.files)
		},
		[persist, handleSend],
	)

	const handleResumeQueue = useCallback(() => {
		dispatch({ type: "SET_QUEUE_PAUSED", paused: false })
		if (!chat.isAgentActive) {
			const targetThreadId = currentThreadId || "default"
			sendNext(targetThreadId, queueFor(targetThreadId))
		}
	}, [chat.isAgentActive, currentThreadId, chat.queuesByThread, sendNext])

	const handleQueue = useCallback(
		async (content: string, files?: AttachedFile[]) => {
			const targetThreadId = currentThreadId || "default"
			const queuedItem: QueuedMessage = {
				id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				threadId: currentThreadId,
				content,
				files,
				createdAt: new Date().toISOString(),
			}
			const updated = [...queueFor(targetThreadId), queuedItem]
			dispatch({
				type: "ENQUEUE_MESSAGE",
				threadId: targetThreadId,
				message: queuedItem,
			})
			persist(updated)
		},
		[currentThreadId, chat.queuesByThread, persist],
	)

	const handleSteerQueued = useCallback(
		async (item: QueuedMessage) => {
			const targetThreadId = currentThreadId || "default"
			dispatch({
				type: "REMOVE_QUEUED_MESSAGE",
				threadId: targetThreadId,
				id: item.id,
			})
			persist(queueFor(targetThreadId).filter((m) => m.id !== item.id))
			try {
				await window.api.invoke({ type: "steer", content: item.content })
			} catch (err) {
				console.error("Failed to steer queued message:", err)
			}
		},
		[currentThreadId, chat.queuesByThread, persist],
	)

	const handleDeleteQueued = useCallback(
		async (id: string) => {
			const targetThreadId = currentThreadId || "default"
			dispatch({ type: "REMOVE_QUEUED_MESSAGE", threadId: targetThreadId, id })
			persist(queueFor(targetThreadId).filter((m) => m.id !== id))
		},
		[currentThreadId, chat.queuesByThread, persist],
	)

	const handleReorderQueue = useCallback(
		async (newQueue: QueuedMessage[]) => {
			const targetThreadId = currentThreadId || "default"
			dispatch({
				type: "REORDER_THREAD_QUEUE",
				threadId: targetThreadId,
				queue: newQueue,
			})
			persist(newQueue)
		},
		[currentThreadId, persist],
	)

	const handleClearQueue = useCallback(async () => {
		const targetThreadId = currentThreadId || "default"
		dispatch({ type: "CLEAR_THREAD_QUEUE", threadId: targetThreadId })
		persist([])
	}, [currentThreadId, persist])

	// Auto-dequeue the next message ONLY when the agent goes active -> idle
	useEffect(() => {
		const wasActive = prevIsAgentActive
		setPrevIsAgentActive(chat.isAgentActive)
		if (!wasActive || chat.isAgentActive || chat.isQueuePaused) return
		sendNext(
			currentThreadId || "default",
			queueFor(currentThreadId || "default"),
		)
	}, [
		chat.isAgentActive,
		chat.isQueuePaused,
		chat.queuesByThread,
		currentThreadId,
		prevIsAgentActive,
		sendNext,
	])

	return {
		handleResumeQueue,
		handleQueue,
		handleSteerQueued,
		handleDeleteQueued,
		handleReorderQueue,
		handleClearQueue,
	}
}
