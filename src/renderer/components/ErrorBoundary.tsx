import { Component, type ReactNode, type ErrorInfo } from "react"

interface Props {
	children: ReactNode
	fallback?: ReactNode
}

interface State {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = { hasError: false, error: null, errorInfo: null }
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("ErrorBoundary caught an error:", error, errorInfo)
		this.setState({ errorInfo })
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null, errorInfo: null })
		window.location.reload()
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback
			return (
				<div
					style={{
						padding: 32,
						height: "100vh",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						background: "var(--bg)",
						color: "var(--text)",
						fontFamily: "var(--font-mono)",
					}}
				>
					<div
						style={{
							maxWidth: 600,
							width: "100%",
							background: "var(--bg-elevated)",
							padding: 24,
							borderRadius: 8,
							border: "1px solid var(--border-muted)",
						}}
					>
						<h3 style={{ margin: "0 0 12px", color: "var(--error)" }}>
							Something went wrong
						</h3>
						<p
							style={{
								margin: "0 0 16px",
								fontSize: 13,
								color: "var(--muted)",
							}}
						>
							{this.state.error?.message || "An unexpected error occurred."}
						</p>
						{this.state.errorInfo?.componentStack && (
							<pre
								style={{
									margin: "0 0 16px",
									padding: 12,
									background: "var(--bg-surface)",
									borderRadius: 4,
									fontSize: 11,
									overflowX: "auto",
									maxHeight: 200,
								}}
							>
								{this.state.errorInfo.componentStack}
							</pre>
						)}
						<button
							onClick={this.handleReset}
							style={{
								padding: "8px 16px",
								background: "var(--accent)",
								color: "var(--on-accent)",
								border: "none",
								borderRadius: 4,
								cursor: "pointer",
							}}
						>
							Reload Application
						</button>
					</div>
				</div>
			)
		}

		return this.props.children
	}
}
