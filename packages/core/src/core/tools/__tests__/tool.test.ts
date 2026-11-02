import { describe, it, expect } from "vitest"
import { z } from "zod"
import { createTool, Tool } from "../index.js"
import { RequestContext } from "../../context/index.js"

describe("src/core/tools - Tool & createTool", () => {
	it("creates a tool with id, description, and schemas", () => {
		const tool = createTool({
			id: "echo-tool",
			description: "Echoes input text",
			inputSchema: z.object({ text: z.string() }),
			execute: async (input) => {
				return { echoed: input.text }
			},
		})

		expect(tool).toBeInstanceOf(Tool)
		expect(tool.id).toBe("echo-tool")
		expect(tool.description).toBe("Echoes input text")
		expect(tool.inputSchema).toBeDefined()
	})

	it("executes successfully with validated input", async () => {
		const tool = createTool({
			id: "add-tool",
			description: "Adds two numbers",
			inputSchema: z.object({ a: z.number(), b: z.number() }),
			execute: async (context) => {
				return { sum: context.a + context.b }
			},
		})

		const result = await tool.execute({ a: 10, b: 25 })
		expect(result).toEqual({ sum: 35 })
	})

	it("supports execution context passing requestContext", async () => {
		const reqCtx = new RequestContext()
		reqCtx.set("user", "alice")

		const tool = createTool({
			id: "greet-tool",
			description: "Greets user from context",
			inputSchema: z.object({ greeting: z.string() }),
			execute: async (context, toolContext) => {
				const user = toolContext?.requestContext?.get("user") || "anonymous"
				return { message: `${context.greeting}, ${user}!` }
			},
		})

		const result = await tool.execute(
			{ greeting: "Hello" },
			{ requestContext: reqCtx },
		)
		expect(result).toEqual({ message: "Hello, alice!" })
	})

	it("throws or returns error for invalid input schema", async () => {
		const tool = createTool({
			id: "strict-tool",
			description: "Requires string",
			inputSchema: z.object({ text: z.string() }),
			execute: async (context) => context.text,
		})

		// Passing invalid input (number instead of string)
		await expect(tool.execute({ text: 123 as any })).rejects.toThrow()
	})
})
