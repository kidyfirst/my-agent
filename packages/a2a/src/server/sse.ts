import type { ServerResponse, IncomingMessage } from "node:http"
import type { MyAgentHarness } from "@my-agent/core"

export interface HandleStreamParams {
	contextId?: string
	projectPath?: string
	prompt: string
	mode?: string
}

export async function handleSSEStream(
	req: IncomingMessage,
	res: ServerResponse,
	harness: MyAgentHarness,
	params: HandleStreamParams,
): Promise<void> {
	res.writeHead(200, {
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"Access-Control-Allow-Origin": "*",
	})

	const sendEvent = (event: string, data: any) => {
		res.write(`event: ${event}\n`)
		res.write(`data: ${JSON.stringify(data)}\n\n`)
	}

	let threadId = params.contextId
	if (!threadId) {
		const created = await harness.createThread()
		threadId = created?.id || harness.getCurrentThreadId()
	} else if (threadId !== harness.getCurrentThreadId()) {
		await harness.switchThread({ threadId })
	}

	sendEvent("task_start", {
		taskId: `task-${Date.now()}`,
		contextId: threadId,
		status: "WORKING",
	})

	let clientClosed = false
	const unsubscribe = harness.subscribe((event: any) => {
		if (clientClosed) return
		if (event.threadId && event.threadId !== threadId) return

		switch (event.type) {
			case "message_delta":
			case "text_delta":
			case "delta":
				sendEvent("delta", {
					contextId: threadId,
					delta: event.delta || event.text || "",
				})
				break

			case "thinking_delta":
			case "reasoning_delta":
				sendEvent("thinking", {
					contextId: threadId,
					delta: event.delta || event.text || "",
				})
				break

			case "tool_call":
			case "tool_start":
				sendEvent("tool_start", {
					contextId: threadId,
					toolCallId: event.toolCallId || event.id,
					toolName: event.toolName || event.name,
					args: event.args,
				})
				break

			case "tool_result":
			case "tool_end":
				sendEvent("tool_end", {
					contextId: threadId,
					toolCallId: event.toolCallId || event.id,
					toolName: event.toolName || event.name,
					result: event.result,
				})
				break

			case "tool_approval_required":
				sendEvent("approval_required", {
					contextId: threadId,
					approvalId: event.toolCallId || event.id,
					toolName: event.toolName || event.name,
					description: event.description,
					args: event.args,
				})
				break

			case "agent_end":
			case "turn_completed":
				sendEvent("task_completed", {
					contextId: threadId,
					status: "COMPLETED",
					result: event.result,
				})
				break

			case "agent_error":
			case "error":
				sendEvent("task_error", {
					contextId: threadId,
					status: "FAILED",
					error: event.error?.message || String(event.error),
				})
				break
		}
	})

	req.on("close", () => {
		clientClosed = true
		harness.abort({ threadId })
		unsubscribe()
	})

	try {
		await harness.sendMessage({
			content: params.prompt,
			threadId,
		})
	} catch (err: any) {
		if (!clientClosed) {
			sendEvent("task_error", {
				contextId: threadId,
				status: "FAILED",
				error: err?.message || String(err),
			})
		}
	} finally {
		unsubscribe()
		if (!clientClosed) {
			res.end()
		}
	}
}
