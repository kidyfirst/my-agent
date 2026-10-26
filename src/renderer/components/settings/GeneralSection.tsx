import { useState } from "react"
import type { SettingsState, NotificationMode } from "../../types/settings"
import { SettingRow, Select, SectionHeader } from "./shared"
import { notificationOptions } from "./constants"

interface GeneralSectionProps {
	state: SettingsState
	update: (key: keyof SettingsState, value: unknown) => void
}

export function GeneralSection({ state, update }: GeneralSectionProps) {
	const [checkStatus, setCheckStatus] = useState<string | null>(null)
	const [checking, setChecking] = useState(false)

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
				<Select
					value={state.notifications}
					options={notificationOptions}
					onChange={(v) => update("notifications", v as NotificationMode)}
				/>
			</SettingRow>

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
						background: "var(--accent, #6366f1)",
						color: "#fff",
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
