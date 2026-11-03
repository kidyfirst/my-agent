const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * Returns the origin to echo back when it is a loopback origin, otherwise
 * undefined so that no CORS headers are emitted. Requests without an Origin
 * (curl, CLI, the agent's own shell) are unaffected since CORS is a
 * browser-enforced mechanism.
 */
export function getLoopbackOrigin(
	origin: string | undefined,
): string | undefined {
	if (!origin) return undefined

	let hostname: string
	try {
		hostname = new URL(origin).hostname
	} catch {
		return undefined
	}

	return LOOPBACK_HOSTS.has(hostname) ? origin : undefined
}
