import { z } from "zod"
import { DEFAULT_FALLBACK_MODEL_ID } from "../constants/models.js"

export const DEFAULT_OM_MODEL_ID =
	process.env.DEFAULT_OM_MODEL_ID ?? DEFAULT_FALLBACK_MODEL_ID
export const DEFAULT_OBS_THRESHOLD = 30_000
export const DEFAULT_REF_THRESHOLD = 40_000

export const stateSchema = z.object({
	projectPath: z.string().optional(),
	projectName: z.string().optional(),
	gitBranch: z.string().optional(),
	lastCommand: z.string().optional(),
	currentModelId: z.string().default(""),
	subagentModelId: z.string().optional(),
	observerModelId: z.string().default(DEFAULT_OM_MODEL_ID),
	reflectorModelId: z.string().default(DEFAULT_OM_MODEL_ID),
	observationThreshold: z.number().default(DEFAULT_OBS_THRESHOLD),
	reflectionThreshold: z.number().default(DEFAULT_REF_THRESHOLD),
	thinkingLevel: z
		.enum(["off", "low", "medium", "high", "xhigh"])
		.default("off"),
	yolo: z.boolean().default(false),
	permissionRules: z
		.object({
			categories: z
				.record(z.string(), z.enum(["allow", "ask", "deny"]))
				.default({}),
			tools: z.record(z.string(), z.enum(["allow", "ask", "deny"])).default({}),
		})
		.default({ categories: {}, tools: {} }),
	smartEditing: z.boolean().default(true),
	notifications: z.enum(["bell", "system", "both", "off"]).default("off"),
	tasks: z
		.array(
			z.object({
				content: z.string(),
				status: z.enum(["pending", "in_progress", "completed"]),
				activeForm: z.string(),
			}),
		)
		.default([]),
	sandboxAllowedPaths: z.array(z.string()).default([]),
	activePlan: z
		.object({
			title: z.string(),
			plan: z.string(),
			approvedAt: z.string(),
		})
		.nullable()
		.default(null),
})

export type HarnessState = z.infer<typeof stateSchema>
