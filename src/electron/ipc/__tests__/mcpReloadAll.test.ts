import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A key is global, but every open project owns its own harness and MCP manager.
 * Reloading only the active session left the others holding a config snapshot
 * without the credential, so a worktree or second project kept answering "no web
 * access" while Settings showed LangSearch connected.
 */

const saved: Array<{ name: string; key: string }> = []

vi.mock("../../../mcp/builtin.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../mcp/builtin.js")>()
	return {
		...actual,
		saveBuiltinApiKey: (name: string, key: string) => {
			saved.push({ name, key })
		},
	}
})

const { getMcpHandlers } = await import("../mcp-handlers.js")

function fakeManager(name: string) {
	return {
		reloaded: 0,
		name,
		async reload() {
			this.reloaded++
		},
		getServerStatuses() {
			return [{ name, connected: true }]
		},
	}
}

function context(activeName: string) {
	const managers = {
		a: fakeManager("a"),
		b: fakeManager("b"),
	}
	const sessions = new Map<string, any>([
		["/repo/a", { projectRoot: "/repo/a", mcpManager: managers.a }],
		["/repo/b", { projectRoot: "/repo/b", mcpManager: managers.b }],
	])
	return {
		managers,
		ctx: {
			sessions,
			getActiveSession: () => sessions.get(`/repo/${activeName}`)!,
		} as any,
	}
}

describe("mcp key save", () => {
	beforeEach(() => {
		saved.length = 0
	})

	it("reconnects every open project, not just the active one", async () => {
		const { ctx, managers } = context("a")
		const statuses = await getMcpHandlers().setMcpApiKey(
			{ serverName: "langsearch", apiKey: "sk-1" },
			ctx,
		)

		expect(saved).toEqual([{ name: "langsearch", key: "sk-1" }])
		expect(managers.a.reloaded).toBe(1)
		expect(managers.b.reloaded).toBe(1)
		// The settings list shows the active project's fresh statuses.
		expect(statuses).toEqual([{ name: "a", connected: true }])
	})

	it("reloads all projects from the Settings reload button too", async () => {
		const { ctx, managers } = context("b")
		await getMcpHandlers().reloadMcp({}, ctx)

		expect(managers.a.reloaded).toBe(1)
		expect(managers.b.reloaded).toBe(1)
	})

	it("rejects a name that is not a built-in server", async () => {
		const { ctx, managers } = context("a")
		await expect(
			getMcpHandlers().setMcpApiKey(
				{ serverName: "not-a-builtin", apiKey: "x" },
				ctx,
			),
		).rejects.toThrow(/not a built-in server/)
		expect(managers.a.reloaded).toBe(0)
	})
})
