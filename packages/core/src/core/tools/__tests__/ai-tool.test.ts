import { describe, expect, it } from "vitest"
import { z } from "zod/v3"
import { createTool } from "../tool.js"
import { toFlexibleSchema, toModelTool } from "../ai-tool.js"

describe("toModelTool", () => {
	it("moves a zod inputSchema onto the v6 `inputSchema` field", () => {
		const tool = createTool({
			id: "sandbox",
			description: "ask for sandbox access",
			inputSchema: z.object({ path: z.string() }),
			execute: async () => "ok",
		})

		const def = toModelTool(tool, async () => "ok")
		expect(def).not.toHaveProperty("parameters")
		expect(def.inputSchema).toBe(tool.inputSchema)
		expect(def.description).toBe("ask for sandbox access")
	})

	it("wraps a bare JSON Schema object so it keeps `type: object`", () => {
		const def = toModelTool(
			{
				description: "echo",
				parameters: {
					type: "object",
					properties: { value: { type: "string" } },
				},
			},
			async () => "ok",
		)
		expect(def.inputSchema.jsonSchema).toMatchObject({
			type: "object",
			properties: { value: { type: "string" } },
		})
	})

	it("adds `type: object` to a bare JSON Schema that omits it", () => {
		const schema = toFlexibleSchema({ properties: { a: { type: "string" } } })
		expect(schema.jsonSchema.type).toBe("object")
	})

	it("falls back to an object schema when the tool declares none", () => {
		const def = toModelTool({ description: "no args" }, async () => "ok")
		expect(def.inputSchema.jsonSchema).toMatchObject({ type: "object" })
	})

	it("leaves provider-defined tools untouched", () => {
		const providerTool = {
			type: "provider-defined",
			id: "anthropic.web_search",
			args: {},
		}
		expect(toModelTool(providerTool, async () => "ok")).toBe(providerTool)
	})
})
