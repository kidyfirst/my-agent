import { useState, useEffect } from "react"
import { DiffView } from "./DiffView"
import { OpenInDropdown } from "./OpenInDropdown"

interface DiffEditorProps {
	filePath: string
	/** Project root: the "Open in..." menu hands it to Finder/VS Code/Cursor. */
	projectPath?: string | null
}

export function DiffEditor({ filePath, projectPath }: DiffEditorProps) {
	const [diff, setDiff] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [viewMode, setViewMode] = useState<"inline" | "side-by-side">("inline")

	useEffect(() => {
		if (!filePath) return
		setLoading(true)
		setError(null)
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "gitDiff",
					file: filePath,
				})) as { diff: string }
				setDiff(result.diff || "")
			} catch (err: unknown) {
				setError(err instanceof Error ? err.message : "Failed to load diff")
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [filePath])

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			{/* Toolbar header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 16px",
					background: "var(--bg-surface)",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
					justifyContent: "flex-end",
				}}
			>
				<button
					onClick={() =>
						setViewMode(viewMode === "inline" ? "side-by-side" : "inline")
					}
					style={{
						fontSize: 11,
						color: "var(--muted)",
						cursor: "pointer",
						padding: "2px 8px",
						borderRadius: 3,
						border: "1px solid var(--border)",
						background: "transparent",
						fontWeight: 500,
					}}
					title={
						viewMode === "inline"
							? "Switch to side-by-side"
							: "Switch to inline"
					}
				>
					{viewMode === "inline" ? "Side-by-Side" : "Inline"}
				</button>
				{/* Hand the project (not the diff) to an external editor: viewing a
				    change is the moment you want to jump into the real file. */}
				<OpenInDropdown projectPath={projectPath ?? null} />
			</div>

			{loading && (
				<div
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--dim)",
						fontSize: 12,
					}}
				>
					Loading diff...
				</div>
			)}
			{error && (
				<div
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--error)",
						fontSize: 12,
					}}
				>
					{error}
				</div>
			)}
			{diff !== null && !loading && (
				<div
					style={{
						flex: 1,
						overflow: "auto",
						background: "var(--bg)",
					}}
				>
					<DiffView diff={diff} fileName={filePath} viewMode={viewMode} />
				</div>
			)}
		</div>
	)
}
