/**
 * Marks the point where the user stopped a run.
 *
 * A stop leaves nothing behind in the transcript: the harness aborts the turn
 * and the messages that already arrived stay exactly as they are. Without a
 * marker the conversation just ends mid-thought and reads like a crash, so this
 * note closes the turn in place.
 *
 * It is renderer state only — never written to the thread store — so reopening
 * the session or the app shows the transcript as the model left it.
 */
export function InterruptedNotice({
	label = "User actively interrupts task",
}: {
	label?: string
}) {
	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				margin: "14px 0 6px",
				// Keyframes live in ChatView, the only place that mounts this.
				animation: "interrupt-note-in 180ms ease-out both",
			}}
		>
			<span
				aria-hidden="true"
				style={{
					flex: 1,
					height: 1,
					minWidth: 24,
					background: "linear-gradient(to right, transparent, var(--border))",
				}}
			/>
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					fontSize: 12,
					lineHeight: 1,
					fontWeight: 500,
					color: "var(--muted)",
					whiteSpace: "nowrap",
				}}
			>
				<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
					<rect
						x="0.5"
						y="0.5"
						width="7"
						height="7"
						rx="2"
						fill="currentColor"
						opacity="0.5"
					/>
				</svg>
				{label}
			</span>
			<span
				aria-hidden="true"
				style={{
					flex: 1,
					height: 1,
					minWidth: 24,
					background: "linear-gradient(to left, transparent, var(--border))",
				}}
			/>
		</div>
	)
}
