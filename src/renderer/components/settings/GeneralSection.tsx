import type { SettingsState, NotificationMode } from "../../types/settings"
import { SettingRow, Select, SectionHeader } from "./shared"
import { notificationOptions } from "./constants"

interface GeneralSectionProps {
	state: SettingsState
	update: (key: keyof SettingsState, value: unknown) => void
}

export function GeneralSection({ state, update }: GeneralSectionProps) {
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
		</>
	)
}
