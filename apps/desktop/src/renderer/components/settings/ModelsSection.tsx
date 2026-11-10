import type { SettingsState, ThinkingLevel } from "../../types/settings"
import { ModelPickerInline, type ModelInfo } from "../ModelSelector"
import { SettingRow, Select, SectionHeader } from "./shared"
import { thinkingOptions } from "./constants"

interface ModelsSectionProps {
	state: SettingsState
	models?: ModelInfo[]
	modelsLoaded?: boolean
	update: (key: keyof SettingsState, value: unknown) => void
}

export function ModelsSection({
	state,
	models = [],
	modelsLoaded = true,
	update,
}: ModelsSectionProps) {
	return (
		<>
			<SectionHeader title="Thinking" />
			<SettingRow
				label="Extended thinking"
				description="Budget for chain-of-thought reasoning (Anthropic models)"
			>
				<Select
					value={state.thinkingLevel}
					options={thinkingOptions}
					onChange={(v) => update("thinkingLevel", v as ThinkingLevel)}
				/>
			</SettingRow>

			<SectionHeader title="Library & Vision Models" />
			<SettingRow
				label="Relevance judge model"
				description="Model used by SAG and Library to evaluate search relevance and match degree"
			>
				<ModelPickerInline
					currentModelId={
						state.libraryJudgeModelId || state.observerModelId || ""
					}
					models={models}
					loading={!modelsLoaded}
					onSelect={(v) => update("libraryJudgeModelId", v)}
				/>
			</SettingRow>
			<SettingRow
				label="Image processing model"
				description="Vision model used to extract text (OCR) and index images for library search"
			>
				<ModelPickerInline
					currentModelId={
						state.imageProcessModelId || state.observerModelId || ""
					}
					models={models}
					loading={!modelsLoaded}
					onSelect={(v) => update("imageProcessModelId", v)}
				/>
			</SettingRow>

			<div
				style={{
					fontSize: 11,
					color: "var(--dim)",
					padding: "12px 0",
					lineHeight: 1.5,
				}}
			>
				Use the model selector in the status bar to change the active model and
				mode.
			</div>
		</>
	)
}
