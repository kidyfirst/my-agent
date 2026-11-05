import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"

const DARK_THEME = {
	background: "#09090b",
	foreground: "#fafafa",
	cursor: "#fafafa",
	selectionBackground: "#7c3aed66",
	black: "#09090b",
	red: "#ef4444",
	green: "#22c55e",
	yellow: "#f59e0b",
	blue: "#3b82f6",
	magenta: "#a855f7",
	cyan: "#06b6d4",
	white: "#fafafa",
	brightBlack: "#71717a",
	brightRed: "#f87171",
	brightGreen: "#4ade80",
	brightYellow: "#fbbf24",
	brightBlue: "#60a5fa",
	brightMagenta: "#c084fc",
	brightCyan: "#22d3ee",
	brightWhite: "#ffffff",
}

const LIGHT_THEME = {
	background: "#ffffff",
	foreground: "#0f172a",
	cursor: "#0f172a",
	selectionBackground: "#6d28d933",
	black: "#0f172a",
	red: "#dc2626",
	green: "#16a34a",
	yellow: "#d97706",
	blue: "#2563eb",
	magenta: "#9333ea",
	cyan: "#0891b2",
	white: "#f8fafc",
	brightBlack: "#64748b",
	brightRed: "#ef4444",
	brightGreen: "#22c55e",
	brightYellow: "#f59e0b",
	brightBlue: "#3b82f6",
	brightMagenta: "#a855f7",
	brightCyan: "#06b6d4",
	brightWhite: "#ffffff",
}

function getTerminalTheme() {
	const isDark =
		typeof document !== "undefined" &&
		document.documentElement.getAttribute("data-theme") === "dark"
	return isDark ? DARK_THEME : LIGHT_THEME
}

interface TerminalPanelProps {
	projectPath?: string | null
	onOpenBrowser?: (url: string) => void
	/** Bumped when the shell sends the user here (overview menu → Terminal). */
	focusSignal?: number
}

/** One shell, one view: the panel's own tab in the sidebar *is* the tab. */
interface TerminalSession {
	term: Terminal
	fitAddon: FitAddon
	sessionId: string | null
	unsub: (() => void) | null
	started: boolean
	disposed: boolean
	retryTimer: ReturnType<typeof setTimeout> | null
}

/**
 * The right sidebar's terminal.
 *
 * It used to carry a tab bar of its own (TERMINAL | Terminal 1 | +), which
 * duplicated the sidebar tab strip above it and ate a row of the shell. The
 * shell now owns the whole pane; a worktree has a shell, not a set of them.
 */
