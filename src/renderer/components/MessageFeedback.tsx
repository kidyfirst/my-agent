import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { FEEDBACK_LABELS, type FeedbackKind } from "../../utils/feedback"
import { INITIAL_VOTE, applyVote } from "../utils/feedbackVote"
import type { VoteState } from "../utils/feedbackVote"

/** How long the copy button stays in its "copied" state. */
const COPY_CONFIRM_MS = 2000

const ICON = {
	width: 15,
	height: 15,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.7,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const

function CopyIcon() {
	return (
		<svg {...ICON} aria-hidden="true">
			<rect x="9" y="9" width="13" height="13" rx="2.5" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
	)
}

function CheckIcon() {
	return (
		<svg {...ICON} aria-hidden="true">
			<polyline points="20 6 9 17 4 12" />
		</svg>
	)
}

function ThumbUpIcon() {
	return (
		<svg {...ICON} aria-hidden="true">
			<path d="M7 10v12" />
			<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
		</svg>
	)
}

function ThumbDownIcon() {
	return (
		<svg {...ICON} aria-hidden="true">
			<path d="M17 14V2" />
			<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
		</svg>
	)
}

interface PillButtonProps {
	label: string
	/** Colours the icon once the user has committed to this action. */
	active?: boolean
	activeColor?: string
	pressed?: boolean
	onClick: () => void
	children: ReactNode
}

function PillButton({
	label,
	active = false,
	activeColor = "var(--accent)",
	pressed,
	onClick,
	children,
}: PillButtonProps) {
	const [hover, setHover] = useState(false)

	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			aria-pressed={pressed}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 4,
				height: 26,
				minWidth: 26,
				padding: "0 5px",
				borderRadius: 999,
				border: "none",
				background: hover ? "var(--bg-hover)" : "transparent",
				color: active ? activeColor : hover ? "var(--text)" : "var(--muted)",
				cursor: "pointer",
				fontSize: 11,
				fontWeight: 500,
				lineHeight: 1,
				fontVariantNumeric: "tabular-nums",
				transition: "background-color 0.15s, color 0.15s",
			}}
		>
			{children}
		</button>
	)
}

interface MessageFeedbackProps {
	/** Full answer text; the copy button is hidden when there is nothing to copy. */
	text: string
}

/**
 * Footer pill under an assistant reply: copy · helpful · bad response.
 *
 * The two votes are **not** persisted (the app is local-first and we do not
 * want a votes table), so the component owns the highlight for its lifetime
 * only — a restart shows the pill unvoted, and the counter service holds the
 * only durable state.
 *
 * Which clicks actually reach the counter is decided by `applyVote`: at most
 * one hit per rendered reply, and switching thumbs stays silent.
 */
export function MessageFeedback({ text }: MessageFeedbackProps) {
	const [copied, setCopied] = useState(false)
	const [voted, setVoted] = useState<FeedbackKind | null>(null)
	const [count, setCount] = useState<number | null>(null)

	const copyTimer = useRef<number | null>(null)
	/** The authoritative vote bookkeeping; `voted` above only drives rendering. */
	const voteState = useRef<VoteState>(INITIAL_VOTE)
	const mounted = useRef(true)

	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
			if (copyTimer.current) window.clearTimeout(copyTimer.current)
		}
	}, [])

	const copy = useCallback(async () => {
		if (!text) return
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			if (copyTimer.current) window.clearTimeout(copyTimer.current)
			copyTimer.current = window.setTimeout(
				() => setCopied(false),
				COPY_CONFIRM_MS,
			)
		} catch (err) {
			console.error("Failed to copy response:", err)
		}
	}, [text])

	const vote = useCallback((kind: FeedbackKind) => {
		const { next, send } = applyVote(voteState.current, kind)
		voteState.current = next
		setVoted(next.voted)
		if (!send) return

		window.api
			.invoke({ type: "feedbackCounter", kind: send, action: "hit" })
			.then((result) => {
				const value = (result as { value?: unknown } | null)?.value
				// The total lands a beat after the click; showing it late beats
				// showing a guessed number that the server then contradicts.
				if (mounted.current && typeof value === "number") setCount(value)
			})
			.catch(() => {})
	}, [])

	const canCopy = text.trim().length > 0

	return (
		<div
			role="group"
			aria-label="Message actions"
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 2,
				padding: 3,
				borderRadius: 999,
				userSelect: "none",
			}}
		>
			{canCopy && (
				<PillButton
					label={copied ? "Copied" : "Copy response"}
					active={copied}
					activeColor="var(--success)"
					onClick={() => void copy()}
				>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</PillButton>
			)}

			{(["like", "dislike"] as const).map((kind) => {
				const selected = voted === kind
				const label = selected
					? `Marked ${FEEDBACK_LABELS[kind].toLowerCase()}`
					: FEEDBACK_LABELS[kind]
				return (
					<PillButton
						key={kind}
						label={label}
						active={selected}
						activeColor={kind === "like" ? "var(--accent)" : "var(--error)"}
						pressed={selected}
						onClick={() => vote(kind)}
					>
						{kind === "like" ? <ThumbUpIcon /> : <ThumbDownIcon />}
						{selected && count !== null && <span>{count}</span>}
					</PillButton>
				)
			})}
		</div>
	)
}
