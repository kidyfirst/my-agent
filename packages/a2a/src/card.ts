import type { AgentCard } from "./types.js"

export function createAgentCard(options?: {
	baseUrl?: string
	host?: string
	port?: number
	version?: string
	name?: string
	description?: string
}): AgentCard & { url: string } {
	let base = options?.baseUrl
	if (!base && options?.port) {
		base = `http://${options.host || "localhost"}:${options.port}`
	}
	const {
		baseUrl = base || "http://localhost:3888",
		version = "0.1.3",
		name = "My Agent",
		description = "Autonomous full-stack code engineering and workspace agent supporting multi-thread development, git snapshot safety, and human-in-the-loop tool approvals.",
	} = options || {}
	const a2aEndpoint = `${baseUrl.replace(/\/+$/, "")}/a2a`

	return {
		name,
		description,
		url: a2aEndpoint,
		version,
		provider: {
			organization: "My Agent Open Project",
			url: "https://github.com/kidyfirst/my-agent",
		},
		supportedInterfaces: [
			{
				url: a2aEndpoint,
				protocolBinding: "JSON-RPC",
				protocolVersion: "1.0",
			},
		],
		capabilities: {
			streaming: true,
			humanInTheLoop: true,
			stateTransitionHistory: true,
		},
		defaultInputModes: ["text/plain", "application/json"],
		defaultOutputModes: ["text/markdown", "application/json"],
		skills: [
			{
				id: "projects/manage",
				name: "Project Management",
				description:
					"Create, inspect, and open local project repositories and worktrees.",
				parameters: {
					type: "object",
					properties: {
						action: {
							type: "string",
							enum: ["list", "create", "open"],
						},
						path: { type: "string" },
						initGit: { type: "boolean" },
					},
				},
			},
			{
				id: "threads/manage",
				name: "Thread Management",
				description:
					"Create, list, inspect, and delete conversation sessions for a project workspace.",
				parameters: {
					type: "object",
					properties: {
						action: {
							type: "string",
							enum: ["list", "create", "get", "delete"],
						},
						projectPath: { type: "string" },
						threadId: { type: "string" },
					},
				},
			},
			{
				id: "code-engineering",
				name: "Code Engineering & Execution",
				description:
					"Execute multi-turn autonomous coding tasks, file refactoring, AST smart edits, and terminal testing with streaming feedback.",
				parameters: {
					type: "object",
					properties: {
						prompt: { type: "string" },
						contextId: { type: "string" },
						projectPath: { type: "string" },
						mode: {
							type: "string",
							enum: ["react", "plan", "fast"],
						},
					},
					required: ["prompt"],
				},
			},
			{
				id: "approvals/manage",
				name: "Tool Approval Negotiation",
				description:
					"Review pending sensitive tool calls (terminal command execution, file modifications) and submit human approval or rejection.",
				parameters: {
					type: "object",
					properties: {
						action: { type: "string", enum: ["list", "submit"] },
						contextId: { type: "string" },
						approvalId: { type: "string" },
						decision: { type: "string", enum: ["allow", "deny"] },
					},
				},
			},
			{
				id: "tasks/rollback",
				name: "Task Snapshot Rollback",
				description:
					"Safely revert all uncommitted code modifications made during a task back to its baseline git snapshot.",
				parameters: {
					type: "object",
					properties: {
						contextId: { type: "string" },
						projectPath: { type: "string" },
					},
					required: ["contextId", "projectPath"],
				},
			},
		],
	}
}
