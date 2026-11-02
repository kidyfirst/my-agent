import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import {
	SessionRecorder,
	hashDescription,
	deriveReplayScript,
	expandAssistantStream,
	createReplayModel,
	createReplayTools,
	sessionRecordingManager,
	reconstructMessagesFromRecording,
} from "../index.js"

describe("SessionRecorder & Replay Engine", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "myagent-rec-test-"))
	})

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true })
		} catch {}
	})

	it("computes deterministic tool description hashes", () => {
		const hash1 = hashDescription("Read file contents")
		const hash2 = hashDescription("Read file contents")
		const hash3 = hashDescription("Write file contents")

		expect(hash1).toBe(hash2)
		expect(hash1).not.toBe(hash3)
		expect(hash1.length).toBe(16)
	})

	it("records session events, aggregates text/reasoning/tool chunks, and writes JSONL", async () => {
		const recorder = new SessionRecorder({
			threadId: "test-thread-1",
			runId: "run-101",
			sessionsDir: tempDir,
			cwd: "/mock/workspace",
			model: "deepseek-v4-pro",
		})

		expect(recorder.isRecording()).toBe(true)

		recorder.recordRunStart({
			systemPrompt: "You are a coding assistant.",
			tools: [
				{ name: "execute_command", description: "Run shell commands" },
				{ name: "write_file", description: "Write file content" },
			],
			stepLimit: 50,
		})

		recorder.recordStepStart(1, 1)

		// Stream reasoning chunks
		recorder.recordChunk({ type: "reasoning-delta", delta: "Thinking about " })
		recorder.recordChunk({ type: "reasoning-delta", delta: "the task..." })

		// Stream text chunks — the wrapped provider stream uses `delta`, not the
		// legacy `textDelta`; using the old shape here hid a bug that recorded
		// every fragment as an empty string.
		recorder.recordChunk({ type: "text-delta", id: "t1", delta: "Hello, " })
		recorder.recordChunk({ type: "text-delta", id: "t1", delta: "world!" })

		// Stream tool calls
		recorder.recordChunk({
			type: "tool-call",
			toolCallId: "call-1",
			toolName: "execute_command",
			input: { command: "ls -la" },
		})

		// Tool result
		recorder.recordToolResult({
			turn: 1,
			step: 1,
			toolCallId: "call-1",
			toolName: "execute_command",
			input: { command: "ls -la" },
			output: "file1.txt\nfile2.txt",
			isError: false,
		})

		// Low frequency finish chunk
		recorder.recordChunk({
			type: "finish",
			finishReason: "stop",
		})

		recorder.recordAssistantStream({
			turn: 1,
			step: 1,
			finishReason: "stop",
		})

		recorder.recordRunEnd({
			status: "completed",
			finishReason: "stop",
		})

		await recorder.close()

		const filePath = recorder.filePath
		expect(fs.existsSync(filePath)).toBe(true)

		const content = fs.readFileSync(filePath, "utf8")
		const lines = content.trim().split("\n")
		expect(lines.length).toBeGreaterThanOrEqual(5)

		const events = lines.map((l) => JSON.parse(l))
		expect(events[0].type).toBe("session")
		expect(events[0].cwd).toBe("/mock/workspace")
		expect(events[1].type).toBe("run/start")
		expect(events[1].data.systemPrompt).toBe("You are a coding assistant.")
		expect(events[1].data.tools.length).toBe(2)
		expect(events[2].type).toBe("step/start")

		const streamEvent = events.find((e) => e.type === "assistant/stream")
		expect(streamEvent).toBeTruthy()
		const streamRecords = streamEvent.data.stream

		// Verify reasoning chunk aggregation
		const reasoningRecord = streamRecords.find(
			(r: any) => r.type === "reasoning-chunks",
		)
		expect(reasoningRecord).toBeTruthy()
		expect(reasoningRecord.texts).toEqual(["Thinking about ", "the task..."])
		expect(reasoningRecord.dt.length).toBe(2)

		// Verify text chunk aggregation
		const textRecord = streamRecords.find((r: any) => r.type === "text-chunks")
		expect(textRecord).toBeTruthy()
		expect(textRecord.texts).toEqual(["Hello, ", "world!"])

		// Verify tool call aggregation
		const toolCallRecord = streamRecords.find(
			(r: any) => r.type === "tool-call-chunks",
		)
		expect(toolCallRecord).toBeTruthy()
		expect(toolCallRecord.ids).toEqual(["call-1"])
		expect(toolCallRecord.names).toEqual(["execute_command"])

		const runEndEvent = events.find((e) => e.type === "run/end")
		expect(runEndEvent).toBeTruthy()
		expect(runEndEvent.data.status).toBe("completed")
	})

	it("records the user prompt and reconstructs a readable replay", async () => {
		const recorder = new SessionRecorder({
			threadId: "thread-replay",
			runId: "run-replay",
			sessionsDir: tempDir,
			cwd: "/mock/workspace",
			model: "deepseek-flash",
		})

		recorder.recordRunStart({
			systemPrompt: "sys",
			userPrompt: "把本地修改提交到远端",
			tools: [],
			stepLimit: 50,
		})
		recorder.recordStepStart(1, 1)
		recorder.recordChunk({ type: "text-start", id: "t1" })
		recorder.recordChunk({ type: "text-delta", id: "t1", delta: "我先看" })
		recorder.recordChunk({ type: "text-delta", id: "t1", delta: "一下状态。" })
		recorder.recordChunk({ type: "text-end", id: "t1" })
		recorder.recordChunk({ type: "finish", finishReason: "stop" })
		recorder.recordAssistantStream({ turn: 1, step: 1, finishReason: "stop" })
		recorder.recordRunEnd({ status: "completed", finishReason: "stop" })
		await recorder.close()

		const content = fs.readFileSync(recorder.filePath, "utf8")
		const runStart = content
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l))
			.find((e) => e.type === "run/start")
		expect(runStart.data.userPrompt).toBe("把本地修改提交到远端")

		const messages = reconstructMessagesFromRecording(
			content,
			"thread-replay",
			"my-agent-abc123",
		)
		expect(messages).toHaveLength(2)
		// Replay rows must carry the thread's resourceId, otherwise the message
		// query filters them out and the replay renders as an empty conversation.
		expect(messages[0].resourceId).toBe("my-agent-abc123")
		expect(messages[1].resourceId).toBe("my-agent-abc123")
		expect(messages[0].content.content).toBe("把本地修改提交到远端")
		expect(messages[1].content.content).toBe("我先看一下状态。")
	})

	it("skips the user bubble when a legacy recording has no userPrompt", () => {
		const legacy = [
			JSON.stringify({
				type: "session",
				version: 1,
				id: "s-legacy",
				createdAt: 1000,
				cwd: "/test",
				model: "deepseek-flash",
				recording: "recorded",
			}),
			JSON.stringify({
				type: "run/start",
				data: {
					runId: "s-legacy",
					threadId: "t-legacy",
					systemPrompt: "sys",
					tools: [],
					stepLimit: 50,
				},
			}),
			JSON.stringify({
				type: "assistant/stream",
				data: {
					turn: 1,
					step: 1,
					finishReason: "stop",
					stream: [{ type: "text-chunks", index: 0, dt: [0], texts: ["hi"] }],
				},
			}),
		].join("\n")

		const messages = reconstructMessagesFromRecording(
			legacy,
			"t-legacy",
			"res-1",
		)
		expect(messages).toHaveLength(1)
		expect(messages[0].role).toBe("assistant")
	})

	it("records the model / mode / permission runtime a replay has to restore", async () => {
		const runtime = {
			modelId: "deepseek/deepseek-flash",
			modeId: "plan",
			permissionMode: "read-only",
			thinkingLevel: "high",
			permissionRules: {
				categories: {
					read: "allow",
					edit: "deny",
					execute: "deny",
					mcp: "deny",
				},
				tools: { execute_command: "deny" },
			},
		}

		const recorder = new SessionRecorder({
			threadId: "thread-runtime",
			runId: "run-runtime",
			sessionsDir: tempDir,
			cwd: "/mock/workspace",
			model: runtime.modelId,
			runtime,
		})

		recorder.recordRunStart({
			systemPrompt: "sys",
			userPrompt: "只看看，不要改文件",
			tools: [],
			stepLimit: 50,
			runtime,
		})
		recorder.recordChunk({
			type: "text-delta",
			id: "t1",
			delta: "只有一个文件。",
		})
		recorder.recordChunk({ type: "finish", finishReason: "stop" })
		recorder.recordAssistantStream({ turn: 1, step: 1, finishReason: "stop" })
		recorder.recordRunEnd({ status: "completed", finishReason: "stop" })
		await recorder.close()

		const content = fs.readFileSync(recorder.filePath, "utf8")
		const events = content
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l))
		expect(events[0].runtime).toEqual(runtime)
		expect(events[1].data.runtime).toEqual(runtime)

		const script = deriveReplayScript(content)
		expect(script.session?.runtime).toEqual(runtime)
		expect(script.runtime).toEqual(runtime)
	})

	it("falls back to the session header runtime for legacy run/start events", () => {
		const runtime = { modelId: "deepseek/deepseek-flash", modeId: "react" }
		const legacy = [
			JSON.stringify({
				type: "session",
				version: 1,
				id: "s-rt",
				createdAt: 1000,
				cwd: "/test",
				model: "deepseek/deepseek-flash",
				recording: "recorded",
				runtime,
			}),
			JSON.stringify({
				type: "run/start",
				data: {
					runId: "s-rt",
					threadId: "t-rt",
					systemPrompt: "sys",
					tools: [],
					stepLimit: 50,
				},
			}),
			JSON.stringify({
				type: "assistant/stream",
				data: {
					turn: 1,
					step: 1,
					finishReason: "stop",
					stream: [{ type: "text-chunks", index: 0, dt: [0], texts: ["hi"] }],
				},
			}),
		].join("\n")

		const script = deriveReplayScript(legacy)
		expect(script.runtime).toEqual(runtime)
	})

	it("derives ReplayEntries and rejects missing finish chunks", async () => {
		const validJsonl = [
			JSON.stringify({
				type: "session",
				version: 1,
				id: "s1",
				createdAt: 1000,
				cwd: "/test",
				model: "deepseek-flash",
				recording: "recorded",
			}),
			JSON.stringify({
				type: "run/start",
				data: {
					runId: "r1",
					threadId: "t1",
					systemPrompt: "sys",
					tools: [],
					stepLimit: 50,
				},
			}),
			JSON.stringify({
				type: "assistant/stream",
				data: {
					turn: 1,
					step: 1,
					stream: [
						{ type: "text-chunks", index: 0, dt: [0, 5], texts: ["a", "b"] },
						{ type: "chunk", chunk: { type: "finish", finishReason: "stop" } },
					],
					finishReason: "stop",
				},
			}),
			JSON.stringify({
				type: "run/end",
				data: { status: "completed", finishReason: "stop" },
			}),
		].join("\n")

		const script = deriveReplayScript(validJsonl)
		expect(script.session?.id).toBe("s1")
		expect(script.systemPrompt).toBe("sys")
		expect(script.entries.length).toBe(1)
		expect(script.entries[0].turn).toBe(1)
		expect(script.entries[0].finishReason).toBe("stop")

		// Now test invalid stream missing termination
		const invalidJsonl = [
			JSON.stringify({
				type: "session",
				version: 1,
				id: "s2",
				createdAt: 1000,
				cwd: "/test",
				model: "deepseek-flash",
				recording: "recorded",
			}),
			JSON.stringify({
				type: "run/start",
				data: {
					runId: "r2",
					threadId: "t2",
					systemPrompt: "sys",
					tools: [],
					stepLimit: 50,
				},
			}),
			JSON.stringify({
				type: "assistant/stream",
				data: {
					turn: 1,
					step: 1,
					stream: [
						{ type: "text-chunks", index: 0, dt: [0], texts: ["incomplete"] },
					],
					finishReason: null,
				},
			}),
		].join("\n")

		expect(() => deriveReplayScript(invalidJsonl)).toThrow(
			/missing finish chunk or finishReason/,
		)
	})

	it("expandAssistantStream and createReplayModel provide offline reproducible stream with assertConsumed", async () => {
		const records = [
			{
				type: "reasoning-chunks" as const,
				index: 0,
				dt: [0],
				texts: ["think"],
			},
			{
				type: "text-chunks" as const,
				index: 1,
				dt: [0, 10],
				texts: ["part1", "part2"],
			},
			{
				type: "tool-call-chunks" as const,
				index: 2,
				dt: [0],
				ids: ["tc-1"],
				names: ["view"],
				args: [JSON.stringify({ path: "README.md" })],
			},
			{
				type: "chunk" as const,
				chunk: { type: "finish", finishReason: "stop" },
			},
		]

		const chunks = expandAssistantStream(records)
		expect(chunks.length).toBe(5)
		expect(chunks[0].type).toBe("reasoning")
		expect(chunks[1].type).toBe("text-delta")
		expect(chunks[1].textDelta).toBe("part1")
		expect(chunks[2].type).toBe("text-delta")
		expect(chunks[2].textDelta).toBe("part2")
		expect(chunks[3].type).toBe("tool-call")
		expect(chunks[3].toolName).toBe("view")

		const replayModel = createReplayModel([
			{
				runId: "r1",
				threadId: "t1",
				turn: 1,
				step: 1,
				streamRecords: records,
				finishReason: "stop",
				toolResults: [],
			},
		])

		expect(replayModel.specificationVersion).toBe("v3")
		expect(replayModel.getTotalCount()).toBe(1)
		expect(replayModel.getConsumedCount()).toBe(0)

		// Before consuming: assertConsumed throws
		expect(() => replayModel.assertConsumed()).toThrow(
			/Replay script not fully consumed/,
		)

		// Consume stream
		const { stream } = await replayModel.doStream()
		const reader = stream.getReader()
		const received: any[] = []
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			received.push(value)
		}

		expect(received.length).toBe(5)
		expect(replayModel.getConsumedCount()).toBe(1)

		// Now assertConsumed passes!
		expect(() => replayModel.assertConsumed()).not.toThrow()

		// Attempting another stream when exhausted throws
		await expect(replayModel.doStream()).rejects.toThrow(
			/Replay script exhausted/,
		)
	})

	it("createReplayTools isolates command execution and virtualizes disk writes", async () => {
		let realCommandExecuted = false
		let realFileWritten = false

		const originalTools = {
			execute_command: {
				description: "run command",
				execute: async () => {
					realCommandExecuted = true
					return { stdout: "real output" }
				},
			},
			write_file: {
				description: "write file",
				execute: async () => {
					realFileWritten = true
					return { success: true }
				},
			},
		}

		const replayTools = createReplayTools(originalTools, [
			{
				turn: 1,
				step: 1,
				toolCallId: "call-99",
				toolName: "execute_command",
				input: { command: "git status" },
				output: { stdout: "On branch main, working tree clean" },
				isError: false,
			},
		])

		// Test execute_command interception
		const cmdRes = await replayTools.execute_command.execute({
			command: "git status",
		})
		expect(realCommandExecuted).toBe(false)
		expect(cmdRes).toEqual({ stdout: "On branch main, working tree clean" })

		// Test write_file virtualization
		const writeRes = await replayTools.write_file.execute({
			path: "test.txt",
			content: "data",
		})
		expect(realFileWritten).toBe(false)
		expect(writeRes.message).toContain(
			"[REPLAY] Write tool 'write_file' isolated",
		)
	})

	it("sessionRecordingManager handles toggle, status, and listing", () => {
		sessionRecordingManager.stopRecording("thread-abc", "/proj/repo")
		expect(
			sessionRecordingManager.isRecording("thread-abc", "/proj/repo"),
		).toBe(false)

		const state1 = sessionRecordingManager.toggleRecording(
			"thread-abc",
			"/proj/repo",
		)
		expect(state1).toBe(true)
		expect(sessionRecordingManager.isRecording("thread-abc")).toBe(true)
		expect(sessionRecordingManager.isRecording(undefined, "/proj/repo")).toBe(
			true,
		)

		const status = sessionRecordingManager.getStatus()
		expect(status.recordingThreads).toContain("thread-abc")

		const state2 = sessionRecordingManager.toggleRecording(
			"thread-abc",
			"/proj/repo",
		)
		expect(state2).toBe(false)
		expect(
			sessionRecordingManager.isRecording("thread-abc", "/proj/repo"),
		).toBe(false)
	})

	it("reconstructs conversation messages from session recording", () => {
		const jsonl = [
			JSON.stringify({
				type: "session",
				version: 1,
				id: "run-turn-1",
				createdAt: 1730000000000,
				cwd: "/workspace",
				model: "deepseek-chat",
				recording: "recorded",
			}),
			JSON.stringify({
				type: "run/start",
				data: {
					runId: "run-turn-1",
					threadId: "thread-xyz",
					systemPrompt: "You are an assistant",
					userPrompt: "在么？",
					tools: [{ name: "view", descriptionHash: "1234" }],
					stepLimit: 50,
				},
			}),
			JSON.stringify({
				type: "assistant/stream",
				data: {
					turn: 1,
					step: 1,
					stream: [
						{
							type: "reasoning-chunks",
							index: 0,
							dt: [10],
							texts: ["Thinking about response..."],
						},
						{
							type: "tool-call-chunks",
							index: 1,
							dt: [10],
							ids: ["call-view-1"],
							names: ["view"],
							args: ['{"path":"README.md"}'],
						},
					],
					finishReason: null,
				},
			}),
			JSON.stringify({
				type: "tool/result",
				data: {
					turn: 1,
					step: 1,
					toolCallId: "call-view-1",
					toolName: "view",
					input: { path: "README.md" },
					output: "# Hello Repo",
					isError: false,
				},
			}),
			JSON.stringify({
				type: "assistant/stream",
				data: {
					turn: 1,
					step: 2,
					stream: [
						{
							type: "text-chunks",
							index: 0,
							dt: [10],
							texts: ["在。README 内容已查看。"],
						},
					],
					finishReason: "stop",
				},
			}),
			JSON.stringify({
				type: "run/end",
				data: { status: "completed", finishReason: "stop" },
			}),
		].join("\n")

		const messages = reconstructMessagesFromRecording(jsonl, "thread-xyz")
		expect(messages.length).toBe(2)

		// 1. User message
		const userMsg = messages[0]
		expect(userMsg.role).toBe("user")
		expect(userMsg.content.content).toBe("在么？")
		expect(userMsg.threadId).toBe("thread-xyz")

		// 2. Assistant message
		const assistantMsg = messages[1]
		expect(assistantMsg.role).toBe("assistant")
		expect(assistantMsg.content.format).toBe(2)
		expect(assistantMsg.content.reasoning).toContain(
			"Thinking about response...",
		)
		expect(assistantMsg.content.content).toContain("在。README 内容已查看。")

		const parts = assistantMsg.content.parts
		const thinkingPart = parts.find((p: any) => p.type === "thinking")
		expect(thinkingPart).toBeDefined()
		expect(thinkingPart.text).toContain("Thinking about response...")

		const toolCallPart = parts.find((p: any) => p.type === "tool-call")
		expect(toolCallPart).toBeDefined()
		expect(toolCallPart.toolName).toBe("view")

		const toolResultPart = parts.find((p: any) => p.type === "tool-result")
		expect(toolResultPart).toBeDefined()
		expect(toolResultPart.result).toBe("# Hello Repo")

		const textPart = parts.find((p: any) => p.type === "text")
		expect(textPart).toBeDefined()
		expect(textPart.text).toBe("在。README 内容已查看。")
	})
})
