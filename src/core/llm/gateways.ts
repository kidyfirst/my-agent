import type { ProviderConfig } from "./types.js"

export class ModelsDevGateway {
	id = "models.dev"

	constructor(_options?: Record<string, unknown>) {}

	async fetchProviders(): Promise<Record<string, ProviderConfig>> {
		try {
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), 10000)

			let res: Response
			try {
				res = await fetch("https://models.dev/api.json", {
					headers: { Accept: "application/json" },
					signal: controller.signal,
				})
			} finally {
				clearTimeout(timer)
			}

			if (!res.ok) {
				return {}
			}

			const data = (await res.json()) as unknown
			if (!data || typeof data !== "object" || Array.isArray(data)) {
				return {}
			}

			const providers: Record<string, ProviderConfig> = {}
			for (const [providerId, info] of Object.entries(
				data as Record<string, any>,
			)) {
				if (!info || typeof info !== "object") continue
				const models = Array.isArray(info?.models)
					? (info.models as any[])
							.map((m) => (typeof m === "string" ? m : m?.id || m?.name))
							.filter(Boolean)
					: []
				providers[providerId] = {
					id: providerId,
					name: info?.name ?? providerId,
					url: info?.url,
					models,
				}
			}
			return providers
		} catch {
			return {}
		}
	}
}

export class NetlifyGateway {
	id = "netlify"

	async fetchProviders(): Promise<Record<string, ProviderConfig>> {
		try {
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), 10000)

			let res: Response
			try {
				res = await fetch(
					"https://api.netlify.com/api/v1/ai-gateway/providers",
					{
						headers: {
							Accept: "application/json",
							"User-Agent": "MyAgent/1.0",
						},
						signal: controller.signal,
					},
				)
			} finally {
				clearTimeout(timer)
			}

			if (!res.ok) {
				// Netlify API may be restricted, unauthenticated, or policy-blocked.
				return {}
			}

			const data = (await res.json()) as unknown
			if (!data || typeof data !== "object") {
				return {}
			}

			const providers: Record<string, ProviderConfig> = {}

			// Safely extract provider items whether data is:
			// 1) An array of providers: [{ id, name, models }]
			// 2) An object with a providers array: { providers: [{ id, ... }] }
			// 3) An object with a providers map: { providers: { openai: { ... } } }
			// 4) A direct dictionary of providers: { openai: { ... } }
			let items: any[] = []
			if (Array.isArray(data)) {
				items = data
			} else if (Array.isArray((data as any).providers)) {
				items = (data as any).providers
			} else if (
				(data as any).providers &&
				typeof (data as any).providers === "object"
			) {
				items = Object.entries((data as any).providers).map(([key, val]) =>
					val && typeof val === "object" ? { id: key, ...val } : { id: key },
				)
			} else if (!(data as any).error && !(data as any).message) {
				const entries = Object.entries(data as Record<string, unknown>)
				if (
					entries.length > 0 &&
					entries.every(
						([, val]) => val && typeof val === "object" && !Array.isArray(val),
					)
				) {
					items = entries.map(([key, val]) => ({
						id: key,
						...(val as Record<string, unknown>),
					}))
				}
			}

			for (const item of items) {
				if (!item || typeof item !== "object") continue
				const pId = item.id || item.name || "netlify-provider"
				const models = Array.isArray(item.models)
					? item.models
							.map((m: any) => (typeof m === "string" ? m : m?.id || m?.name))
							.filter(Boolean)
					: []
				providers[pId] = {
					id: pId,
					name: item.name ?? pId,
					models,
				}
			}
			return providers
		} catch {
			return {}
		}
	}
}
