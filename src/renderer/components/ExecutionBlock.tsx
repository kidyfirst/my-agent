import { useState, useEffect, useRef, memo } from "react"
import { ToolExecution } from "./ToolExecution"

export interface ExecutionTool {
	id: string
	name: string
	args: unknown
	result?: unknown
	isError?: boolean
	status: "pending" | "running" | "complete" | "error"
	shellOutput?: string
}

export interface ThinkingStep {
	type: "thinking"
	id: string
	text: string
	durationSec?: number
	isStreaming?: boolean
	startedAt?: number | null
}

export interface ToolStep {
	type: "tool"
	id: string
	tool: ExecutionTool
}

export type ExecutionStep = ThinkingStep | ToolStep

export interface ExecutionBlockProps {
	isActive?: boolean
	steps: ExecutionStep[]
	durationMs?: number
	startedAt?: number | null
}

function Chevron({ open }: { open: boolean }) {
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				color: "var(--dim)",
				flexShrink: 0,
			}}
		>
			<svg
				width="10"
				height="10"
				viewBox="0 0 10 10"
				fill="none"
				aria-hidden="true"
				style={{
					transform: open ? "rotate(90deg)" : "rotate(0deg)",
					transition: "transform 0.15s ease",
				}}
			>
				<path
					d="M3.5 2L6.5 5L3.5 8"
					stroke="currentColor"
					strokeWidth="1.3"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	)
}

function ThoughtStepItem({
	step,
	isActive,
	isParentExpanded,
}: {
	step: ThinkingStep
	isActive?: boolean
	isParentExpanded?: boolean
}) {
	const [userToggled, setUserToggled] = useState<boolean | null>(null)
	const [liveSec, setLiveSec] = useState<number>(step.durationSec ?? 1)

	useEffect(() => {
		if (step.isStreaming && step.startedAt) {
			const update = () => {
				setLiveSec(
					Math.max(1, Math.round((Date.now() - step.startedAt!) / 1000)),
				)
			}
			update()
			const interval = setInterval(update, 1000)
			return () => clearInterval(interval)
		} else if (step.durationSec != null) {
			setLiveSec(step.durationSec)
		}
	}, [step.isStreaming, step.startedAt, step.durationSec])

	const isCurrentlyThinking = step.isStreaming && isActive
	const durationText = `${liveSec}s`
	const label = isCurrentlyThinking
		? `Thinking for ${durationText}`
		: `Thought for ${durationText}`

	const isExpanded =
		userToggled !== null
			? userToggled
			: Boolean(isParentExpanded || isCurrentlyThinking)

	return (
		<div style={{ padding: "3px 0" }}>
			<div
				onClick={(e) => {
					e.stopPropagation()
					if (step.text) {
						setUserToggled(!isExpanded)
					}
				}}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					cursor: step.text ? "pointer" : "default",
					userSelect: "none",
					fontSize: 13,
					lineHeight: 1,
					color: "var(--muted)",
				}}
				onMouseEnter={(e) => {
					if (step.text)
						(e.currentTarget as HTMLElement).style.color = "var(--text)"
				}}
				onMouseLeave={(e) => {
					if (step.text)
						(e.currentTarget as HTMLElement).style.color = "var(--muted)"
				}}
			>
				<span>{label}</span>
				{step.text && <Chevron open={isExpanded} />}
			</div>

			{/* Expanded thought reasoning text (matches Screenshot 1) */}
			{isExpanded && step.text && (
				<div
					style={{
						marginTop: 6,
						marginBottom: 10,
						padding: "8px 12px",
						background: "var(--bg-surface)",
						border: "1px solid var(--border-muted)",
						borderRadius: 6,
						color: "var(--text)",
						fontSize: 13,
						lineHeight: 1.6,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						maxHeight: 360,
						overflowY: "auto",
					}}
				>
					{step.text}
				</div>
			)}
		</div>
	)
}

