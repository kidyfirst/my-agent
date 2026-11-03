import { describe, it, expect } from "vitest"
import { MyAgentMemory } from "../base.js"

describe("MyAgentMemory processors and lifecycle methods", () => {
	it("initializes with default settings and exposes required methods", () => {
		const mem = new MyAgentMemory({
			id: "test-mem",
			name: "TestMemory",
		})

		expect(mem.id).toBe("test-mem")
		expect(mem.name).toBe("TestMemory")
		expect(typeof mem.getInputProcessors).toBe("function")
		expect(typeof mem.getOutputProcessors).toBe("function")
		expect(typeof mem.getErrorProcessors).toBe("function")
		expect(typeof mem.listTools).toBe("function")
		expect(typeof mem.getMergedThreadConfig).toBe("function")
		expect(typeof mem.getConfig).toBe("function")
		expect(typeof mem.supportsAtomicWorkingMemoryMerge).toBe("function")
	})

	it("returns arrays without throwing when no storage is attached", async () => {
		const mem = new MyAgentMemory()

		const inputProcessors = await mem.getInputProcessors()
		const outputProcessors = await mem.getOutputProcessors()
		const errorProcessors = await mem.getErrorProcessors()

		expect(Array.isArray(inputProcessors)).toBe(true)
		expect(Array.isArray(outputProcessors)).toBe(true)
		expect(Array.isArray(errorProcessors)).toBe(true)
	})

	it("merges thread configuration properly", () => {
		const mem = new MyAgentMemory({
			options: {
				lastMessages: 25,
			},
		})

		const merged = mem.getMergedThreadConfig({
			generateTitle: true,
		})

		expect(merged.lastMessages).toBe(25)
		expect(merged.generateTitle).toBe(true)
	})

	it("resolves input processors when observationalMemory and storage are provided", async () => {
		const mockStorage = {
			init: async () => {},
			getStore: async () => ({
				getThreadById: async () => null,
				listMessages: async () => ({ messages: [] }),
			}),
		}

		const mem = new MyAgentMemory({
			storage: mockStorage,
			options: {
				observationalMemory: {
					enabled: true,
				},
			},
		})

		const processors = await mem.getInputProcessors([], null)
		expect(Array.isArray(processors)).toBe(true)
		// Should include message-history processor
		expect(processors.length).toBeGreaterThanOrEqual(1)
		expect(
			processors.some(
				(p: any) => p.name === "MessageHistory" || p.id === "message-history",
			),
		).toBe(true)

		const outProcessors = await mem.getOutputProcessors([], null)
		expect(Array.isArray(outProcessors)).toBe(true)
		expect(outProcessors.length).toBeGreaterThanOrEqual(1)
		expect(
			outProcessors.some(
				(p: any) => p.name === "MessageHistory" || p.id === "message-history",
			),
		).toBe(true)
	})

	it("supports storage getter and setter", () => {
		const mem = new MyAgentMemory()
		expect(mem.hasOwnStorage).toBe(false)

		const dummy = { dummy: true }
		mem.setStorage(dummy)
		expect(mem.hasOwnStorage).toBe(true)
		expect(mem.storage).toBe(dummy)
	})
})
