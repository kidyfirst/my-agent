import { useState, useEffect, useRef, memo } from "react"
import { Chevron } from "./ExecutionBlock"
import { ToolExecution } from "./ToolExecution"

interface SubagentTool {
	name: string
	args?: unknown
	result?: unknown
	isError?: boolean
	status: string
}

interface SubagentExecutionProps {
	subagent: {
		toolCallId: string
		agentType: string
		task: string
		tools: SubagentTool[]
		result?: string
		isError?: boolean
		durationMs?: number
		status: string
		/** 1-based position among parallel agents of the same turn. */
		index?: number
	}
}

/** Seconds render like the Working/Thinking labels: "114s", "2m 39s". */
function formatSecs(sec: number) {
	if (sec >= 60) {
		const m = Math.floor(sec / 60)
		const s = Math.round(sec - m * 60)
		return `${m}m ${s}s`
	}
	return `${Math.round(sec)}s`
}

/**
 * The Agent row under an assistant reply, styled to match
 * "Working for 2m 39s › (3 steps)": a muted inline label whose duration
 * ticks while the subagent runs, a chevron, and a step-count hint. The
 * sub-tool log reuses the exact ToolExecution rows from the Working block —
 * collapsed it shows a ~82px auto-scrolling window, expanded it shows
 * everything. Only a genuinely live run ticks; "interrupted" rows (app
 * closed before the result landed) render frozen.
 */
export const SubagentExecution = memo(function SubagentExecution({
	subagent,
}: SubagentExecutionProps) {
	const [expanded, setExpanded] = useState(false)
	const [hover, setHover] = useState(false)
	const isRunning = subagent.status === "running"
	const [liveSec, setLiveSec] = useState<number>(1)
	const scrollContainerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isRunning) return
		const start = Date.now()
		const timer = setInterval(() => {
			setLiveSec(Math.max(1, Math.round((Date.now() - start) / 1000)))
		}, 1000)
		return () => clearInterval(timer)
	}, [isRunning])

	// Auto-scroll the collapsed window so the newest sub-tool stays visible.
	useEffect(() => {
		if (!expanded && scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop =
				scrollContainerRef.current.scrollHeight
		}
	}, [subagent.tools.length, expanded])

	const staticSec =
		subagent.durationMs != null ? subagent.durationMs / 1000 : null
	const durationText = isRunning
		? formatSecs(liveSec)
		: staticSec != null
			? formatSecs(staticSec)
			: null
	const failed = Boolean(subagent.isError) && !isRunning
	// Parallel agents of one turn are numbered "Agent 1", "Agent 2", …
	const name = subagent.index ? `Agent ${subagent.index}` : "Agent"
	const label = failed
		? durationText
			? `${name} failed after ${durationText}`
			: `${name} failed`
		: durationText
			? `${name} for ${durationText}`
			: name

	return (
		<div style={{ margin: "2px 0" }}>
			<div
				onClick={() => setExpanded(!expanded)}
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					cursor: "pointer",
					userSelect: "none",
					fontSize: 13,
					lineHeight: 1,
					color: failed
						? "var(--error)"
						: hover
							? "var(--text)"
							: "var(--muted)",
				}}
				title={expanded ? "Click to collapse" : "Click to expand all"}
			>
				<span>{label}</span>
				<Chevron open={expanded} />
				{subagent.tools.length > 0 && !expanded && (
					<span style={{ fontSize: 11, color: "var(--dim)" }}>
						({subagent.tools.length} step
						{subagent.tools.length > 1 ? "s" : ""})
					</span>
				)}
			</div>

			{/* Sub-tool log: collapsed shows a 2~3 row auto-scrolling window
			    (identical to the Working block); expanded shows all rows. */}
			{subagent.tools.length > 0 && (
				<div
					ref={scrollContainerRef}
					onClick={!expanded ? () => setExpanded(true) : undefined}
					className="scrollbar-none"
					style={{
						marginTop: 9,
						paddingLeft: 14,
						maxHeight: expanded ? "none" : 82,
						overflowY: "auto",
						scrollbarWidth: "none",
						cursor: !expanded ? "pointer" : "default",
						transition: "max-height 0.2s ease",
					}}
					title={
						!expanded && subagent.tools.length > 3
							? "Click to view all steps"
							: undefined
					}
				>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{subagent.tools.map((t, i) => (
							<ToolExecution
								key={`${t.name}-${i}`}
								tool={{
									id: `${subagent.toolCallId}-${i}`,
									name: t.name,
									args: t.args,
									result: t.result,
									isError: t.isError,
									status:
										t.status === "running"
											? "running"
											: t.isError
												? "error"
												: "complete",
								}}
							/>
						))}
					</div>
				</div>
			)}

			{/* Final result */}
			{expanded && subagent.result && (
				<div style={{ marginTop: 6, paddingLeft: 14 }}>
					<pre
						style={{
							background: "var(--bg)",
							padding: 8,
							borderRadius: 4,
							color: subagent.isError ? "var(--error)" : "var(--tool-output)",
							fontSize: 11,
							overflow: "auto",
							maxHeight: 200,
							margin: 0,
							border: "1px solid var(--border-muted)",
							whiteSpace: "pre-wrap",
						}}
					>
						{subagent.result}
					</pre>
				</div>
			)}
		</div>
	)
})
