import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { FEEDBACK_LABELS, type FeedbackKind } from "@my-agent/core"
import { INITIAL_VOTE, applyVote } from "../utils/feedbackVote"
import type { VoteState } from "../utils/feedbackVote"
import { CopyIcon, CheckIcon, ThumbsUpIcon, ThumbsDownIcon } from "./icons"

/** How long the copy button stays in its "copied" state. */
const COPY_CONFIRM_MS = 2000

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
 *
 * Vote totals are intentionally never displayed — a per-reply global count is
 * noise next to a single user's answer; the README badges are the public face.
 */
export function MessageFeedback({ text }: MessageFeedbackProps) {
	const [copied, setCopied] = useState(false)
	const [voted, setVoted] = useState<FeedbackKind | null>(null)

	const copyTimer = useRef<number | null>(null)
	/** The authoritative vote bookkeeping; `voted` above only drives rendering. */
	const voteState = useRef<VoteState>(INITIAL_VOTE)

	useEffect(() => {
		return () => {
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

		// Fire-and-forget: the pill never shows totals, so the response is
		// irrelevant; the counter service holds the only durable state.
		window.api
			.invoke({ type: "feedbackCounter", kind: send, action: "hit" })
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
					{copied ? (
						<CheckIcon size={15} strokeWidth={1.7} aria-hidden="true" />
					) : (
						<CopyIcon size={15} strokeWidth={1.7} aria-hidden="true" />
					)}
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
						{kind === "like" ? (
							<ThumbsUpIcon size={15} strokeWidth={1.7} aria-hidden="true" />
						) : (
							<ThumbsDownIcon size={15} strokeWidth={1.7} aria-hidden="true" />
						)}
					</PillButton>
				)
			})}
		</div>
	)
}
