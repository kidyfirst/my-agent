/**
 * One popover at a time.
 *
 * Every menu owns its own React state, so nothing structurally keeps two of
 * them from being open together. The usual "click outside closes me" handler
 * lives on `window`, and the sidebar triggers call `stopPropagation` on
 * mousedown to keep the row click intact — which also swallows the event the
 * other menu is waiting for. Opening row B's menu while row A's is open used to
 * leave both on screen.
 *
 * Each menu therefore claims a slot while it is open. Claiming closes whatever
 * was open before it, so the newest menu always wins and a stack can never form.
 */
const openMenus = new Map<string, () => void>()

/**
 * Register `close` as the open menu under `id`, closing any other open menu
 * first. Pair with {@link releaseMenu} once the menu unmounts.
 */
export function claimMenu(id: string, close: () => void): void {
	// Snapshot before closing: a close handler unmounts the menu, whose cleanup
	// releases its own id and mutates the map mid-iteration. The entry is
	// dropped here rather than waiting for that cleanup, so an owner that
	// ignores `close` cannot leave a phantom slot behind.
	for (const [otherId, otherClose] of [...openMenus]) {
		if (otherId === id) continue
		openMenus.delete(otherId)
		otherClose()
	}
	openMenus.set(id, close)
}

/** Forget a menu that closed. No-op if a newer menu already replaced it. */
export function releaseMenu(id: string): void {
	openMenus.delete(id)
}

/** Ids of the menus currently open — used by tests. */
export function openMenuIds(): string[] {
	return [...openMenus.keys()]
}
