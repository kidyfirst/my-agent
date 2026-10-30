import { useState, useEffect, useRef, useCallback } from "react"

export interface ModelInfo {
	id: string
	name: string
	provider: string
	hasAuth: boolean
}

// ─── Shared model list ──────────────────────────────────────────────────────

export interface ModelListProps {
	models: ModelInfo[]
	loading: boolean
	currentModelId: string
	filter: string
	onSelect: (modelId: string) => void
	onlyConnected?: boolean
}

export function ModelList({
	models,
	loading,
	currentModelId,
	filter,
	onSelect,
	onlyConnected,
}: ModelListProps) {
	const baseModels = (onlyConnected ? models.filter((m) => m.hasAuth) : models)
		.filter((m) => {
			const idLower = m.id.toLowerCase()
			const isDeepSeek =
				m.provider === "deepseek" || idLower.includes("deepseek")
			if (isDeepSeek) {
				return (
					idLower === "deepseek/deepseek-flash" ||
					idLower === "deepseek/deepseek-v4-pro" ||
					idLower === "deepseek-flash" ||
					idLower === "deepseek-v4-pro"
				)
			}
			return true
		})
		.map((m) => {
			const idLower = m.id.toLowerCase()
			if (
				idLower === "deepseek/deepseek-flash" ||
				idLower === "deepseek-flash"
			) {
				return { ...m, name: "deepseek-flash" }
			}
			if (
				idLower === "deepseek/deepseek-v4-pro" ||
				idLower === "deepseek-v4-pro"
			) {
				return { ...m, name: "deepseek-v4-pro" }
			}
			return m
		})
	const filtered = baseModels.filter((m) =>
		m.id.toLowerCase().includes(filter.toLowerCase()),
	)

	// Group by provider
	const grouped = filtered.reduce(
		(acc, m) => {
			const provider = m.provider || m.id.split("/")[0] || "other"
			if (!acc[provider]) acc[provider] = []
			acc[provider].push(m)
			return acc
		},
		{} as Record<string, ModelInfo[]>,
	)

	// Derive per-provider auth status
	const providerAuth: Record<string, boolean> = {}
	for (const [provider, providerModels] of Object.entries(grouped)) {
		providerAuth[provider] = providerModels.some((m) => m.hasAuth)
	}

	if (loading) {
		return (
			<div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
				Loading models...
			</div>
		)
	}

	if (filtered.length === 0) {
		return (
			<div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
				No models found
			</div>
		)
	}

	return (
		<>
			{Object.entries(grouped)
				.sort(([a], [b]) => {
					const aAuth = providerAuth[a] ? 1 : 0
					const bAuth = providerAuth[b] ? 1 : 0
					if (aAuth !== bAuth) return bAuth - aAuth
					return a.localeCompare(b)
				})
				.map(([provider, providerModels]) => (
					<div key={provider}>
						<div
							style={{
								padding: "8px 8px 4px",
								fontSize: 10,
								color: "var(--muted)",
								textTransform: "uppercase",
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{provider}
							{providerAuth[provider] ? (
								<span
									style={{
										background:
											"color-mix(in srgb, var(--success) 13%, transparent)",
										color: "var(--success)",
										padding: "0px 6px",
										borderRadius: 3,
										fontWeight: 500,
										fontSize: 9,
										textTransform: "none",
										border:
											"1px solid color-mix(in srgb, var(--success) 27%, transparent)",
									}}
								>
									Connected
								</span>
							) : (
								<span
									style={{
										background:
											"color-mix(in srgb, var(--error) 13%, transparent)",
										color: "var(--error)",
										padding: "0px 6px",
										borderRadius: 3,
										fontWeight: 500,
										fontSize: 9,
										textTransform: "none",
										border:
											"1px solid color-mix(in srgb, var(--error) 27%, transparent)",
									}}
								>
									Not connected
								</span>
							)}
						</div>
						{providerModels.map((m) => (
							<button
								key={m.id}
								onClick={() => onSelect(m.id)}
								style={{
									display: "block",
									width: "100%",
									padding: "6px 8px",
									textAlign: "left",
									cursor: m.hasAuth ? "pointer" : "default",
									borderRadius: 4,
									background:
										m.id === currentModelId
											? "var(--accent)" + "22"
											: "transparent",
									fontSize: 12,
									color:
										m.id === currentModelId
											? "var(--accent)"
											: m.hasAuth
												? "var(--text)"
												: "var(--muted)",
									opacity: m.hasAuth ? 1 : 0.5,
									border: "none",
									fontFamily: "inherit",
								}}
							>
								{m.name || m.id.split("/").pop()}
								{!m.hasAuth && (
									<span
										style={{
											marginLeft: 6,
											fontSize: 10,
											color: "var(--muted)",
										}}
									>
										(no auth)
									</span>
								)}
							</button>
						))}
					</div>
				))}
		</>
	)
}

// ─── Hook to load models ────────────────────────────────────────────────────

export function useAvailableModels() {
	const [models, setModels] = useState<ModelInfo[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "getAvailableModels",
				})) as ModelInfo[]
				setModels(result ?? [])
			} catch {
				// ignore
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [])

	return { models, loading }
}

// ─── Full-screen model selector modal ───────────────────────────────────────

interface ModelSelectorProps {
	currentModelId: string
	onSelect: (modelId: string) => void
	onClose: () => void
}

