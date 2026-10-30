import { useState, useEffect } from "react"

const MY_TOP = "█▀▄▀█  █ █"
const MY_BOTTOM = "█ ▀ █   █ "
const SEP = "   "
const AGENT_TOP = "▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀"
const AGENT_BOTTOM = "█▀█ █▄█ ██▄ █ ▀█  █ "

const MY_LEN = MY_TOP.length // 10
const SEP_LEN = SEP.length // 3
const AGENT_LEN = AGENT_TOP.length // 20
const TOTAL_COLS = MY_LEN + SEP_LEN + AGENT_LEN // 33
const PAUSE_TICKS = 8
const TOTAL = TOTAL_COLS + PAUSE_TICKS

export function AsciiLogo() {
	const [tick, setTick] = useState(0)
	const done = tick >= TOTAL

	useEffect(() => {
		if (done) return
		const id = setInterval(() => setTick((t) => Math.min(t + 1, TOTAL)), 16)
		return () => clearInterval(id)
	}, [done])

	const col = Math.min(tick, TOTAL_COLS)
	const myCols = Math.min(col, MY_LEN)
	const sepCols = Math.min(Math.max(0, col - MY_LEN), SEP_LEN)
	const agentCols = Math.max(0, col - MY_LEN - SEP_LEN)

	const myTopShown = MY_TOP.slice(0, myCols)
	const myBottomShown = MY_BOTTOM.slice(0, myCols)
	const sepShown = SEP.slice(0, sepCols)
	const agentTopShown = AGENT_TOP.slice(0, agentCols)
	const agentBottomShown = AGENT_BOTTOM.slice(0, agentCols)

	const isAgentPhase = col > MY_LEN
	const showCursor = !done && col > 0

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				flex: 1,
				minHeight: "100%",
				gap: 16,
			}}
		>
			<pre
				style={{
					fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
					fontSize: 15,
					lineHeight: 1.15,
					margin: 0,
					whiteSpace: "pre",
				}}
			>
				{/* Row 1: MY + SEP + AGENT */}
				<div style={{ height: "1.15em", whiteSpace: "pre" }}>
					<span style={{ color: "var(--text)" }}>{myTopShown}</span>
					<span>{sepShown}</span>
					<span
						style={{
							color: "var(--logo-accent)",
							textShadow:
								agentCols > 0
									? "0 0 10px color-mix(in srgb, var(--logo-accent) 25%, transparent)"
									: "none",
						}}
						className={done ? "ascii-glow-settle" : undefined}
					>
						{agentTopShown}
					</span>
					{showCursor && (
						<span
							className="ascii-cursor"
							style={{
								display: "inline-block",
								width: 2,
								height: "0.85em",
								marginLeft: 1,
								background: isAgentPhase ? "var(--logo-accent)" : "var(--text)",
								boxShadow: isAgentPhase
									? "0 0 4px color-mix(in srgb, var(--logo-accent) 50%, transparent)"
									: "none",
								verticalAlign: "text-bottom",
							}}
						/>
					)}
				</div>

				{/* Row 2: MY + SEP + AGENT */}
				<div style={{ height: "1.15em", whiteSpace: "pre" }}>
					<span style={{ color: "var(--text)" }}>{myBottomShown}</span>
					<span>{sepShown}</span>
					<span
						style={{
							color: "var(--logo-accent)",
							textShadow:
								agentCols > 0
									? "0 0 10px color-mix(in srgb, var(--logo-accent) 25%, transparent)"
									: "none",
						}}
						className={done ? "ascii-glow-settle" : undefined}
					>
						{agentBottomShown}
					</span>
				</div>
			</pre>

			<div
				style={{
					fontSize: 13,
					color: "var(--dim)",
					opacity: done ? 1 : 0,
					transition: "opacity 0.8s ease",
				}}
			>
				Send a message to get started
			</div>

			<style>{`
				@keyframes ascii-blink {
					50% { opacity: 0; }
				}
				@keyframes ascii-glow {
					0% { text-shadow: 0 0 16px color-mix(in srgb, var(--logo-accent) 50%, transparent), 0 0 32px color-mix(in srgb, var(--logo-accent) 25%, transparent); }
					100% { text-shadow: 0 0 8px color-mix(in srgb, var(--logo-accent) 20%, transparent); }
				}
				.ascii-cursor {
					animation: ascii-blink 0.53s step-end infinite;
				}
				.ascii-glow-settle {
					animation: ascii-glow 0.8s ease-out forwards;
				}
			`}</style>
		</div>
	)
}
