import type { AgentCard, JSONRPCRequest, JSONRPCResponse } from "../types.js"

export interface A2AClientOptions {
	cardUrl?: string
	baseUrl?: string
	token?: string
	fetch?: typeof globalThis.fetch
}

export class A2AClient {
	private cardUrl?: string
	private baseUrl: string
	private token?: string
	private card?: AgentCard
	private fetchFn: typeof globalThis.fetch

	constructor(options: A2AClientOptions) {
		this.cardUrl = options.cardUrl
		this.token = options.token
		this.fetchFn = options.fetch || globalThis.fetch.bind(globalThis)

		if (options.baseUrl) {
			this.baseUrl = options.baseUrl.replace(/\/+$/, "")
		} else if (options.cardUrl) {
			const parsed = new URL(options.cardUrl)
			this.baseUrl = `${parsed.protocol}//${parsed.host}`
		} else {
			this.baseUrl = "http://127.0.0.1:3888"
		}
	}

	async fetchCard(): Promise<AgentCard> {
		const targetUrl =
			this.cardUrl || `${this.baseUrl}/.well-known/agent-card.json`
		const headers: Record<string, string> = {
			Accept: "application/json",
		}
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`
		}

		const res = await this.fetchFn(targetUrl, { headers })
		if (!res.ok) {
			throw new Error(
				`Failed to fetch agent card from ${targetUrl}: HTTP ${res.status}`,
			)
		}

		this.card = (await res.json()) as AgentCard
		return this.card
	}

	async getAgentCard(): Promise<AgentCard> {
		return this.fetchCard()
	}

	getCard(): AgentCard | undefined {
		return this.card
	}

	async call(method: string, params: Record<string, any> = {}): Promise<any> {
		const endpoint =
			this.card?.supportedInterfaces?.[0]?.url || `${this.baseUrl}/a2a`

		const req: JSONRPCRequest = {
			jsonrpc: "2.0",
			id: Date.now(),
			method,
			params,
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
		}
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`
		}

		const res = await this.fetchFn(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(req),
		})

		if (!res.ok) {
			throw new Error(`A2A request failed: HTTP ${res.status}`)
		}

		const json: JSONRPCResponse = await res.json()
		if (json.error) {
			throw new Error(`A2A error [${json.error.code}]: ${json.error.message}`)
		}

		return json.result
	}

	// Convenience methods
	async listProjects() {
		return this.call("projects/list")
	}

	async createProject(params: {
		path: string
		name?: string
		initGit?: boolean
	}) {
		return this.call("projects/create", params)
	}

	async openProject(path: string) {
		return this.call("projects/open", { path })
	}

	async listThreads(projectPath?: string) {
		return this.call("threads/list", { projectPath })
	}

	async createThread(params?: { projectPath?: string; title?: string }) {
		return this.call("threads/create", params)
	}

	async sendMessage(params: {
		contextId?: string
		projectPath?: string
		message: { text: string }
		mode?: string
	}) {
		return this.call("message/send", params)
	}

	async getTask(contextId: string) {
		return this.call("tasks/get", { contextId })
	}

	async cancelTask(contextId: string) {
		return this.call("tasks/cancel", { contextId })
	}

	async listApprovals(contextId: string) {
		return this.call("approvals/list", { contextId })
	}

	async submitApproval(params: {
		contextId: string
		approvalId: string
		decision: "allow" | "deny"
	}) {
		return this.call("approvals/submit", params)
	}

	async revertTask(params: { contextId: string; projectPath: string }) {
		return this.call("tasks/revert", params)
	}
}
