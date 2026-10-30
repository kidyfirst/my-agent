import type { IpcCommandHandler } from "./types.js"

/** Public source repository — the sidebar banner's star button points here. */
const REPO_SLUG = "kidyfirst/my-agent"

/**
 * The star count only moves a few times a day; asking GitHub once per window
 * keeps the banner live without spending the unauthenticated rate limit
 * (60 requests/hour, shared by every request coming from this machine).
 */
const STARS_TTL_MS = 10 * 60 * 1000

let cachedStars: { count: number; at: number } | null = null

/**
 * Star count of the project's repository.
 *
 * The renderer cannot call api.github.com itself (the window has no CORS/network
 * allowance for it), so the request lives here. Every failure path returns the
 * last known value — a network hiccup must never turn the banner into an error.
 */
export function getRepoHandlers(): Record<string, IpcCommandHandler> {
	return {
		getRepoStars: async () => {
			if (cachedStars && Date.now() - cachedStars.at < STARS_TTL_MS) {
				return { stars: cachedStars.count, cached: true }
			}
			try {
				const res = await fetch(`https://api.github.com/repos/${REPO_SLUG}`, {
					headers: {
						accept: "application/vnd.github+json",
						"user-agent": "my-agent",
					},
				})
				if (!res.ok) return { stars: cachedStars?.count ?? null }
				const data = (await res.json()) as { stargazers_count?: number }
				const stars =
					typeof data.stargazers_count === "number"
						? data.stargazers_count
						: null
				if (stars !== null) cachedStars = { count: stars, at: Date.now() }
				return { stars }
			} catch {
				return { stars: cachedStars?.count ?? null }
			}
		},
	}
}
