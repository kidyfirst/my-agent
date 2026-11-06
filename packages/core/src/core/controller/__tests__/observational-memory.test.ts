import { describe, it, expect, vi } from "vitest"
import { MockLanguageModelV3 } from "ai/test"
import { SQLiteStore } from "../../../store/index.js"
import { AgentController } from "../controller.js"
import { Agent } from "../../agent/index.js"
import { Memory } from "../../../memory/index.js"

function streamOf(chunks: any[]): ReadableStream {
	let index = 0
	return new ReadableStream({
		pull(controller) {
			if (index < chunks.length) controller.enqueue(chunks[index++])
			else controller.close()
		},
	})
}

const mockUsage = {
	inputTokens: { total: 10, prompt: 10 },
	outputTokens: { total: 10, completion: 10 },
}

function reply(text: string) {
	return {
		stream: streamOf([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "0" },
			{ type: "text-delta", id: "0", delta: text },
			{ type: "text-end", id: "0" },
			{ type: "finish", finishReason: "stop", usage: mockUsage },
		]),
		warnings: [],
	}
}

/** Seeds enough oversized history that the 64k token window is exceeded. */
async function seedOverflowingHistory(
	storage: SQLiteStore,
	threadId: string,
	resourceId: string,
	char: string,
) {
	const store = await storage.getStore("memory")
	const big = char.repeat(40_000)
	const seeded: any[] = []
	for (let i = 0; i < 8; i++) {
		seeded.push({
			id: `${char}-${i}`,
			role: i % 2 === 0 ? "user" : "assistant",
			content: {
				format: 2,
				parts: [{ type: "text", text: big }],
				content: big,
			},
			threadId,
			resourceId,
			createdAt: new Date(Date.now() + i),
		})
	}
	await store.saveMessages({ messages: seeded })
	return store
}

function systemTextOf(prompt: any[]): string {
	const systemMsg = prompt.find((p: any) => p.role === "system")
	if (!systemMsg) return ""
	return Array.isArray(systemMsg.content)
		? systemMsg.content.map((c: any) => c.text ?? "").join("")
		: (systemMsg.content ?? "")
}

