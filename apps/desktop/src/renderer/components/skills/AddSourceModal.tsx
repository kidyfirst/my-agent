import { useState, useEffect, useRef } from "react"
import { CloseIcon, PlusIcon, SpinnerIcon, ShieldAlertIcon, GlobeIcon, CheckIcon } from "../icons"

export interface AddSourceModalProps {
	isOpen: boolean
	onClose: () => void
	onSuccess: (newSourceUrl: string, newSourceName: string) => void
	showToast?: (message: string, type?: "info" | "success" | "error") => void
}

export function AddSourceModal({
	isOpen,
	onClose,
	onSuccess,
	showToast,
}: AddSourceModalProps) {
	const [url, setUrl] = useState("")
	const [isChecking, setIsChecking] = useState(false)
	const [progress, setProgress] = useState(0)
	const [statusText, setStatusText] = useState("")
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

	useEffect(() => {
		if (isOpen) {
			setUrl("")
			setIsChecking(false)
			setProgress(0)
			setStatusText("")
			setErrorMessage(null)
			setTimeout(() => inputRef.current?.focus(), 50)
		}
		return () => {
			timersRef.current.forEach((t) => clearTimeout(t))
			timersRef.current = []
		}
	}, [isOpen])

	if (!isOpen) return null

	const handleNext = async (e?: React.FormEvent) => {
		if (e) e.preventDefault()
		const trimmedUrl = url.trim()
		if (!trimmedUrl || isChecking) return

		setIsChecking(true)
		setErrorMessage(null)
		setProgress(15)
		setStatusText("Resolving domain and connecting to server...")

		timersRef.current.forEach((t) => clearTimeout(t))
		timersRef.current = []

		// Progressive animation milestones while backend validates
		const t1 = setTimeout(() => {
			setProgress(35)
			setStatusText("Verifying network reachability...")
		}, 300)
		const t2 = setTimeout(() => {
			setProgress(60)
			setStatusText("Inspecting REST API categories endpoint (/api/v1/plugins/categories)...")
		}, 700)
		const t3 = setTimeout(() => {
			setProgress(85)
			setStatusText("Validating plugins listing and open-source schema (/api/v1/plugins)...")
		}, 1200)
		timersRef.current.push(t1, t2, t3)

		try {
			const res = (await window.api.invoke({
				type: "validateSkillHubSource",
				url: trimmedUrl,
			})) as {
				valid: boolean
				domain?: string
				normalizedUrl?: string
				error?: string
			}

			timersRef.current.forEach((t) => clearTimeout(t))
			timersRef.current = []

			if (!res || !res.valid || !res.normalizedUrl) {
				setIsChecking(false)
				setProgress(0)
				setStatusText("")
				setErrorMessage(
					res?.error ||
						"The server did not meet open-source SkillHub requirements. Please verify domain and REST endpoints.",
				)
				return
			}

			// Validation succeeded!
			setProgress(100)
			setStatusText("Verification passed! Saving source...")

			const addRes = (await window.api.invoke({
				type: "addSkillHubSource",
				url: res.normalizedUrl,
				name: res.domain,
			})) as { success: boolean; error?: string }

			if (!addRes || !addRes.success) {
				setIsChecking(false)
				setProgress(0)
				setStatusText("")
				setErrorMessage(addRes?.error || "Failed to save SkillHub source.")
				return
			}

			if (showToast) {
				showToast("SkillHub source added successfully.", "success")
			}

			const normalizedUrl = res.normalizedUrl
			const domainName = res.domain || new URL(normalizedUrl).hostname

			setTimeout(() => {
				onSuccess(normalizedUrl, domainName)
				onClose()
			}, 300)
		} catch (err: any) {
			timersRef.current.forEach((t) => clearTimeout(t))
			timersRef.current = []
			setIsChecking(false)
			setProgress(0)
			setStatusText("")
			setErrorMessage(err?.message || "An unexpected error occurred during validation.")
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--scrim)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 200,
				padding: 16,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget && !isChecking) onClose()
			}}
		>
			<div
				style={{
					background: "var(--bg-surface)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					boxShadow: "var(--shadow-popover)",
					width: "100%",
					maxWidth: 480,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "14px 18px",
						borderBottom: "1px solid var(--border-muted)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<GlobeIcon size={16} stroke="var(--accent)" />
						<span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
							Add SkillHub Source
						</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={isChecking}
						aria-label="Close"
						style={{
							background: "transparent",
							border: "none",
							color: "var(--muted)",
							cursor: isChecking ? "default" : "pointer",
							padding: 4,
							display: "flex",
							alignItems: "center",
							borderRadius: 4,
							opacity: isChecking ? 0.4 : 1,
						}}
					>
						<CloseIcon size={14} />
					</button>
				</div>

				{/* Body */}
				<form onSubmit={handleNext} style={{ padding: "16px 18px 20px" }}>
					<div
						style={{
							fontSize: 12,
							color: "var(--muted)",
							marginBottom: 12,
							lineHeight: 1.5,
						}}
					>
						Enter the SkillHub service address. The server will be verified against open-source SkillHub specifications before adding:
					</div>

					{/* Progressive Input Field */}
					<div style={{ position: "relative" }}>
						<input
							ref={inputRef}
							type="text"
							value={url}
							onChange={(e) => {
								setUrl(e.target.value)
								if (errorMessage) setErrorMessage(null)
							}}
							disabled={isChecking}
							placeholder="e.g. https://skillhub.xxx/"
							style={{
								width: "100%",
								padding: "8px 12px",
								fontSize: 13,
								fontFamily: "inherit",
								color: "var(--text)",
								border: `1px solid ${
									errorMessage
										? "var(--error)"
										: isChecking
										? "var(--accent)"
										: "var(--border)"
								}`,
								borderRadius: 6,
								outline: "none",
								boxSizing: "border-box",
								background: isChecking
									? `linear-gradient(to right, var(--selected-bg) ${progress}%, var(--bg-elevated) ${progress}%)`
									: "var(--bg-elevated)",
								transition: "background 0.2s ease, border-color 0.2s ease",
							}}
						/>
					</div>

					{/* Progress / Status Indicator */}
					{isChecking && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 11,
								color: progress === 100 ? "var(--success)" : "var(--accent)",
								marginTop: 8,
							}}
						>
							{progress === 100 ? (
								<CheckIcon size={12} stroke="var(--success)" strokeWidth={2} />
							) : (
								<SpinnerIcon size={12} />
							)}
							<span>
								Checking SkillHub source ({progress}%): {statusText}
							</span>
						</div>
					)}

					{/* Failure Reason */}
					{errorMessage && (
						<div
							style={{
								display: "flex",
								alignItems: "flex-start",
								gap: 6,
								fontSize: 11,
								color: "var(--error)",
								marginTop: 8,
								background: "var(--bg-elevated)",
								padding: "8px 10px",
								borderRadius: 6,
								border: "1px solid var(--border)",
								lineHeight: 1.4,
							}}
						>
							<ShieldAlertIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
							<span>{errorMessage}</span>
						</div>
					)}

					{/* Actions */}
					<div
						style={{
							display: "flex",
							justifyContent: "flex-end",
							alignItems: "center",
							gap: 10,
							marginTop: 18,
						}}
					>
						<button
							type="button"
							onClick={onClose}
							disabled={isChecking}
							style={{
								padding: "6px 14px",
								fontSize: 12,
								fontFamily: "inherit",
								background: "transparent",
								border: "1px solid var(--border)",
								borderRadius: 6,
								color: "var(--muted)",
								cursor: isChecking ? "default" : "pointer",
								opacity: isChecking ? 0.5 : 1,
							}}
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!url.trim() || isChecking}
							style={{
								padding: "6px 16px",
								fontSize: 12,
								fontWeight: 500,
								fontFamily: "inherit",
								color: "var(--on-accent)",
								background: "var(--accent)",
								border: "1px solid var(--border-accent)",
								borderRadius: 6,
								cursor: !url.trim() || isChecking ? "default" : "pointer",
								opacity: !url.trim() || isChecking ? 0.6 : 1,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{isChecking ? (
								<>
									<SpinnerIcon size={12} />
									<span>Validating ({progress}%)...</span>
								</>
							) : (
								<>
									<span>Next</span>
								</>
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}
