import type { ProviderConfig } from "./types.js"

export class ModelsDevGateway {
	id = "models.dev"

	constructor(_options?: Record<string, unknown>) {}

	async fetchProviders(): Promise<Record<string, ProviderConfig>> {
		try {
			const res = await fetch("https://models.dev/api.json")
			if (!res.ok) {
				throw new Error(`Failed to fetch from models.dev: ${res.statusText}`)
			}
			const data = (await res.json()) as Record<string, any>
			const providers: Record<string, ProviderConfig> = {}
			for (const [providerId, info] of Object.entries(data)) {
				const models = Array.isArray(info?.models)
					? (info.models as any[]).map((m) =>
							typeof m === "string" ? m : m.id || m.name,
						)
					: []
				providers[providerId] = {
					id: providerId,
					name: info?.name ?? providerId,
					url: info?.url,
					models,
				}
			}
			return providers
		} catch (error) {
			console.warn("[ModelsDevGateway] fetchProviders failed:", error)
			return {}
		}
	}
}

export class NetlifyGateway {
	id = "netlify"

	async fetchProviders(): Promise<Record<string, ProviderConfig>> {
		try {
			const res = await fetch(
				"https://api.netlify.com/api/v1/ai-gateway/providers",
			)
			if (!res.ok) {
				throw new Error(`Failed to fetch from Netlify: ${res.statusText}`)
			}
			const data = (await res.json()) as any
			const providers: Record<string, ProviderConfig> = {}
			const list = Array.isArray(data) ? data : (data?.providers ?? [])
			for (const item of list) {
				const pId = item.id || item.name || "netlify-provider"
				const models = Array.isArray(item.models)
					? item.models.map((m: any) =>
							typeof m === "string" ? m : m.id || m.name,
						)
					: []
				providers[pId] = {
					id: pId,
					name: item.name ?? pId,
					models,
				}
			}
			return providers
		} catch (error) {
			console.warn("[NetlifyGateway] fetchProviders failed:", error)
			return {}
		}
	}
}
