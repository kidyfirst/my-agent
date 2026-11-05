import { describe, expect, it } from "vitest"
import {
	PREVIEW_HIDE_DELAY_MS,
	belongsToView,
	initialPreviewState,
	isBrowserToolName,
	needsHideTimer,
	reducePreview,
	type PreviewFrame,
} from "../computerUsePreview"

const frame = (overrides: Partial<PreviewFrame> = {}): PreviewFrame => ({
	dataUrl: "data:image/jpeg;base64,AAA",
	url: "https://example.com/sign-in",
	title: "Sign in",
	capturedAt: 1_700_000_000_000,
	worktreePath: "/repo",
	threadId: "thread-1",
	...overrides,
})

describe("computer use preview state", () => {
	it("starts hidden with no frame", () => {
		const state = initialPreviewState()
		expect(state.visible).toBe(false)
		expect(state.frame).toBeNull()
		expect(needsHideTimer(state)).toBe(false)
	})

	it("shows on the first frame", () => {
		const state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		expect(state.visible).toBe(true)
		expect(state.frame?.url).toBe("https://example.com/sign-in")
	})

	it("keeps the panel open while a browser tool runs", () => {
		let state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		state = reducePreview(state, { type: "toolStart", toolName: "computer" })
		expect(state.active).toBe(true)
		expect(needsHideTimer(state)).toBe(false)
	})

	it("schedules a hide once the browser tool ends", () => {
		let state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		state = reducePreview(state, { type: "toolStart", toolName: "computer" })
		state = reducePreview(state, { type: "toolEnd", toolName: "computer" })
		expect(state.active).toBe(false)
		expect(needsHideTimer(state)).toBe(true)
	})

	it("ignores tools that are not the browser", () => {
		const start = reducePreview(initialPreviewState(), {
			type: "toolStart",
			toolName: "write_file",
		})
		expect(start.active).toBe(false)

		let state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		state = reducePreview(state, {
			type: "toolEnd",
			toolName: "execute_command",
		})
		expect(state.active).toBe(false)
	})

	it("treats navigate-browser as a browser tool too", () => {
		expect(isBrowserToolName("navigate-browser")).toBe(true)
		expect(isBrowserToolName("computer")).toBe(true)
		expect(isBrowserToolName("subagent")).toBe(false)
	})

	it("hides on hide, but never while hovered", () => {
		let state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		state = reducePreview(state, { type: "hide" })
		expect(state.visible).toBe(false)

		let hovered = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		hovered = reducePreview(hovered, { type: "hoverStart" })
		hovered = reducePreview(hovered, { type: "hide" })
		expect(hovered.visible).toBe(true)
		expect(needsHideTimer(hovered)).toBe(false)
	})

	it("hides after hover ends when idle, stays when active", () => {
		let idle = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		idle = reducePreview(idle, { type: "hoverStart" })
		idle = reducePreview(idle, { type: "hoverEnd" })
		expect(needsHideTimer(idle)).toBe(true)

		let busy = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		busy = reducePreview(busy, { type: "toolStart", toolName: "computer" })
		busy = reducePreview(busy, { type: "hoverStart" })
		busy = reducePreview(busy, { type: "hoverEnd" })
		expect(needsHideTimer(busy)).toBe(false)
	})

	it("re-shows when a frame arrives after a hide", () => {
		let state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		state = reducePreview(state, { type: "hide" })
		state = reducePreview(state, {
			type: "frame",
			frame: frame({ title: "Next" }),
		})
		expect(state.visible).toBe(true)
		expect(state.frame?.title).toBe("Next")
	})

	it("clears everything when the browser closes", () => {
		let state = reducePreview(initialPreviewState(), {
			type: "frame",
			frame: frame(),
		})
		state = reducePreview(state, { type: "closed" })
		expect(state.visible).toBe(false)
		expect(state.frame).toBeNull()
		expect(state.active).toBe(false)
	})

	it("keeps the linger delay short enough to feel automatic", () => {
		expect(PREVIEW_HIDE_DELAY_MS).toBeGreaterThan(1000)
		expect(PREVIEW_HIDE_DELAY_MS).toBeLessThan(5000)
	})
})

describe("preview scoping", () => {
	it("accepts frames from the current thread and project", () => {
		expect(belongsToView(frame(), "thread-1", "/repo")).toBe(true)
	})

	it("rejects frames from another project", () => {
		expect(belongsToView(frame(), "thread-1", "/other")).toBe(false)
	})

	it("rejects frames from another thread", () => {
		expect(belongsToView(frame(), "thread-2", "/repo")).toBe(false)
	})

	it("accepts frames with no thread tag (older events)", () => {
		expect(
			belongsToView(frame({ threadId: undefined }), "thread-2", "/repo"),
		).toBe(true)
	})

	it("accepts anything when the view does not know its scope yet", () => {
		expect(belongsToView(frame(), undefined, undefined)).toBe(true)
	})

	it("ignores the 'default' placeholder thread id", () => {
		// ChatView passes `currentThreadId || "default"`; treating that as a real
		// id would hide every frame in a brand-new conversation.
		expect(belongsToView(frame(), "default", "/repo")).toBe(true)
	})

	it("ignores trailing separators on the project root", () => {
		expect(belongsToView(frame(), "thread-1", "/repo/")).toBe(true)
		expect(
			belongsToView(frame({ worktreePath: "/repo/" }), "thread-1", "/repo"),
		).toBe(true)
	})
})
