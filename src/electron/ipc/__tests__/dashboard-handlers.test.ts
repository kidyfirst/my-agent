import { describe, it, expect, vi } from "vitest"
import { getDashboardHandlers } from "../dashboard-handlers.js"
import type { IpcContext } from "../types.js"

describe("dashboard-handlers", () => {
	it("returns modeId and thinkingLevel for active agent sessions", async () => {
		const handlers = getDashboardHandlers()
		const mockSessionPath = process.cwd()

		const mockCtx = {
			sessions: new Map([
				[
					mockSessionPath,
					{
						harness: {
							getState: () => ({
								projectName: "test-project",
								gitBranch: "feature/mode-test",
								currentModelId: "anthropic/claude-3-7-sonnet",
								thinkingLevel: "high",
								tasks: [],
							}),
							getCurrentModeId: () => "plan",
							getTokenUsage: () => ({
								promptTokens: 1000,
								completionTokens: 500,
								totalTokens: 1500,
							}),
						},
						electronState: {
							getState: () => ({
								linkedLinearIssueId: null,
								linkedLinearIssueIdentifier: null,
								linkedGithubIssueNumber: 0,
							}),
						},
					},
				],
			]),
			sessionTimings: new Map([
				[
					mockSessionPath,
					{
						startedAt: null,
						totalDurationMs: 5000,
						currentModelId: "anthropic/claude-3-7-sonnet",
					},
				],
			]),
			activeSessionPath: mockSessionPath,
			cleanupSession: vi.fn(),
		} as unknown as IpcContext

		const result = (await handlers.getAgentDashboardData(
			{ type: "getAgentDashboardData" },
			mockCtx,
		)) as {
			agents: Array<{
				modeId: string
				thinkingLevel: string
				gitBranch: string
				isCurrentSession: boolean
			}>
			totals: {
				totalCount: number
			}
		}

		expect(result.agents).toHaveLength(1)
		expect(result.agents[0].modeId).toBe("plan")
		expect(result.agents[0].thinkingLevel).toBe("high")
		expect(result.agents[0].gitBranch).toBe("feature/mode-test")
		expect(result.agents[0].isCurrentSession).toBe(true)
		expect(result.totals.totalCount).toBe(1)
	})

	it("falls back to defaults if modeId or thinkingLevel are undefined", async () => {
		const handlers = getDashboardHandlers()
		const mockSessionPath = process.cwd()

		const mockCtx = {
			sessions: new Map([
				[
					mockSessionPath,
					{
						harness: {
							getState: () => ({
								projectName: "default-project",
								gitBranch: "main",
								tasks: [],
							}),
							getTokenUsage: () => ({
								promptTokens: 0,
								completionTokens: 0,
								totalTokens: 0,
							}),
						},
						electronState: {
							getState: () => ({
								linkedLinearIssueId: null,
								linkedLinearIssueIdentifier: null,
								linkedGithubIssueNumber: 0,
							}),
						},
					},
				],
			]),
			sessionTimings: new Map(),
			activeSessionPath: "",
			cleanupSession: vi.fn(),
		} as unknown as IpcContext

		const result = (await handlers.getAgentDashboardData(
			{ type: "getAgentDashboardData" },
			mockCtx,
		)) as {
			agents: Array<{
				modeId: string
				thinkingLevel: string
			}>
		}

		expect(result.agents).toHaveLength(1)
		expect(result.agents[0].modeId).toBe("react")
		expect(result.agents[0].thinkingLevel).toBe("off")
	})
})
