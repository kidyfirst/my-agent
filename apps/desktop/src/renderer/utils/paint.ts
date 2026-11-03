/**
 * Resolve once the browser has had a chance to put a frame on screen.
 *
 * Used right after a message is optimistically rendered: the send IPC round trip
 * and the agent's opening events would otherwise land before the browser paints,
 * and the bubble the user just typed looks late even though it was dispatched
 * first.
 *
 * Falls back to a timeout, because a hidden window throttles rAF and a send must
 * never wait on a frame nobody is going to draw.
 */
export function nextPaint(timeoutMs = 120): Promise<void> {
	return new Promise<void>((resolve) => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			resolve()
		}
		const raf: (cb: (time: number) => void) => unknown =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (cb) => setTimeout(() => cb(0), 0)
		raf(() => setTimeout(finish, 0))
		setTimeout(finish, timeoutMs)
	})
}
