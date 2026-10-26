import { z } from "zod/v3"
import { createTool } from "../tools/index.js"

export interface TaskItem {
	id: string
	content: string
	status: "pending" | "in_progress" | "completed"
	activeForm: string
}

const taskItemSchema = z.object({
	id: z.string().optional(),
	content: z.string().min(1).describe("Imperative task description"),
	status: z
		.enum(["pending", "in_progress", "completed"])
		.describe("Task status"),
	activeForm: z.string().min(1).describe("Present continuous form"),
})

export const taskWriteTool = createTool({
	id: "task_write",
	description: `Create and manage a structured task list for your current coding session.`,
	inputSchema: z.object({
		tasks: z.array(taskItemSchema).describe("The complete updated task list"),
	}),
	outputSchema: z.object({
		content: z.string(),
		tasks: z.array(taskItemSchema),
		isError: z.boolean(),
	}),
	execute: async ({ tasks }, _context) => {
		let idCounter = 1
		const normalizedTasks: TaskItem[] = tasks.map((t) => ({
			id: t.id || `task-${idCounter++}`,
			content: t.content,
			status: t.status,
			activeForm: t.activeForm,
		}))

		const formatted = normalizedTasks
			.map((t) => {
				const check =
					t.status === "completed"
						? "[x]"
						: t.status === "in_progress"
							? "[-]"
							: "[ ]"
				return `${check} #${t.id}: ${t.content}`
			})
			.join("\n")

		return {
			content: `Task list updated:\n${formatted}`,
			tasks: normalizedTasks,
			isError: false,
		}
	},
})

export const taskCheckTool = createTool({
	id: "task_check",
	description: `Check the completion status of your current task list.`,
	inputSchema: z.object({}),
	outputSchema: z.object({
		content: z.string(),
		tasks: z.array(taskItemSchema),
		isError: z.boolean(),
		summary: z.object({
			total: z.number(),
			completed: z.number(),
			inProgress: z.number(),
			pending: z.number(),
			incomplete: z.number(),
			hasTasks: z.boolean(),
			allCompleted: z.boolean(),
		}),
		incompleteTasks: z.array(taskItemSchema),
	}),
	execute: async (_input, _context) => {
		return {
			content: "No tasks tracked or all tasks completed.",
			tasks: [],
			isError: false,
			summary: {
				total: 0,
				completed: 0,
				inProgress: 0,
				pending: 0,
				incomplete: 0,
				hasTasks: false,
				allCompleted: false,
			},
			incompleteTasks: [],
		}
	},
})
