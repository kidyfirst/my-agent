import { defaultGraphRegistry } from "./registry.js"
import { reactGraphDefinition, reactTopology } from "./graphs/react-graph.js"
import { chatGraphDefinition, chatTopology } from "./graphs/chat-graph.js"
import {
	planSolveGraphDefinition,
	planSolveTopology,
} from "./graphs/plan-solve-graph.js"

import { ExecutionMode } from "./types.js"

export * from "./types.js"
export * from "./registry.js"
export * from "./runner.js"
export * from "./llm-stream.js"
export { reactGraphDefinition, reactTopology }
export { chatGraphDefinition, chatTopology }
export { planSolveGraphDefinition, planSolveTopology }

/**
 * Register built-in graphs and aliases into the global registry.
 */
export function registerBuiltinGraphs() {
	// ReAct mode (canonical ID: ExecutionMode.REACT = "react", legacy alias: "build")
	defaultGraphRegistry.register(reactGraphDefinition)
	defaultGraphRegistry.registerAlias("build", ExecutionMode.REACT)

	// Fast chat mode (canonical ID: ExecutionMode.FAST = "fast", alias: "chat")
	defaultGraphRegistry.register(chatGraphDefinition)
	defaultGraphRegistry.registerAlias("chat", ExecutionMode.FAST)

	// Plan & Solve mode (canonical ID: ExecutionMode.PLAN = "plan")
	defaultGraphRegistry.register(planSolveGraphDefinition)

	// Set default mode
	defaultGraphRegistry.setDefaultMode(ExecutionMode.REACT)
}

// Auto-register builtins
registerBuiltinGraphs()
