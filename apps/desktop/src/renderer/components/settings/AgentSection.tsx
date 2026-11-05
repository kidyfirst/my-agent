import type { SettingsState } from "../../types/settings"
import { SettingRow, Toggle, SectionHeader } from "./shared"

interface AgentSectionProps {
	state: SettingsState
	update: (key: keyof SettingsState, value: unknown) => void
}

export function AgentSection({ state, update }: AgentSectionProps) {
	return (
		<>
			<SectionHeader title="Editing" />
			<SettingRow
				label="Smart editing"
				description="Use LSP-based intelligent edits when available"
			>
				<Toggle
					checked={state.smartEditing}
					onChange={(v) => update("smartEditing", v)}
				/>
			</SettingRow>

			<SectionHeader title="Browser control" />
			<SettingRow
				label="Webpage operations"
				description="Let the agent open and operate webpages in a headless Chromium browser (navigate-browser / computer). The agent reads a text snapshot of each page, so no vision model is required. Every action still follows your approval rules."
			>
				<Toggle
					checked={state.browserToolsEnabled}
					onChange={(v) => update("browserToolsEnabled", v)}
				/>
			</SettingRow>
		</>
	)
}
