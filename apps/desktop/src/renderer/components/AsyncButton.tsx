import { useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react"
import { SpinnerIcon } from "./icons"

type AsyncButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> & {
		onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
		children: ReactNode
		loading?: boolean
		loadingLabel?: ReactNode
	progress?: number | null
	}

/** Shared button guard for actions that may open a dialog or perform async work. */
export function AsyncButton({ onClick, children, loading = false, loadingLabel, progress, disabled, ...props }: AsyncButtonProps) {
	const [pending, setPending] = useState(false)
	const lockedRef = useRef(false)
	const busy = loading || pending
	return (
		<button
			{...props}
			style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, ...props.style }}
			disabled={disabled || busy}
			aria-busy={busy || undefined}
			onClick={async (event) => {
				if (!onClick || lockedRef.current) return
				lockedRef.current = true
				setPending(true)
				try { await onClick(event) } finally {
					lockedRef.current = false
					setPending(false)
				}
			}}
		>
			{busy && progress !== undefined && <span aria-hidden="true" style={{ position: "absolute", inset: "auto 0 0", height: 3, overflow: "hidden", borderRadius: "inherit" }}><span style={{ display: "block", width: progress === null ? "42%" : `${Math.max(0, Math.min(100, progress))}%`, height: "100%", background: "rgba(255,255,255,.85)", animation: progress === null ? "async-button-progress 1.1s ease-in-out infinite" : undefined }} /></span>}
			{busy && <SpinnerIcon size={13} aria-label="Loading" />}
			{busy ? (loadingLabel || children) : children}
		</button>
	)
}
