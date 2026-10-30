import type { AgentGraphDefinition, GraphTopologyMetadata } from "./types.js"

/**
 * Registry holding all available Agent Execution Graph definitions.
 * Provides lookup, topology extraction, and fallback resolution.
 */
export class GraphRegistry {
	private definitions = new Map<string, AgentGraphDefinition>()
	private aliases = new Map<string, string>()
	private defaultModeId = "build"

	/**
	 * Register an execution mode graph definition.
	 */
	register(definition: AgentGraphDefinition): void {
		this.definitions.set(definition.id, definition)
	}

	/**
	 * Register an alias pointing to an existing registered mode ID.
	 */
	registerAlias(alias: string, targetModeId: string): void {
		this.aliases.set(alias, targetModeId)
	}

	/**
	 * Retrieve a graph definition by mode ID or alias.
	 */
	get(modeId: string): AgentGraphDefinition | undefined {
		const targetId = this.aliases.get(modeId) || modeId
		return this.definitions.get(targetId)
	}

	/**
	 * Check if a mode ID or alias is registered.
	 */
	has(modeId: string): boolean {
		const targetId = this.aliases.get(modeId) || modeId
		return this.definitions.has(targetId)
	}

	/**
	 * Resolve a graph definition, falling back to defaultModeId if not found.
	 */
	resolve(modeId?: string): AgentGraphDefinition {
		if (modeId) {
			const targetId = this.aliases.get(modeId) || modeId
			if (this.definitions.has(targetId)) {
				return this.definitions.get(targetId)!
			}
		}
		const fallbackId =
			this.aliases.get(this.defaultModeId) || this.defaultModeId
		const fallback = this.definitions.get(fallbackId)
		if (fallback) {
			return fallback
		}
		const first = Array.from(this.definitions.values())[0]
		if (first) {
			return first
		}
		throw new Error(
			`No execution graph definitions registered in GraphRegistry (requested mode: '${modeId}').`,
		)
	}

	/**
	 * List all canonical registered graph definitions.
	 */
	list(): AgentGraphDefinition[] {
		return Array.from(this.definitions.values())
	}

	/**
	 * List all unique graph topology metadata (for UI mode selector and graph viewer).
	 * Deduplicates by modeName and modeId.
	 */
	listTopologies(): GraphTopologyMetadata[] {
		const seen = new Set<string>()
		const result: GraphTopologyMetadata[] = []
		for (const def of this.definitions.values()) {
			if (!seen.has(def.topology.modeName) && !seen.has(def.id)) {
				seen.add(def.topology.modeName)
				seen.add(def.id)
				result.push(def.topology)
			}
		}
		return result
	}

	/**
	 * Get the topology metadata for a specific mode.
	 */
	getTopology(modeId: string): GraphTopologyMetadata | undefined {
		return this.definitions.get(modeId)?.topology
	}

	/**
	 * Configure the fallback default mode ID.
	 */
	setDefaultMode(modeId: string): void {
		this.defaultModeId = modeId
	}

	/**
	 * Get the configured default mode ID.
	 */
	getDefaultMode(): string {
		return this.defaultModeId
	}

	/**
	 * Clear all registrations (mainly for testing).
	 */
	clear(): void {
		this.definitions.clear()
	}
}

/**
 * Global singleton graph registry instance.
 */
export const defaultGraphRegistry = new GraphRegistry()
