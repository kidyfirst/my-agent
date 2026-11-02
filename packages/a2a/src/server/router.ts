import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import type { JSONRPCRequest, JSONRPCResponse, A2ATask } from "../types.js"
import {
	type MyAgentHarness,
	saveRecentProject,
	loadRecentProjects,
	getActiveTaskBaseline,
	clearActiveTaskBaseline,
	revertToGitSnapshot,
} from "@my-agent/core"

export interface A2ARouterOptions {
	harness: MyAgentHarness
}

export class A2ARouter {
	private harness: MyAgentHarness

	constructor(options: A2ARouterOptions) {
		this.harness = options.harness
	}

	async handle(request: JSONRPCRequest): Promise<JSONRPCResponse> {
		const { id, method, params = {} } = request

		try {
			const result = await this.dispatch(method, params)
			return {
				jsonrpc: "2.0",
				id,
				result,
			}
		} catch (err: any) {
			console.error(`[A2A Router] Error handling method ${method}:`, err)
			return {
				jsonrpc: "2.0",
				id,
				error: {
					code: err.code || -32603,
					message: err.message || "Internal error",
					data: err.data,
				},
			}
		}
	}

	private async dispatch(method: string, params: any): Promise<any> {
		switch (method) {
			// ================= Projects =================
			case "projects/list":
				return this.listProjects()

			case "projects/create":
				return this.createProject(params)

			case "projects/open":
				return this.openProject(params)

			// ================= Threads =================
			case "threads/list":
				return this.listThreads(params)

			case "threads/create":
				return this.createThread(params)

			case "threads/get":
				return this.getThread(params)

			case "threads/delete":
				return this.deleteThread(params)

			// ================= Tasks / Messages =================
			case "message/send":
			case "tasks/create":
				return this.sendMessage(params)

			case "tasks/get":
				return this.getTask(params)

			case "tasks/cancel":
				return this.cancelTask(params)

			// ================= Approvals =================
			case "approvals/list":
				return this.listApprovals(params)

			case "approvals/submit":
				return this.submitApproval(params)

			// ================= Task Rollback =================
			case "tasks/revert":
				return this.revertTask(params)

			default:
				throw {
					code: -32601,
					message: `Method not found: ${method}`,
				}
		}
	}

	// ---------------- Handlers ----------------

	private async listProjects() {
		const recent = loadRecentProjects()
		const activePath = this.harness.activeSession?.resourceId || process.cwd()
		return {
			projects: recent.map((p) => ({
				rootPath: p.rootPath,
				name: p.name || path.basename(p.rootPath),
				lastOpened: p.lastOpened,
				isActive: activePath === p.rootPath,
			})),
		}
	}

	private async createProject(params: {
		path: string
		name?: string
		initGit?: boolean
	}) {
		if (!params.path?.trim()) {
			throw { code: -32602, message: "Missing required parameter 'path'" }
		}

		const absPath = path.resolve(params.path)
		if (!fs.existsSync(absPath)) {
			fs.mkdirSync(absPath, { recursive: true })
		}

		if (params.initGit) {
			const gitDir = path.join(absPath, ".git")
			if (!fs.existsSync(gitDir)) {
				try {
					execSync("git init", { cwd: absPath, stdio: "ignore" })
				} catch (e: any) {
					console.warn(
						"[A2A] git init failed during project creation:",
						e.message,
					)
				}
			}
		}

		const customName = params.name || path.basename(absPath)
		saveRecentProject(absPath, customName)

		return {
			success: true,
			project: {
				rootPath: absPath,
				name: customName,
			},
		}
	}

	private async openProject(params: { path: string }) {
		if (!params.path?.trim()) {
			throw { code: -32602, message: "Missing required parameter 'path'" }
		}

		const absPath = path.resolve(params.path)
		if (!fs.existsSync(absPath)) {
			throw {
				code: -32602,
				message: `Project directory does not exist: ${absPath}`,
			}
		}

		saveRecentProject(absPath, path.basename(absPath))
		return {
			success: true,
			activePath: absPath,
		}
	}

	private async listThreads(_params?: { projectPath?: string }) {
		const threads = await this.harness.listThreads()
		const resourceId = this.harness.activeSession?.resourceId || process.cwd()

		return {
			resourceId,
			threads: (threads || []).map((t) => ({
				id: t.id,
				title: t.title || "New Session",
				createdAt: t.createdAt,
				updatedAt: t.updatedAt,
			})),
		}
	}

	private async createThread(params: { projectPath?: string; title?: string }) {
		const created = await this.harness.createThread({
			title: params.title || "New Session",
		})
		const threadId = created?.id || this.harness.getCurrentThreadId()
		const resourceId = this.harness.activeSession?.resourceId || process.cwd()

		return {
			threadId,
			resourceId,
			title: created?.title || params.title || "New Session",
		}
	}

