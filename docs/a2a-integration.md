# A2A (Agent-to-Agent) Protocol Integration Guide

This guide explains how external agents (OpenAI Codex, Claude Code, Goose, Cursor, or custom autonomous orchestrators) discover and operate **My Agent** via the standard A2A protocol.

---

## 1. Quick Overview

My Agent exposes an A2A-compliant interface on `http://127.0.0.1:3888`:

- **Discovery**: `GET /.well-known/agent-card.json`
- **JSON-RPC 2.0**: `POST /a2a`
- **Real-time SSE Stream**: `GET /a2a/stream?prompt=...&contextId=...`
- **Health Check**: `GET /health`

All operations executed through A2A (or CLI) operate on the authoritative **Core Engine** and synchronize state changes to the **Electron Desktop UI** in real time via the Event Bus.

---

## 2. Agent Card Discovery

An external agent probes `http://127.0.0.1:3888/.well-known/agent-card.json`:

```json
{
	"name": "My Agent",
	"description": "Autonomous full-stack code engineering and workspace agent supporting multi-thread development, git snapshot safety, and human-in-the-loop tool approvals.",
	"version": "0.1.3",
	"url": "http://127.0.0.1:3888/a2a",
	"capabilities": {
		"streaming": true,
		"humanInTheLoop": true,
		"stateTransitionHistory": true
	},
	"skills": [
		{ "id": "projects/manage", "name": "Project Management" },
		{ "id": "threads/manage", "name": "Thread Management" },
		{ "id": "code-engineering", "name": "Code Engineering & Execution" },
		{ "id": "approvals/manage", "name": "Tool Approval Negotiation" },
		{ "id": "tasks/rollback", "name": "Task Snapshot Rollback" }
	]
}
```

---

## 3. How to Connect OpenAI Codex / Claude Code

### Option A: Using Codex Agent Config (`~/.codex/config.json`)

Add My Agent as a subordinate specialist agent:

```json
{
	"agents": {
		"my-agent": {
			"type": "a2a",
			"url": "http://127.0.0.1:3888/a2a",
			"agentCardUrl": "http://127.0.0.1:3888/.well-known/agent-card.json",
			"skills": ["code-engineering", "projects/manage", "tasks/rollback"]
		}
	}
}
```

### Option B: Using Claude Code MCP / A2A Bridge

If Claude Code is using an MCP-to-A2A bridge or standard HTTP tool:

```json
{
	"mcpServers": {
		"my-agent": {
			"command": "npx",
			"args": ["-y", "@my-agent/cli", "serve", "--port", "3888"]
		}
	}
}
```

---

## 4. JSON-RPC API Reference

All requests are sent to `POST http://127.0.0.1:3888/a2a` with `Content-Type: application/json`.

### 4.1 Project Management

#### `projects/list`

List recent workspaces.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "projects/list", "params": {} }
```

#### `projects/create`

Create a new project directory and optionally initialize git.

```json
{
	"jsonrpc": "2.0",
	"id": 2,
	"method": "projects/create",
	"params": {
		"path": "/Users/user/projects/new-feature",
		"name": "New Feature",
		"initGit": true
	}
}
```

#### `projects/open`

Set active workspace.

```json
{
	"jsonrpc": "2.0",
	"id": 3,
	"method": "projects/open",
	"params": { "path": "/Users/user/projects/new-feature" }
}
```

---

### 4.2 Thread & Conversation Management

#### `threads/create`

```json
{
	"jsonrpc": "2.0",
	"id": 4,
	"method": "threads/create",
	"params": { "title": "Refactor auth module" }
}
```

#### `threads/list`

```json
{ "jsonrpc": "2.0", "id": 5, "method": "threads/list", "params": {} }
```

---

### 4.3 Task Execution

#### `message/send`

Send a coding task to the agent:

```json
{
	"jsonrpc": "2.0",
	"id": 6,
	"method": "message/send",
	"params": {
		"contextId": "thread-123",
		"message": {
			"text": "Add vitest test suite for auth module and fix any type errors"
		}
	}
}
```

---

### 4.4 Tool Approvals (Human-in-the-Loop)

#### `approvals/list`

```json
{
	"jsonrpc": "2.0",
	"id": 7,
	"method": "approvals/list",
	"params": { "contextId": "thread-123" }
}
```

#### `approvals/submit`

Approve or deny sensitive commands (bash execution, file deletions):

```json
{
	"jsonrpc": "2.0",
	"id": 8,
	"method": "approvals/submit",
	"params": {
		"contextId": "thread-123",
		"approvalId": "call_abc456",
		"decision": "allow"
	}
}
```

---

### 4.5 Task Snapshot Rollback

If a task produces undesirable modifications, roll back all uncommitted changes back to the task baseline:

```json
{
	"jsonrpc": "2.0",
	"id": 9,
	"method": "tasks/revert",
	"params": {
		"contextId": "thread-123",
		"projectPath": "/Users/user/projects/new-feature"
	}
}
```

---

## 5. Using the Official TypeScript Client (`@my-agent/a2a`)

```ts
import { A2AClient } from "@my-agent/a2a"

const client = new A2AClient({
	baseUrl: "http://127.0.0.1:3888",
})

// 1. Fetch Agent Card
const card = await client.getAgentCard()
console.log(`Connected to ${card.name} v${card.version}`)

// 2. Create a session thread
const { threadId } = await client.createThread({ title: "Autonomous Refactor" })

// 3. Dispatch coding instructions
const task = await client.sendMessage({
	contextId: threadId,
	message: { text: "Scan project and ensure all unit tests pass" },
})

console.log("Agent response:", task.message.parts[0].text)
```
