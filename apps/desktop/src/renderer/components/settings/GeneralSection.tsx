import { useState, useRef } from "react"
import type { SettingsState, NotificationMode } from "../../types/settings"
import { SettingRow, Select, SectionHeader } from "./shared"
import { notificationOptions } from "./constants"
import {
	playCompletionSound,
	getCustomSoundInfo,
	setCustomSound,
	clearCustomSound,
	getAudioContext,
} from "../../utils/audio"
import { Icon } from "../Icon"

export function previewNotificationMode(mode: NotificationMode) {
	if (mode === "bell" || mode === "both") {
		playCompletionSound()
	}
}

interface GeneralSectionProps {
	state: SettingsState
	update: (key: keyof SettingsState, value: unknown) => void
}

export function GeneralSection({ state, update }: GeneralSectionProps) {
	const [checkStatus, setCheckStatus] = useState<string | null>(null)
	const [checking, setChecking] = useState(false)
	const [customSound, setCustomSoundState] = useState(() => getCustomSoundInfo())
	const [soundError, setSoundError] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return
		setSoundError(null)

		try {
			const arrayBuffer = await file.arrayBuffer()
			const ctx = getAudioContext()
			if (ctx) {
				const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
				if (audioBuffer.duration > 2.05) {
					setSoundError(
						`Sound duration is ${audioBuffer.duration.toFixed(1)}s. Maximum allowed length is 2 seconds.`,
					)
					e.target.value = ""
					return
				}
			}

			const reader = new FileReader()
			reader.onload = () => {
				const dataUrl = reader.result as string
				setCustomSound(file.name, dataUrl)
				setCustomSoundState({ name: file.name, dataUrl })
				playCompletionSound()
			}
			reader.readAsDataURL(file)
		} catch (err: any) {
			setSoundError(
				`Failed to process audio: ${err?.message || "Invalid audio format"}`,
			)
		} finally {
			e.target.value = ""
		}
	}

	const handleResetDefaultSound = () => {
		clearCustomSound()
		setCustomSoundState(null)
		setSoundError(null)
		playCompletionSound()
	}

	const handleCheckUpdates = async () => {
		setChecking(true)
		setCheckStatus("Checking for updates...")
		try {
			const res = (await window.api.invoke({
				type: "checkForUpdates",
			})) as any
			if (res?.hasUpdate) {
				setCheckStatus(`New version available: v${res.latestVersion}`)
			} else {
				setCheckStatus("You are on the latest version.")
			}
		} catch (err: any) {
			setCheckStatus("Failed to check for updates.")
		} finally {
			setChecking(false)
		}
	}

	return (
		<>
			<SectionHeader title="Appearance" />
			<SettingRow label="Theme" description="Choose interface color scheme">
				<Select
					value={state.theme ?? "light"}
					options={[
						{ value: "light", label: "Light" },
						{ value: "dark", label: "Dark" },
						{ value: "system", label: "System" },
					]}
					onChange={(v) => update("theme", v)}
				/>
			</SettingRow>

			<SectionHeader title="Notifications" />
			<SettingRow
				label="Notification mode"
				description="How to notify you when the agent finishes or needs attention"
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Select
						value={state.notifications === "bell" ? "bell" : "off"}
						options={notificationOptions}
						onChange={(v) => {
							const mode = v as NotificationMode
							update("notifications", mode)
							void previewNotificationMode(mode)
						}}
					/>
					{state.notifications === "bell" && (
						<button
							type="button"
							onClick={() => void previewNotificationMode("bell")}
							title="Test current notification sound"
							style={{
								background: "none",
								border: "1px solid var(--border)",
								borderRadius: 6,
								padding: "5px 10px",
								fontSize: 12,
								color: "var(--muted)",
								cursor: "pointer",
								transition: "all 0.15s ease",
								display: "flex",
								alignItems: "center",
								gap: 4,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = "var(--text)"
								e.currentTarget.style.borderColor = "var(--border-accent)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = "var(--muted)"
								e.currentTarget.style.borderColor = "var(--border)"
							}}
						>
							<Icon size={12} strokeWidth={2}>
								<polygon points="5 3 19 12 5 21 5 3" />
							</Icon>
							<span>Test</span>
						</button>
					)}
				</div>
			</SettingRow>

			{/* Custom Sound Upload Row (only when Sound is active) */}
			{state.notifications === "bell" && (
				<SettingRow
					label="Notification sound"
					description={
						soundError ? (
							<span style={{ color: "var(--error)" }}>{soundError}</span>
						) : customSound ? (
							`Custom sound: ${customSound.name} (Max 2s)`
						) : (
							"Default chime. You can upload a custom audio file (2 seconds length)."
						)
					}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<input
							type="file"
							ref={fileInputRef}
							accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
							style={{ display: "none" }}
							onChange={handleFileSelected}
						/>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							style={{
								padding: "5px 12px",
								borderRadius: 6,
								fontSize: 12,
								fontWeight: 500,
								background: "var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								gap: 6,
								transition: "all 0.15s ease",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = "var(--border-accent)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = "var(--border)"
							}}
						>
							<Icon size={13} strokeWidth={2}>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</Icon>
							<span>{customSound ? "Replace Sound" : "Upload Sound"}</span>
						</button>

						{customSound && (
							<button
								type="button"
								onClick={handleResetDefaultSound}
								title="Reset to default sound"
								style={{
									background: "none",
									border: "1px solid var(--border)",
									borderRadius: 6,
									padding: "5px 10px",
									fontSize: 12,
									color: "var(--muted)",
									cursor: "pointer",
									transition: "all 0.15s ease",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.color = "var(--error)"
									e.currentTarget.style.borderColor = "var(--error)"
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.color = "var(--muted)"
									e.currentTarget.style.borderColor = "var(--border)"
								}}
							>
								Reset
							</button>
						)}
					</div>
				</SettingRow>
			)}

			<SectionHeader title="Software Updates" />
			<SettingRow
				label="Check for Updates"
				description={
					checkStatus ?? "Check GitHub Releases for the latest version"
				}
			>
				<button
					type="button"
					onClick={handleCheckUpdates}
					disabled={checking}
					style={{
						padding: "6px 14px",
						borderRadius: 6,
						fontSize: 12,
						fontWeight: 500,
						background: "var(--accent)",
						color: "var(--on-accent)",
						border: "none",
						cursor: checking ? "not-allowed" : "pointer",
						opacity: checking ? 0.7 : 1,
					}}
				>
					{checking ? "Checking..." : "Check Now"}
				</button>
			</SettingRow>
		</>
	)
}
