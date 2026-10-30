/**
 * Compact "how long ago" label used by the sidebar project list.
 *
 * Mirrors the terse style of the reference design: `now`, `5m`, `3h`, `2d`,
 * `4w`, `6mo`, `2y` — always short enough to sit at the right edge of a row.
 */
export function formatRelativeTime(
	input?: string | number | Date | null,
	now: number = Date.now(),
): string {
	if (input === undefined || input === null || input === "") return ""
	const then =
		input instanceof Date
			? input.getTime()
			: typeof input === "number"
				? input
				: new Date(input).getTime()
	if (!Number.isFinite(then)) return ""

	const diff = Math.max(0, now - then)
	const sec = Math.floor(diff / 1000)
	if (sec < 60) return "now"

	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m`

	const hour = Math.floor(min / 60)
	if (hour < 24) return `${hour}h`

	const day = Math.floor(hour / 24)
	if (day < 7) return `${day}d`

	const week = Math.floor(day / 7)
	if (day < 30) return `${week}w`

	const month = Math.floor(day / 30)
	if (day < 365) return `${Math.max(1, month)}mo`

	return `${Math.max(1, Math.floor(day / 365))}y`
}
