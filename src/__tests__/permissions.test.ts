import { describe, expect, it, beforeEach } from "vitest"
import {
	DEFAULT_POLICIES,
	getRuntimeCategoryPolicies,
	getRuntimeYolo,
	setRuntimeCategoryPolicy,
	setRuntimeYolo,
} from "../permissions.js"

describe("runtime permission state", () => {
	beforeEach(() => {
		setRuntimeYolo(false)
	})

	it("defaults to yolo off with ask policies for risky categories", () => {
		expect(getRuntimeYolo()).toBe(false)
		const policies = getRuntimeCategoryPolicies()
		expect(policies.read).toBe("allow")
		expect(policies.edit).toBe("ask")
		expect(policies.execute).toBe("ask")
		expect(policies.mcp).toBe("ask")
	})

	it("turning yolo on allows every category", () => {
		setRuntimeYolo(true)
		expect(getRuntimeYolo()).toBe(true)
		expect(getRuntimeCategoryPolicies()).toEqual({
			read: "allow",
			edit: "allow",
			execute: "allow",
			mcp: "allow",
		})
	})

	it("turning yolo back off restores the default policies", () => {
		setRuntimeYolo(true)
		setRuntimeYolo(false)
		expect(getRuntimeCategoryPolicies()).toEqual(DEFAULT_POLICIES)
	})

	it("stores a per-category override without touching other categories", () => {
		setRuntimeCategoryPolicy("execute", "deny")
		const policies = getRuntimeCategoryPolicies()
		expect(policies.execute).toBe("deny")
		expect(policies.edit).toBe("ask")
	})

	it("returns a copy so callers cannot mutate the runtime state", () => {
		const policies = getRuntimeCategoryPolicies()
		policies.execute = "allow"
		expect(getRuntimeCategoryPolicies().execute).toBe("ask")
	})
})
