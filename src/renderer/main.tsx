import { createRoot } from "react-dom/client"
import { App } from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import "./styles/global.css"
import "@xterm/xterm/css/xterm.css"

// An unhandled file drop makes Electron navigate the window to the file:// URL, which
// blanks the UI and surfaces a "cannot open file" error. Swallow the defaults app-wide;
// real drop targets still get their events first because bubbling reaches window last.
for (const type of ["dragover", "drop"] as const) {
	window.addEventListener(type, (event) => event.preventDefault())
}

// Renderer crashes are otherwise invisible in the log file: React swallows
// errors inside the tree and an async rejection never reaches the main process.
// Batch them so a burst of failures costs a single IPC round-trip.
{
	let queue: Array<{
		level: string
		scope: string
		message: string
		data?: unknown
	}> = []
	let timer: ReturnType<typeof setTimeout> | null = null
	const flush = () => {
		timer = null
		if (queue.length === 0) return
		const batch = queue
		queue = []
		try {
			window.api
				.invoke({ type: "logFromRenderer", entries: batch })
				.catch(() => {})
		} catch {
			// The bridge may not be ready during a fatal boot error.
		}
	}
	const report = (
		level: string,
		scope: string,
		message: string,
		data?: unknown,
	) => {
		queue.push({ level, scope, message, data })
		if (queue.length > 50) queue = queue.slice(queue.length - 50)
		if (timer) return
		timer = setTimeout(flush, 400)
	}

	window.addEventListener("error", (event) => {
		report("error", "window", event.message || "window error", {
			source: event.filename,
			line: event.lineno,
			column: event.colno,
			error:
				event.error instanceof Error
					? { name: event.error.name, stack: event.error.stack }
					: undefined,
		})
	})
	window.addEventListener("unhandledrejection", (event) => {
		const reason = event.reason
		report("error", "promise", "unhandled rejection", {
			reason:
				reason instanceof Error
					? { name: reason.name, message: reason.message, stack: reason.stack }
					: reason,
		})
	})
	window.addEventListener("beforeunload", flush)
}

const root = createRoot(document.getElementById("root")!)
root.render(
	<ErrorBoundary>
		<App />
	</ErrorBoundary>,
)
