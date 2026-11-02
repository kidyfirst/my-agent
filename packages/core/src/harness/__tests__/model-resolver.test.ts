import { describe, expect, it } from "vitest"
import { RequestContext } from "../../core/index.js"
import { createDynamicModelGetter } from "../model-resolver.js"

function makeContext(controller: any, session: any) {
	const ctx = new RequestContext()
	ctx.set("controller", controller)
	ctx.set("harness", controller)
	ctx.set("session", session)
	return ctx
}

describe("createDynamicModelGetter", () => {
	it("uses the session model, not the stored mode default", () => {
		const getter = createDynamicModelGetter(((modelId: string) => ({
			id: modelId,
		})) as any)

		const session = {
			model: { get: () => "deepseek/deepseek-flash" },
			state: { get: () => ({ currentModelId: "deepseek/deepseek-flash" }) },
		}
		// The controller carries no `session` property — that was the bug.
		const model = getter({ requestContext: makeContext({}, session) } as any)

		expect(model.id).toBe("deepseek/deepseek-flash")
	})

	it("falls back when the session has no model yet", () => {
		const getter = createDynamicModelGetter(((modelId: string) => ({
			id: modelId,
		})) as any)

		const session = { model: { get: () => "" }, state: { get: () => ({}) } }
		const model = getter({ requestContext: makeContext({}, session) } as any)

		// Whatever the stored default is, it must resolve to something.
		expect(typeof model.id).toBe("string")
		expect(model.id.length).toBeGreaterThan(0)
	})

	it("rescues an unauthenticated Anthropic default", () => {
		const authStorage = {
			reload: () => {},
			isLoggedIn: (id: string) => id === "deepseek",
			getApiKeySync: () => undefined,
			getDefaultModelForProvider: (id: string) =>
				id === "deepseek" ? "deepseek/deepseek-flash" : undefined,
		}
		const getter = createDynamicModelGetter(
			((modelId: string) => ({ id: modelId })) as any,
			authStorage as any,
		)

		const session = {
			model: { get: () => "anthropic/claude-opus-4-6" },
			state: { get: () => ({}) },
		}
		const model = getter({ requestContext: makeContext({}, session) } as any)

		expect(model.id).toBe("deepseek/deepseek-flash")
	})
})