export function ModelSelector({
	currentModelId,
	onSelect,
	onClose,
}: ModelSelectorProps) {
	const { models, loading } = useAvailableModels()
	const [filter, setFilter] = useState("")
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()

		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [onClose])

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--scrim)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					background: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					padding: 0,
					width: 500,
					maxHeight: "70vh",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					boxShadow: "var(--shadow-modal)",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "8px 16px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg-surface)",
						flexShrink: 0,
						minHeight: 38,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<div
							style={{
								width: 22,
								height: 22,
								borderRadius: 5,
								background:
									"linear-gradient(135deg, var(--accent), var(--accent-2))",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--on-accent)",
								fontSize: 12,
								fontWeight: "bold",
							}}
						>
							✦
						</div>
						<span
							style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
						>
							Select Model
						</span>
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						<button
							onClick={onClose}
							style={{
								background: "transparent",
								border: "none",
								color: "var(--muted)",
								cursor: "pointer",
								padding: "4px",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 6,
								transition: "color 0.15s ease",
							}}
							title="Close (Esc)"
							onMouseEnter={(e) => {
								;(e.currentTarget as HTMLElement).style.color = "var(--text)"
							}}
							onMouseLeave={(e) => {
								;(e.currentTarget as HTMLElement).style.color = "var(--muted)"
							}}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
				</div>

				{/* Search */}
				<div
					style={{
						padding: "10px 12px",
						borderBottom: "1px solid var(--border-muted)",
						background: "var(--bg)",
					}}
				>
					<input
						ref={inputRef}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Search models..."
						style={{
							width: "100%",
							padding: "8px 12px",
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: 13,
							fontFamily: "inherit",
							outline: "none",
						}}
					/>
				</div>

				{/* Model list */}
				<div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
					<ModelList
						models={models}
						loading={loading}
						currentModelId={currentModelId}
						filter={filter}
						onSelect={onSelect}
					/>
				</div>
			</div>
		</div>
	)
}

// ─── Inline model picker (for Settings) ─────────────────────────────────────

interface ModelPickerInlineProps {
	currentModelId: string
	models: ModelInfo[]
	loading: boolean
	onSelect: (modelId: string) => void
	onlyConnected?: boolean
}

export function ModelPickerInline({
	currentModelId,
	models,
	loading,
	onSelect,
	onlyConnected = true,
}: ModelPickerInlineProps) {
	// Check if the currently selected model is authenticated
	const currentModel = models.find((m) => m.id === currentModelId)
	const isUnauth = currentModel ? !currentModel.hasAuth : false
	const [open, setOpen] = useState(false)
	const [filter, setFilter] = useState("")
	const containerRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	// Close on outside click
	useEffect(() => {
		if (!open) return
		const handler = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false)
				setFilter("")
			}
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [open])

	// Focus search when opened
	useEffect(() => {
		if (open) inputRef.current?.focus()
	}, [open])

	const handleSelect = useCallback(
		(modelId: string) => {
			onSelect(modelId)
			setOpen(false)
			setFilter("")
		},
		[onSelect],
	)

	// Display label
	const shortName = currentModelId.includes("/")
		? currentModelId.split("/").pop()
		: currentModelId || "select model"

	return (
		<div ref={containerRef} style={{ position: "relative" }}>
			<button
				onClick={() => setOpen(!open)}
				style={{
					background: isUnauth
						? "color-mix(in srgb, var(--warning) 7%, transparent)"
						: "var(--bg-elevated)",
					color: isUnauth ? "var(--warning)" : "var(--text)",
					border: isUnauth
						? "1px solid color-mix(in srgb, var(--warning) 27%, transparent)"
						: "1px solid var(--border)",
					borderRadius: 4,
					padding: "4px 8px",
					fontSize: 12,
					cursor: "pointer",
					fontFamily: "inherit",
					minWidth: 120,
					textAlign: "left",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 6,
				}}
			>
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 4,
						overflow: "hidden",
					}}
				>
					{isUnauth && (
						<span style={{ fontSize: 11, flexShrink: 0 }}>&#x26A0;</span>
					)}
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{shortName}
					</span>
				</span>
				<span style={{ color: "var(--muted)", fontSize: 10, flexShrink: 0 }}>
					{open ? "▲" : "▼"}
				</span>
			</button>
			{isUnauth && !open && (
				<div style={{ fontSize: 10, color: "var(--warning)", marginTop: 2 }}>
					Not connected — OM memory is paused
				</div>
			)}

			{open && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						marginTop: 6,
						width: 360,
						maxHeight: 320,
						background: "var(--bg)",
						border: "1px solid var(--border)",
						borderRadius: 12,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
						zIndex: 50,
						boxShadow: "var(--shadow-popover)",
					}}
				>
					{/* Search */}
					<div
						style={{
							padding: 8,
							borderBottom: "1px solid var(--border-muted)",
						}}
					>
						<input
							ref={inputRef}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Search models..."
							style={{
								width: "100%",
								padding: "6px 10px",
								background: "var(--bg-surface)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								color: "var(--text)",
								fontSize: 12,
								fontFamily: "inherit",
								outline: "none",
							}}
						/>
					</div>

					{/* List */}
					<div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
						<ModelList
							models={models}
							loading={loading}
							currentModelId={currentModelId}
							filter={filter}
							onSelect={handleSelect}
							onlyConnected={onlyConnected}
						/>
					</div>
				</div>
			)}
		</div>
	)
}
