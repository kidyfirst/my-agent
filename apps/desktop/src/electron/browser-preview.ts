/**
 * Live browser mirror for the desktop UI.
 *
 * The agent drives a headless Chromium, so the user has nothing to look at. The
 * browser manager publishes a JPEG frame after each action; this module keeps
 * the newest frame per project and broadcasts it to every window. The chat view
 * renders it as a small pinned panel, and the right-hand slide-over renders the
 * same stream at full size.
 *
 * Frames are per project because that is how browser managers are created, and
 * they carry the threadId of the active run so a panel never shows a frame that
 * belongs to a conversation the user already switched away from.
 */
import { BrowserWindow } from "electron"
import type { BrowserPreviewFrame } from "@my-agent/core"
import { safeSend } from "./helpers.js"

export interface BrowserPreviewPayload extends BrowserPreviewFrame {
	type: "browser_preview"
	worktreePath: string
	threadId?: string
}

export interface BrowserPreviewClosedPayload {
	type: "browser_preview_closed"
	worktreePath: string
	threadId?: string
}

const latestFrames = new Map<string, BrowserPreviewFrame>()
const browsingThread = new Map<string, string>()

/** Remember which thread is driving the browser, so frames can be routed. */
export function noteBrowsingThread(
	worktreePath: string,
	threadId: string | undefined,
): void {
	if (!worktreePath || !threadId) return
	browsingThread.set(worktreePath, threadId)
}

function broadcast(
	payload: BrowserPreviewPayload | BrowserPreviewClosedPayload,
) {
	for (const win of BrowserWindow.getAllWindows()) {
		safeSend(win, "harness:event", payload)
	}
}

/**
 * Build the listener to hand to `browserManager.subscribePreview()`. Each frame
 * is cached (a window opened mid-run can ask for it) and pushed to all windows.
 */
export function publishBrowserPreview(worktreePath: string) {
	return (frame: BrowserPreviewFrame) => {
		latestFrames.set(worktreePath, frame)
		broadcast({
			type: "browser_preview",
			worktreePath,
			threadId: browsingThread.get(worktreePath),
			...frame,
		})
	}
}

/** Newest frame for a project, for a window that just opened. */
export function getBrowserPreview(worktreePath: string): {
	frame: BrowserPreviewFrame
	threadId?: string
} | null {
	const frame = latestFrames.get(worktreePath)
	if (!frame) return null
	return { frame, threadId: browsingThread.get(worktreePath) }
}

/**
 * Drop the cached frame and tell the UI to hide. Called when the browser is
 * closed (thread switch, session teardown), which is what "computer use is
 * over" looks like from the main process.
 */
export function clearBrowserPreview(worktreePath: string): void {
	if (!latestFrames.has(worktreePath)) return
	latestFrames.delete(worktreePath)
	broadcast({
		type: "browser_preview_closed",
		worktreePath,
		threadId: browsingThread.get(worktreePath),
	})
}
