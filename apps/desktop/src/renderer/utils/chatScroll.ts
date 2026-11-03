import type { Message } from "../types/ipc"

/**
 * A message the user just sent always belongs in view.
 *
 * The transcript only auto-scrolls while the user is already near the bottom, so
 * reading history first meant the new bubble was appended below the fold and the
 * send looked like it had been ignored until the answer started streaming.
 */
export function shouldPinToBottom(messages: Message[]): boolean {
	return messages[messages.length - 1]?.role === "user"
}
