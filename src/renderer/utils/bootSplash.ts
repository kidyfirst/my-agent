/**
 * The boot splash is markup in `index.html`, not a React component: it has to
 * cover the window while the bundle is still being parsed, before any effect
 * could run. React only gets to retire it, once the sidebar actually has its
 * rows to show.
 */

export const BOOT_SPLASH_ID = "boot-splash"

/** Must match the `transition` on `#boot-splash` in index.html. */
export const BOOT_SPLASH_FADE_MS = 420

/**
 * A boot that finishes in a couple of frames would otherwise look like a
 * glitch: the logo flashes in and out before the eye registers it. Hold the
 * splash for a beat so the fade always reads as a deliberate hand-off.
 */
export const BOOT_SPLASH_MIN_VISIBLE_MS = 480

/** How long to keep the splash up, given how long the page has been alive. */
export function bootSplashReleaseDelay(elapsedMs: number): number {
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0
	const remaining = BOOT_SPLASH_MIN_VISIBLE_MS - elapsedMs
	return remaining > 0 ? Math.min(remaining, BOOT_SPLASH_MIN_VISIBLE_MS) : 0
}

/**
 * Fade the splash out and drop it from the DOM. Safe to call more than once
 * (StrictMode runs effects twice) and safe to call where there is no DOM at
 * all, which is what the server-rendered tests do.
 */
export function hideBootSplash(): void {
	if (typeof document === "undefined") return
	const splash = document.getElementById(BOOT_SPLASH_ID)
	if (!splash) return
	if (splash.dataset?.hiding === "true") return
	if (splash.dataset) splash.dataset.hiding = "true"
	splash.classList.add("boot-splash--hidden")
	// It stays mounted for the fade; screen readers should not announce it.
	splash.setAttribute("aria-hidden", "true")
	setTimeout(() => splash.remove(), BOOT_SPLASH_FADE_MS + 80)
}
