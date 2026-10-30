import { describe, expect, it } from "vitest"
import { AgentController } from "../controller.js"
import { SQLiteStore } from "../../../store/index.js"

async function makeSession() {
	const controller = new AgentController({
		agent: {
			getInstructions: async () => "test agent",
			getModel: async () => ({ modelId: "mock-model" }),
			listTools: async () => ({}),
		} as any,
		storage: new SQLiteStore() as any,
	})
	await controller.init()
	const session = await controller.createSession({ resourceId: "runtime-test" })
	return { controller, session }
}

describe("Session runtime snapshot (record → replay)", () => {
	it("captures the model, mode and effective permission gate", async () => {
		const { session } = await makeSession()

		await session.model.switch("deepseek/deepseek-flash")
		await session.mode.switch({ modeId: "plan" })
		await session.state.set({
			permissionMode: "read-only",
			thinkingLevel: "high",
		})
		session.permissions.setForCategory({ category: "edit", policy: "deny" })
		session.grantTool("execute_command")

		const snapshot = session.snapshotRuntime()

		expect(snapshot.modelId).toBe("deepseek/deepseek-flash")
		expect(snapshot.modeId).toBe("plan")
		expect(snapshot.permissionMode).toBe("read-only")
		expect(snapshot.thinkingLevel).toBe("high")
		expect(snapshot.permissionRules?.categories?.edit).toBe("deny")
		expect(snapshot.grants?.tools).toEqual(["execute_command"])
	})

	it("derives the permission mode from yolo when the picker never wrote one", async () => {
		const { session } = await makeSession()

		await session.state.set({ yolo: true })
		expect(session.snapshotRuntime().permissionMode).toBe("auto-approve")

		await session.state.set({ yolo: false })
		expect(session.snapshotRuntime().permissionMode).toBe("default")
	})

	it("applies a recorded runtime and reports it to the UI", async () => {
		const { session } = await makeSession()
		const events: any[] = []
		session.subscribe((e: any) => events.push(e))

		session.applyRuntime(
			{
				modelId: "deepseek/deepseek-v4-pro",
				modeId: "plan",
				permissionMode: "read-only",
				permissionRules: {
					categories: { read: "allow", edit: "deny", execute: "deny" },
					tools: { execute_command: "deny" },
				},
			},
			{ clearPolicies: true, applyGrants: true },
		)

		expect(session.model.get()).toBe("deepseek/deepseek-v4-pro")
		expect(session.mode.get()).toBe("plan")
		expect(session.state.get().permissionMode).toBe("read-only")
		expect(session.state.get().yolo).toBe(false)
		expect(session.permissions.getRules().categories.edit).toBe("deny")
		expect(session.permissions.getRules().tools.execute_command).toBe("deny")
		expect(events.some((e) => e.type === "model_changed")).toBe(true)
		expect(events.some((e) => e.type === "mode_changed")).toBe(true)

		const permissionEvent = events.find(
			(e) => e.type === "permission_mode_changed",
		)
		expect(permissionEvent?.permissionMode).toBe("read-only")
	})

	it("swaps the session's grants for the recorded ones so stale answers do not leak in", async () => {
		const { session } = await makeSession()
		session.grantCategory("edit")
		session.grantTool("execute_command")

		// Recorded run had no grants at all — the replay must not inherit the two
		// above, which would auto-approve tools that should still be asked about.
		session.applyRuntime(
			{ modeId: "react", permissionMode: "default", grants: {} },
			{ applyGrants: true },
		)

		expect(session.getGrants().categories).toEqual([])
		expect(session.getGrants().tools).toEqual([])
	})

	it("gives the user's own runtime back once the replay ends", async () => {
		const { session } = await makeSession()
		await session.mode.switch({ modeId: "react" })
		await session.model.switch("deepseek/deepseek-flash")
		await session.state.set({ permissionMode: "default" })
		session.grantCategory("edit")
		const before = session.snapshotRuntime()

		// A replay takes over with the recorded settings…
		session.applyRuntime(
			{
				modelId: "google/gemini-2.5-pro",
				modeId: "plan",
				permissionMode: "auto-approve",
				permissionRules: { categories: { execute: "allow" } },
				grants: {},
			},
			{ clearPolicies: true, applyGrants: true },
		)
		expect(session.mode.get()).toBe("plan")
		expect(session.state.get().yolo).toBe(true)
		expect(session.getGrants().categories).toEqual([])

		// …and the controller restores the snapshot when the run finishes.
		session.applyRuntime(before, {
			clearPolicies: true,
			applyGrants: true,
		})

		expect(session.model.get()).toBe("deepseek/deepseek-flash")
		expect(session.mode.get()).toBe("react")
		expect(session.state.get().permissionMode).toBe("default")
		expect(session.state.get().yolo).toBe(false)
		expect(session.permissions.getRules().categories.execute).toBeUndefined()
		expect(session.getGrants().categories).toEqual(["edit"])
	})
})
