import { useState, useEffect, useRef } from "react"
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
}: {
	step: ThinkingStep
	isActive?: boolean
}) {
	const [expanded, setExpanded] = useState(false)
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

	return (
		<div style={{ padding: "3px 0" }}>
			<div
				onClick={(e) => {
					e.stopPropagation()
					if (step.text) {
						setExpanded(!expanded)
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
				{step.text && <Chevron open={expanded} />}
			</div>

			{/* Expanded thought reasoning text (matches Screenshot 1) */}
			{expanded && step.text && (
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

export function ExecutionBlock({
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

	if (steps.length === 0 && !isActive) {
		return null
	}

	return (
		<div style={{ margin: "6px 0 10px 0" }}>
			{/* Top Header: Thinking + chevron */}
			<div
				onClick={() => setExpanded(!expanded)}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					cursor: "pointer",
					userSelect: "none",
					padding: "3px 0",
					fontSize: 13,
					lineHeight: 1,
					fontWeight: 500,
					color: "var(--muted)",
				}}
				title={expanded ? "Click to collapse" : "Click to expand all"}
			>
				<span>
					{formattedDuration
						? `${isActive ? "Thinking" : "Thought"} for ${formattedDuration}`
						: "Thinking"}
				</span>
				<Chevron open={expanded} />
				{steps.length > 0 && !expanded && (
					<span style={{ fontSize: 11, color: "var(--dim)" }}>
						({steps.length} step{steps.length > 1 ? "s" : ""})
					</span>
				)}
			</div>

			{/* Steps list: collapsed shows a 2~3 line scrollable window (~82px); expanded shows all */}
			{steps.length > 0 && (
				<div
					ref={scrollContainerRef}
					onClick={!expanded ? () => setExpanded(true) : undefined}
					style={{
						marginTop: 6,
						paddingLeft: 14,
						maxHeight: expanded ? "none" : 82,
						overflowY: "auto",
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
}