export const ExecutionBlock = memo(function ExecutionBlock({
	isActive = false,
	steps,
	durationMs,
	startedAt,
}: ExecutionBlockProps) {
	// Default Thinking is collapsed to a 2~3 line scrollable preview window
	const [expanded, setExpanded] = useState(false)
	const [elapsedSec, setElapsedSec] = useState<number>(0)
	const scrollContainerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (isActive && startedAt) {
			const update = () => {
				setElapsedSec(Math.max(0, (Date.now() - startedAt) / 1000))
			}
			update()
			const interval = setInterval(update, 100)
			return () => clearInterval(interval)
		} else if (durationMs != null) {
			setElapsedSec(durationMs / 1000)
		}
	}, [isActive, startedAt, durationMs])

	// Auto-scroll to bottom of preview window as steps execute in collapsed mode
	useEffect(() => {
		if (!expanded && scrollContainerRef.current) {
			scrollContainerRef.current.scrollTop =
				scrollContainerRef.current.scrollHeight
		}
	}, [steps.length, isActive, expanded])

	const formatSecs = (sec: number) => {
		if (sec >= 60) {
			const m = Math.floor(sec / 60)
			const s = Math.round(sec - m * 60)
			return `${m}m ${s}s`
		}
		return `${sec.toFixed(1)}s`
	}

	const formattedDuration =
		isActive && startedAt
			? formatSecs(elapsedSec)
			: durationMs != null
				? formatSecs(durationMs / 1000)
				: null

	if (steps.length === 0 && !isActive && !formattedDuration) {
		return null
	}

	// A finished turn shows a single collapsed "Worked for 6m" line; the
	// detailed steps only appear once the user clicks it.
	const headerLabel = isActive
		? formattedDuration
			? `Working for ${formattedDuration}`
			: "Working"
		: formattedDuration
			? `Worked for ${formattedDuration}`
			: "Worked"

	const isClickable = steps.length > 0 || isActive
	// When the step list is on screen it already separates the label from the
	// answer; the gap below the block then only needs to clear the last row.
	const stepsVisible = steps.length > 0 && (isActive || expanded)

	return (
		// The 8px bottom margin is the gap between the header line and the answer
		// below it, and it matches the gap the answer's timestamp uses at the
		// other end of the message. The answer drops its own top padding when it
		// follows this header (AssistantMessage's `flushTop`), so the two do not
		// stack into one oversized hole.
		<div style={{ margin: `6px 0 ${stepsVisible ? 12 : 8}px 0` }}>
			<div
				onClick={() => {
					if (isClickable) setExpanded(!expanded)
				}}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					cursor: isClickable ? "pointer" : "default",
					userSelect: "none",
					// No bottom padding: the gap under the label is owned by this
					// block's margin, so it stays consistent with the timestamp.
					padding: "3px 0 0 0",
					fontSize: 13,
					lineHeight: 1,
					fontWeight: 500,
					color: "var(--muted)",
					transition: "color 0.15s ease",
				}}
				onMouseEnter={(e) => {
					if (isClickable)
						(e.currentTarget as HTMLElement).style.color = "var(--text)"
				}}
				onMouseLeave={(e) => {
					if (isClickable)
						(e.currentTarget as HTMLElement).style.color = "var(--muted)"
				}}
				title={
					isClickable
						? expanded
							? "Click to collapse"
							: "Click to expand all"
						: undefined
				}
			>
				<span>{headerLabel}</span>
				{steps.length > 0 && <Chevron open={expanded} />}
				{steps.length > 0 && !expanded && (
					<span style={{ fontSize: 11, color: "var(--dim)" }}>
						({steps.length} step{steps.length > 1 ? "s" : ""})
					</span>
				)}
			</div>

			{/* Placeholder message when clicked to expand before steps arrive */}
			{steps.length === 0 && isActive && expanded && (
				<div
					style={{
						marginTop: 9,
						paddingLeft: 14,
						fontSize: 12,
						color: "var(--dim)",
					}}
				>
					Thinking in progress...
				</div>
			)}

			{/* Steps list: while running, collapsed shows a 2~3 line scrollable
			    window (~82px); once finished it stays hidden until expanded. */}
			{steps.length > 0 && (isActive || expanded) && (
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
						!expanded && steps.length > 3
							? "Click to view all steps"
							: undefined
					}
				>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{steps.map((step) => {
							if (step.type === "thinking") {
								return (
									<ThoughtStepItem
										key={step.id}
										step={step}
										isActive={isActive}
										isParentExpanded={expanded}
									/>
								)
							}
							return <ToolExecution key={step.id} tool={step.tool} />
						})}
					</div>
				</div>
			)}
		</div>
	)
})
