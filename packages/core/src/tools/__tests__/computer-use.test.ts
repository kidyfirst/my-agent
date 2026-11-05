import { describe, expect, it, vi } from "vitest"
import { createComputerUseTool } from "../computer-use.js"
import { createNavigateBrowserTool } from "../navigate-browser.js"
import { toModelTool } from "../../core/tools/ai-tool.js"
import type { PageSnapshot } from "../../browser/page-snapshot.js"

const SNAPSHOT: PageSnapshot = {
	url: "https://example.com/login",
	title: "Sign in",
	text: "Welcome back",
	elements: [
		{ id: 1, tag: "input", label: "Email", x: 300, y: 220 },
		{ id: 2, tag: "button", label: "Continue", x: 410, y: 300 },
	],
	viewport: { width: 1024, height: 768 },
}

function fakeBrowser() {
	const calls: Array<{ name: string; args: unknown[] }> = []
	const page = {
		mouse: {
			click: vi.fn((...args: unknown[]) => calls.push({ name: "click", args })),
			dblclick: vi.fn((...args: unknown[]) =>
				calls.push({ name: "dblclick", args }),
			),
			move: vi.fn((...args: unknown[]) => calls.push({ name: "move", args })),
			down: vi.fn(() => calls.push({ name: "down", args: [] })),
			up: vi.fn(() => calls.push({ name: "up", args: [] })),
			wheel: vi.fn((...args: unknown[]) => calls.push({ name: "wheel", args })),
		},
		keyboard: {
			type: vi.fn((...args: unknown[]) => calls.push({ name: "type", args })),
			press: vi.fn((...args: unknown[]) => calls.push({ name: "press", args })),
			down: vi.fn((...args: unknown[]) =>
				calls.push({ name: "keydown", args }),
			),
			up: vi.fn((...args: unknown[]) => calls.push({ name: "keyup", args })),
		},
		waitForTimeout: vi.fn(),
	}
	const manager = {
		getPage: vi.fn(async () => page),
		snapshot: vi.fn(async () => SNAPSHOT),
		getElementCenter: vi.fn((id: number) => {
			const el = SNAPSHOT.elements.find((candidate) => candidate.id === id)
			return el ? { x: el.x, y: el.y } : null
		}),
		navigate: vi.fn(async () => {}),
		// The tool mirrors every action into the host UI; the test just needs the
		// call to be harmless (and observable).
		publishPreview: vi.fn(async () => {}),
	}
	return { manager: manager as any, page, calls }
}

describe("computer tool is an ordinary function tool", () => {
	it("is not a provider-defined tool (OpenAI-compatible providers drop those)", () => {
		const { manager } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		expect(tool.type).not.toBe("provider-defined")
		expect(tool.id).toBe("computer")
		expect(tool.inputSchema).toBeDefined()
	})

	it("goes through toModelTool so the approval gate wraps its execute", () => {
		const { manager } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		const guarded = vi.fn(async () => "approved")
		const modelTool = toModelTool(tool, guarded)
		// A provider-defined tool would be returned untouched, bypassing the
		// controller's approval / tool_start / tool_end bookkeeping.
		expect(modelTool).not.toBe(tool)
		expect(modelTool.execute).toBe(guarded)
		expect(modelTool.inputSchema).toBeDefined()
	})
})

describe("computer actions", () => {
	it("screenshot returns a text snapshot, never an image payload", async () => {
		const { manager } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		const result = await tool.execute({ action: "screenshot" })
		expect(typeof result).toBe("string")
		expect(result).toContain("URL: https://example.com/login")
		expect(result).toContain("[1] <input> Email @ (300, 220)")
		expect(result).toContain("Welcome back")
		expect(result).not.toContain("base64")
		expect(result).not.toContain("image/jpeg")
	})

	it("clicks by element id using the snapshot coordinates", async () => {
		const { manager, page } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		await tool.execute({ action: "left_click", element: 2 })
		expect(page.mouse.click).toHaveBeenCalledWith(410, 300)
	})

	it("also accepts raw coordinates", async () => {
		const { manager, page } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		await tool.execute({ action: "left_click", coordinate: [12, 34] })
		expect(page.mouse.click).toHaveBeenCalledWith(12, 34)
	})

	it("refuses stale element ids instead of clicking a wrong spot", async () => {
		const { manager, page } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		const result = await tool.execute({ action: "left_click", element: 99 })
		expect(result).toContain("Call `screenshot` again")
		expect(page.mouse.click).not.toHaveBeenCalled()
	})

	it("asks for a target rather than clicking blindly", async () => {
		const { manager, page } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		const result = await tool.execute({ action: "left_click" })
		expect(result).toContain("`element`")
		expect(page.mouse.click).not.toHaveBeenCalled()
	})

	it("maps xdotool-style key names for key presses", async () => {
		const { manager, page } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		await tool.execute({ action: "key", text: "Return" })
		expect(page.keyboard.press).toHaveBeenCalledWith("Enter")
	})

	it("types into the currently focused field", async () => {
		const { manager, page } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		await tool.execute({ action: "type", text: "hello@example.com" })
		expect(page.keyboard.type).toHaveBeenCalledWith("hello@example.com", {
			delay: 12,
		})
	})

	it("rejects unknown actions through the input schema", async () => {
		const { manager } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		await expect(tool.execute({ action: "teleport" } as any)).rejects.toThrow()
	})
})

describe("navigate-browser", () => {
	it("opens the URL and returns the page snapshot as plain text", async () => {
		const { manager } = fakeBrowser()
		const tool = createNavigateBrowserTool(manager)
		const result = await tool.execute({ url: "https://example.com/login" })
		expect(manager.navigate).toHaveBeenCalledWith("https://example.com/login")
		expect(typeof result).toBe("string")
		expect(result).toContain("URL: https://example.com/login")
		expect(result).toContain("[2] <button> Continue")
	})

	it("reports navigation failures as text instead of throwing", async () => {
		const { manager } = fakeBrowser()
		manager.navigate.mockRejectedValueOnce(new Error("net::ERR_DNS_FAIL"))
		const tool = createNavigateBrowserTool(manager)
		const result = await tool.execute({ url: "https://nope.invalid" })
		expect(result).toContain("Navigation to https://nope.invalid failed")
		expect(result).toContain("ERR_DNS_FAIL")
	})
})

describe("browser mirror", () => {
	it("publishes a frame after every action, including screenshot", async () => {
		const { manager } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		await tool.execute({ action: "left_click", element: 1 })
		await tool.execute({ action: "screenshot" })
		expect(manager.publishPreview).toHaveBeenCalledTimes(2)
	})

	it("still publishes when the action was rejected for a missing target", async () => {
		const { manager } = fakeBrowser()
		const tool = createComputerUseTool(manager)
		const result = await tool.execute({ action: "left_click" })
		expect(result).toContain("Provide `element`")
		// The user should see the page even when the model fumbled the call.
		expect(manager.publishPreview).toHaveBeenCalledTimes(1)
	})

	it("forces a frame after navigation so the panel never lags a page load", async () => {
		const { manager } = fakeBrowser()
		const tool = createNavigateBrowserTool(manager)
		await tool.execute({ url: "https://example.com/login" })
		expect(manager.publishPreview).toHaveBeenCalledWith({ force: true })
	})
})
