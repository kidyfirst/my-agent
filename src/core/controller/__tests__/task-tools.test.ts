import { describe, it, expect } from "vitest"
import { taskWriteTool, taskCheckTool } from "../tasks.js"

describe("Task Tools (taskWriteTool, taskCheckTool)", () => {
	it("taskWriteTool validates schema and returns formatted task list", async () => {
		expect(taskWriteTool.id).toBe("task_write")

		const res = await taskWriteTool.execute(
			{
				tasks: [
					{
						id: "task-1",
						content: "Refactor core",
						status: "in_progress",
						activeForm: "Refactoring core",
					},
					{
						id: "task-2",
						content: "Add tests",
						status: "pending",
						activeForm: "Adding tests",
					},
				],
			},
			{},
		)

		expect(res.isError).toBe(false)
		expect(res.tasks).toHaveLength(2)
		expect(res.content).toContain("Refactor core")
	})

	it("taskCheckTool summarizes tasks", async () => {
		expect(taskCheckTool.id).toBe("task_check")

		const res = await taskCheckTool.execute({}, {})
		expect(res.summary).toBeDefined()
		expect(typeof res.summary.allCompleted).toBe("boolean")
		expect(Array.isArray(res.tasks)).toBe(true)
	})
})