	private async getThread(params: { threadId: string }) {
		if (!params.threadId) {
			throw {
				code: -32602,
				message: "Missing required parameter 'threadId'",
			}
		}

		const messages = await this.harness.listMessages({
			threadId: params.threadId,
		})
		return {
			threadId: params.threadId,
			messages: messages || [],
		}
	}

	private async deleteThread(params: { threadId: string }) {
		if (!params.threadId) {
			throw {
				code: -32602,
				message: "Missing required parameter 'threadId'",
			}
		}

		await this.harness.deleteThread({ threadId: params.threadId })
		return {
			success: true,
			deletedThreadId: params.threadId,
		}
	}

	private async sendMessage(params: {
		contextId?: string
		projectPath?: string
		message: { text: string }
		mode?: string
	}) {
		const text = params.message?.text
		if (!text?.trim()) {
			throw {
				code: -32602,
				message: "Message must contain non-empty 'text'",
			}
		}

		let threadId = params.contextId
		if (!threadId) {
			const created = await this.harness.createThread()
			threadId = created?.id || this.harness.getCurrentThreadId()
		} else if (threadId !== this.harness.getCurrentThreadId()) {
			await this.harness.switchThread({ threadId })
		}

		const startTime = Date.now()

		// Execute turn and await completion
		await this.harness.sendMessage({
			content: text,
			threadId,
		})

		// Fetch resulting messages from store
		const messages = (await this.harness.listMessages({ threadId })) || []
		const lastAssistant = [...messages]
			.reverse()
			.find((m: any) => m.role === "assistant")

		return {
			taskId: `task-${Date.now()}`,
			contextId: threadId,
			status: "COMPLETED",
			durationMs: Date.now() - startTime,
			message: {
				role: "agent",
				parts: Array.isArray(lastAssistant?.content)
					? lastAssistant.content
					: [
							{
								type: "text",
								text:
									typeof lastAssistant?.content === "string"
										? lastAssistant.content
										: "",
							},
						],
			},
		}
	}

	private async getTask(params: { contextId: string }): Promise<A2ATask> {
		if (!params.contextId) {
			throw {
				code: -32602,
				message: "Missing required parameter 'contextId'",
			}
		}

		const threadId = params.contextId
		const isRunning = this.harness.isThreadRunning(threadId)
		const pendingApprovals = (this.harness.getPendingApprovals(threadId) ||
			[]) as any[]

		let status: A2ATask["status"] = "COMPLETED"
		if (isRunning) {
			status = pendingApprovals.length > 0 ? "INPUT_REQUIRED" : "WORKING"
		}

		return {
			taskId: `task-${threadId}`,
			contextId: threadId,
			status,
			pendingApprovals: pendingApprovals.map((a: any) => ({
				approvalId: a.toolCallId || a.id,
				toolName: a.toolName || a.name,
				args: a.args,
				description: a.description,
			})),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}
	}

	private async cancelTask(params: { contextId: string }) {
		if (!params.contextId) {
			throw {
				code: -32602,
				message: "Missing required parameter 'contextId'",
			}
		}

		await this.harness.abort({ threadId: params.contextId })
		return {
			success: true,
			cancelledContextId: params.contextId,
		}
	}

	private async listApprovals(params: { contextId: string }) {
		if (!params.contextId) {
			throw {
				code: -32602,
				message: "Missing required parameter 'contextId'",
			}
		}

		const approvals = (this.harness.getPendingApprovals(params.contextId) ||
			[]) as any[]
		return {
			contextId: params.contextId,
			approvals: approvals.map((a: any) => ({
				approvalId: a.toolCallId || a.id,
				toolName: a.toolName || a.name,
				args: a.args,
				description: a.description,
			})),
		}
	}

	private async submitApproval(params: {
		contextId: string
		approvalId: string
		decision: "allow" | "deny"
	}) {
		if (!params.contextId || !params.approvalId || !params.decision) {
			throw {
				code: -32602,
				message: "Missing required parameters: contextId, approvalId, decision",
			}
		}

		await this.harness.respondToToolApproval({
			toolCallId: params.approvalId,
			decision: params.decision === "allow" ? "approve" : "decline",
		})

		return {
			success: true,
			approvalId: params.approvalId,
			decision: params.decision,
		}
	}

	private async revertTask(params: {
		contextId: string
		projectPath?: string
	}) {
		if (!params.contextId) {
			throw {
				code: -32602,
				message: "Missing required parameter: contextId",
			}
		}

		const baseline = getActiveTaskBaseline(params.contextId)
		if (!baseline?.baselineTree) {
			return {
				success: false,
				message: "No active task snapshot found for this thread",
			}
		}

		const absPath = path.resolve(params.projectPath || baseline.projectRoot)
		const res = revertToGitSnapshot(absPath, { tree: baseline.baselineTree })
		if (res.success) {
			clearActiveTaskBaseline(params.contextId)
		}

		return {
			success: res.success,
			revertedFiles: res.revertedFiles,
			error: res.error,
		}
	}
}
