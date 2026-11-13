import { useState, useEffect } from "react"
import type { SettingsState } from "../../types/settings"
import { ModelPickerInline, type ModelInfo } from "../ModelSelector"
import { SettingRow, SectionHeader } from "./shared"

interface LibrarySectionProps {
	state: SettingsState
	models: ModelInfo[]
	modelsLoaded: boolean
	update: (key: keyof SettingsState, value: unknown) => void
}

export function LibrarySection({
	state,
	models,
	modelsLoaded,
	update,
}: LibrarySectionProps) {
	const [status, setStatus] = useState<{ totalImages: number; indexedImages: number } | null>(null)
	const [isIndexing, setIsIndexing] = useState(false)
	const [indexMessage, setIndexMessage] = useState("")

	const loadStatus = async () => {
		try {
			const res = (await window.api.invoke({
				type: "getLibraryImageIndexStatus",
			})) as { totalImages: number; indexedImages: number }
			if (res) setStatus(res)
		} catch {
			// ignore
		}
	}

	useEffect(() => {
		loadStatus()
	}, [])

	const handleIndexImages = async () => {
		setIsIndexing(true)
		setIndexMessage("Analyzing images with vision model...")
		try {
			const res = (await window.api.invoke({
				type: "indexLibraryImages",
			})) as { total: number; processed: number; errors: number }
			if (res) {
				setIndexMessage(`Done! Indexed ${res.processed} images (${res.errors} errors).`)
				await loadStatus()
			}
		} catch (err: any) {
			setIndexMessage(`Error: ${err?.message || "Failed to index images"}`)
		} finally {
			setIsIndexing(false)
		}
	}

	return (
		<>
			<SectionHeader title="Library & SAG" />
			<SettingRow
				label="Relevance judge model"
				description="Model used by SAG and Library to evaluate search relevance and match degree (Default: DeepSeek)"
			>
				<ModelPickerInline
					currentModelId={state.libraryJudgeModelId || "deepseek/deepseek-flash"}
					models={models}
					loading={!modelsLoaded}
					onSelect={(v) => update("libraryJudgeModelId", v)}
				/>
			</SettingRow>
			<SettingRow
				label="Image processing model"
				description="Vision model used to extract text (OCR) and index images for library search (Default: DeepSeek)"
			>
				<ModelPickerInline
					currentModelId={state.imageProcessModelId || ""}
					models={models}
					loading={!modelsLoaded}
					onSelect={(v) => update("imageProcessModelId", v)}
				/>
			</SettingRow>

			<SectionHeader title="Image OCR & Analysis Status" />
			<SettingRow
				label="Indexed images"
				description={
					status
						? `${status.indexedImages} of ${status.totalImages} images analyzed and indexed`
						: "Loading status..."
				}
			>
				<button
					onClick={handleIndexImages}
					disabled={isIndexing || (status?.totalImages ?? 0) === 0}
					style={{
						padding: "6px 14px",
						borderRadius: 6,
						border: "1px solid var(--border)",
						backgroundColor: "var(--bg-elevated)",
						color: "var(--text)",
						cursor: isIndexing ? "not-allowed" : "pointer",
						fontSize: 12,
						fontWeight: 500,
						opacity: isIndexing ? 0.6 : 1,
					}}
				>
					{isIndexing ? "Analyzing..." : "Index images now"}
				</button>
			</SettingRow>
			{indexMessage && (
				<div
					style={{
						fontSize: 11,
						color: "var(--dim)",
						marginTop: 6,
					}}
				>
					{indexMessage}
				</div>
			)}
		</>
	)
}