export function TerminalPanel({
	projectPath,
	onOpenBrowser,
	focusSignal,
}: TerminalPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const sessionRef = useRef<TerminalSession | null>(null)
	const onOpenBrowserRef = useRef(onOpenBrowser)
	onOpenBrowserRef.current = onOpenBrowser
	// The shell must start in the active project, otherwise it inherits whatever
	// directory the session was created in (e.g. the previous repo, which then
	// keeps showing a git branch in the prompt for a plain-folder project).
	const projectPathRef = useRef(projectPath)
	projectPathRef.current = projectPath

	// Switching worktrees restarts the shell: `projectPath` is the effect's
	// only dependency, so a new path tears the old PTY down before spawning one
	// that starts in the new directory.
	useEffect(() => {
		const container = containerRef.current
		if (!container || !projectPath) return
		while (container.firstChild) container.removeChild(container.firstChild)

		const term = new Terminal({
			fontSize: 12,
			fontFamily: '"SF Mono", "Menlo", "Monaco", "Consolas", monospace',
			cursorBlink: true,
			theme: getTerminalTheme(),
		})
		const fitAddon = new FitAddon()
		term.loadAddon(fitAddon)
		term.loadAddon(
			new WebLinksAddon((_event, uri) => {
				if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(uri)) {
					onOpenBrowserRef.current?.(uri)
				} else {
					window.api.invoke({ type: "openExternal", url: uri })
				}
			}),
		)

		const session: TerminalSession = {
			term,
			fitAddon,
			sessionId: null,
			unsub: null,
			started: false,
			disposed: false,
			retryTimer: null,
		}
		sessionRef.current = session

		term.open(container)

		// xterm only knows its size once open, and the panel is resized by a
		// splitter and hidden/shown by the sidebar — so fit and tell the PTY
		// about it every time the box changes.
		const fit = () => {
			if (session.disposed) return
			if (container.clientWidth < 40 || container.clientHeight < 40) return
			try {
				fitAddon.fit()
			} catch {
				return
			}
			const dims = fitAddon.proposeDimensions()
			if (dims && session.sessionId) {
				window.api.invoke({
					type: "ptyResize",
					sessionId: session.sessionId,
					cols: dims.cols,
					rows: dims.rows,
				})
			}
		}
		fit()

		const startPty = (retries = 0) => {
			if (session.disposed || session.started) return
			session.started = true
			const dims = fitAddon.proposeDimensions()
			window.api
				.invoke({
					type: "ptyCreate",
					cols: dims?.cols ?? 80,
					rows: dims?.rows ?? 24,
					cwd: projectPathRef.current ?? undefined,
				})
				.then((result) => {
					if (session.disposed) {
						// The panel restarted while the PTY was spawning.
						const { sessionId } = result as { sessionId: string }
						window.api.invoke({ type: "ptyDestroy", sessionId })
						return
					}
					const { sessionId } = result as { sessionId: string }
					session.sessionId = sessionId
					session.unsub = window.api.onEvent((raw: unknown) => {
						const event = raw as {
							type: string
							sessionId?: string
							data?: string
							exitCode?: number
						}
						if (event.sessionId !== session.sessionId) return
						if (event.type === "pty_output" && event.data) {
							term.write(event.data)
						} else if (event.type === "pty_exit") {
							term.writeln(
								`\r\n\x1b[2m[Process exited with code ${event.exitCode ?? 0}]\x1b[0m`,
							)
							session.sessionId = null
						}
					})
				})
				.catch((error: unknown) => {
					session.started = false
					const message = String(error)
					// Only retry when the IPC handler is not up yet, not on a
					// spawn failure the user has to see.
					if (
						retries < 10 &&
						(message.includes("No handler") ||
							message.includes("not registered"))
					) {
						session.retryTimer = setTimeout(() => startPty(retries + 1), 500)
					} else {
						term.writeln(`\r\n\x1b[31m[Terminal error: ${message}]\x1b[0m`)
					}
				})
		}
		startPty()

		const onData = term.onData((data) => {
			if (!session.sessionId) return
			window.api.invoke({
				type: "ptyWrite",
				sessionId: session.sessionId,
				data,
			})
		})

		let observer: ResizeObserver | undefined
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => fit())
			observer.observe(container)
		}

		return () => {
			session.disposed = true
			if (session.retryTimer) clearTimeout(session.retryTimer)
			observer?.disconnect()
			onData.dispose()
			if (session.sessionId) {
				window.api.invoke({
					type: "ptyDestroy",
					sessionId: session.sessionId,
				})
			}
			session.unsub?.()
			term.dispose()
			sessionRef.current = null
		}
	}, [projectPath])

	// Landing here from an overview menu has to actually focus the shell: a
	// terminal that swallows the next keystroke looks broken.
	useEffect(() => {
		if (!focusSignal) return
		const session = sessionRef.current
		if (!session) return
		try {
			session.fitAddon.fit()
		} catch {
			// The panel may still be sliding in, so it has no usable size yet.
		}
		session.term.focus()
	}, [focusSignal])

	useEffect(() => {
		const observer = new MutationObserver(() => {
			const theme = getTerminalTheme()
			const session = sessionRef.current
			if (session) session.term.options.theme = theme
		})
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		})
		return () => observer.disconnect()
	}, [])

	if (!projectPath) {
		return (
			<div
				style={{
					flex: "1 1 0",
					minHeight: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "var(--bg)",
					color: "var(--dim)",
					fontSize: 12,
				}}
			>
				Select a worktree
			</div>
		)
	}

	return (
		<div
			ref={containerRef}
			data-testid="terminal-panel"
			onClick={() => sessionRef.current?.term.focus()}
			style={{
				flex: "1 1 0",
				minHeight: 0,
				overflow: "hidden",
				padding: "4px 0 4px 4px",
				background: "var(--bg)",
			}}
		/>
	)
}
