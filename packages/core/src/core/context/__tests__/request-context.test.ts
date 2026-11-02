import { describe, it, expect } from "vitest"
import { RequestContext } from "../index.js"

describe("src/core/context - RequestContext", () => {
	it("initializes with empty entries or iterable", () => {
		const ctx1 = new RequestContext()
		expect(ctx1.size()).toBe(0)

		const ctx2 = new RequestContext({ userId: "user-1", flag: true })
		expect(ctx2.size()).toBe(2)
		expect(ctx2.get("userId")).toBe("user-1")
		expect(ctx2.get("flag")).toBe(true)
	})

	it("supports get, set, has, and delete operations", () => {
		const ctx = new RequestContext()
		ctx.set("key1", "val1")
		expect(ctx.has("key1")).toBe(true)
		expect(ctx.get("key1")).toBe("val1")

		ctx.setRaw("rawKey", 42)
		expect(ctx.hasRaw("rawKey")).toBe(true)
		expect(ctx.getRaw("rawKey")).toBe(42)

		ctx.delete("key1")
		expect(ctx.has("key1")).toBe(false)
		expect(ctx.get("key1")).toBeUndefined()

		ctx.deleteRaw("rawKey")
		expect(ctx.hasRaw("rawKey")).toBe(false)
	})

	it("provides all getter returning a plain object", () => {
		const ctx = new RequestContext()
		ctx.set("a", 1)
		ctx.set("b", "two")
		expect(ctx.all).toEqual({ a: 1, b: "two" })
	})

	it("serializes safely to JSON ignoring functions and non-serializables", () => {
		const ctx = new RequestContext()
		ctx.set("name", "test")
		ctx.set("fn", () => {})
		ctx.set("sym", Symbol("s"))

		const json = ctx.toJSON()
		expect(json).toEqual({ name: "test" })
	})
})