describe("Observational memory in the run loop", () => {
	it("injects the observation summary into the system prompt once history overflows", async () => {
		const promptsReceived: any[] = []
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				promptsReceived.push(options.prompt)
				return reply("ok")
			},
		})

		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const observe = vi.fn(async () => ({
			activeObservations: "- The retry helper lives in src/retry.ts",
			observedMessageIds: [],
			kind: "observed" as const,
			blocked: false,
		}))
		const memory = { observe, getSystemMessage: vi.fn(async () => null) }

		const agent = new Agent({
			id: "agent",
			name: "Agent",
			instructions: "Base instructions",
			model: () => model,
			tools: {},
		})
		const controller = new AgentController({ storage, agent, memory })
		await controller.init()
		const session = await controller.createSession({ resourceId: "test-res" })
		const thread = await session.thread.create({ title: "t" })

		await seedOverflowingHistory(storage, thread.id, "test-res", "x")

		await session.sendMessage({ content: "continue" })

		expect(observe).toHaveBeenCalled()
		const systemText = systemTextOf(promptsReceived[promptsReceived.length - 1])
		expect(systemText).toContain("Base instructions")
		expect(systemText).toContain("# Observational Memory")
		expect(systemText).toContain("src/retry.ts")

		await storage.close()
	})

	it("does not observe when history fits inside the window", async () => {
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("ok"),
		})
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const observe = vi.fn()
		const controller = new AgentController({
			storage,
			agent: new Agent({
				id: "agent",
				name: "Agent",
				instructions: "Base",
				model: () => model,
				tools: {},
			}),
			memory: { observe, getSystemMessage: vi.fn(async () => null) },
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "r" })

		await session.sendMessage({ content: "hi" })

		expect(observe).not.toHaveBeenCalled()
		await storage.close()
	})

	it("reports thresholds to the UI even before anything has been observed", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const memory = new Memory({
			storage,
			options: {
				observationalMemory: {
					enabled: true,
					observation: {
						messageTokens: 30_000,
						model: { generate: async () => ({ text: "" }) },
					},
					reflection: { observationTokens: 40_000 },
				},
			},
		})
		const controller = new AgentController({
			storage,
			memory: () => memory,
			agent: {
				getInstructions: async () => "x",
				getModel: async () => null,
				listTools: async () => ({}),
			} as any,
		})
		await controller.init()

		const progress = (await controller.loadOMProgress("some-resource")) as any
		// Before observing, the tracker still needs the trigger points: a user
		// wants to see how close the thread is to compaction, not only after it ran.
		expect(progress.threshold).toBe(30_000)
		expect(progress.reflectionThreshold).toBeGreaterThan(40_000)
		expect(progress.pendingTokens).toBe(0)
		expect(progress.generationCount).toBe(0)
		expect(progress.status).toBe("idle")
		expect(progress.buffered.observations.status).toBe("idle")

		await storage.close()
	})

	it("reflects what was actually observed", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const memory = new Memory({
			storage,
			options: {
				observationalMemory: {
					enabled: true,
					observation: {
						messageTokens: 100,
						bufferTokens: 1 / 5,
						model: { generate: async () => ({ text: "- a fact" }) },
					},
				},
			},
		})
		const controller = new AgentController({
			storage,
			memory: () => memory,
			agent: {
				getInstructions: async () => "x",
				getModel: async () => null,
				listTools: async () => ({}),
			} as any,
		})
		await controller.init()

		// The thread must exist in storage: `loadOMProgress` is given only a
		// resourceId by the UI, so it resolves the thread by listing them. An
		// unsaved thread id would silently report an empty record.
		const session = await controller.createSession({ resourceId: "res-1" })
		const thread = await session.thread.create({ title: "t" })

		await memory.observe({
			threadId: thread.id,
			resourceId: "res-1",
			messages: [{ id: "m1", role: "user", content: "hi" }],
			pendingTokens: 500,
		})

		const progress = (await controller.loadOMProgress("res-1")) as any
		expect(progress.generationCount).toBe(1)
		expect(progress.pendingTokens).toBe(500)
		expect(progress.observationTokens).toBeGreaterThan(0)
		expect(progress.thresholdPercent).toBeGreaterThan(0)

		await storage.close()
	})

	it("returns an empty object when observational memory is off", async () => {
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()
		const controller = new AgentController({
			storage,
			memory: () => new Memory({ storage }),
			agent: {
				getInstructions: async () => "x",
				getModel: async () => null,
				listTools: async () => ({}),
			} as any,
		})
		await controller.init()
		// `{}` is what the tracker treats as "hidden", which is correct when the
		// feature is off rather than a silently broken widget.
		expect(await controller.loadOMProgress("res")).toEqual({})
		await storage.close()
	})

	it("keeps the turn working when observation throws", async () => {
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("still fine"),
		})
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const controller = new AgentController({
			storage,
			agent: new Agent({
				id: "agent",
				name: "Agent",
				instructions: "Base",
				model: () => model,
				tools: {},
			}),
			memory: {
				observe: vi.fn(async () => {
					throw new Error("observer exploded")
				}),
				getSystemMessage: vi.fn(async () => null),
			},
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "r" })
		const thread = await session.thread.create({ title: "t" })
		await seedOverflowingHistory(storage, thread.id, "r", "y")

		const events: any[] = []
		session.subscribe((e: any) => events.push(e))

		await session.sendMessage({ content: "continue" })

		expect(events.some((e) => e.type === "message_end")).toBe(true)
		await storage.close()
	})

	it("calls getInputProcessors and getOutputProcessors during the run loop", async () => {
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("processed"),
		})
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const processInput = vi.fn(async ({ messageList }) => messageList)
		const processOutputResult = vi.fn(async () => {})

		const memory = {
			getInputProcessors: vi.fn(async () => [{ processInput }]),
			getOutputProcessors: vi.fn(async () => [{ processOutputResult }]),
			getSystemMessage: vi.fn(async () => null),
		}

		const controller = new AgentController({
			storage,
			agent: new Agent({
				id: "agent",
				name: "Agent",
				instructions: "Base",
				model: () => model,
				tools: {},
			}),
			memory,
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "r-proc" })
		await session.sendMessage({ content: "test processors" })

		expect(memory.getInputProcessors).toHaveBeenCalled()
		expect(processInput).toHaveBeenCalled()
		expect(memory.getOutputProcessors).toHaveBeenCalled()
		expect(processOutputResult).toHaveBeenCalled()

		await storage.close()
	})

	it("injects existing active observations into system instructions even when tokens are low", async () => {
		const promptsReceived: any[] = []
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async (options) => {
				promptsReceived.push(options.prompt)
				return reply("ok")
			},
		})
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const memory = {
			getSystemMessage: vi.fn(
				async () => "# Observational Memory\n- Prior decision: use SQLite",
			),
		}

		const controller = new AgentController({
			storage,
			agent: new Agent({
				id: "agent",
				name: "Agent",
				instructions: "System base instructions",
				model: () => model,
				tools: {},
			}),
			memory,
		})
		await controller.init()
		const session = await controller.createSession({ resourceId: "r-low" })
		await session.sendMessage({ content: "short turn" })

		const systemText = systemTextOf(promptsReceived[promptsReceived.length - 1])
		expect(systemText).toContain("System base instructions")
		expect(systemText).toContain("Prior decision: use SQLite")

		await storage.close()
	})

	it("triggers observation and persists record when bufferTrigger is reached", async () => {
		const model = new MockLanguageModelV3({
			modelId: "test-model",
			doStream: async () => reply("ok"),
		})
		const storage = new SQLiteStore({ url: ":memory:" })
		await storage.init()

		const memory = new Memory({
			storage,
			options: {
				observationalMemory: {
					enabled: true,
					observation: {
						messageTokens: 50,
						bufferTokens: 1 / 5, // 10 tokens bufferTrigger
						blockAfter: 2, // 100 tokens blockAfter
						model: {
							generate: async () => ({
								text: "- Durable fact recorded in production",
							}),
						},
					},
				},
			},
		})

		const controller = new AgentController({
			storage,
			agent: new Agent({
				id: "agent",
				name: "Agent",
				instructions: "Base",
				model: () => model,
				tools: {},
			}),
			memory: () => memory,
		})
		await controller.init()
		const session = await controller.createSession({
			resourceId: "r-om-persist",
		})
		const thread = await session.thread.create({ title: "om thread" })

		// Send enough tokens to exceed 100 tokens (syncBlockTrigger)
		await session.sendMessage({
			content:
				"Here is a detailed instruction with many words to easily exceed fifty tokens for testing observational memory buffering and persistence.",
		})

		const record = await memory.getObservationalRecord(
			thread.id,
			"r-om-persist",
		)
		expect(record).not.toBeNull()
		expect(record?.activeObservations).toContain(
			"Durable fact recorded in production",
		)
		expect(record?.generationCount).toBeGreaterThanOrEqual(1)

		await storage.close()
	})
})
