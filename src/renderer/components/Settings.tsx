import { useState, useEffect, useCallback } from "react"
import { type ModelInfo } from "./ModelSelector"
import type {
	NotificationMode,
	ThinkingLevel,
	SettingsState,
	McpServerStatus,
	SettingsProps,
} from "../types/settings"
import { AccountsSection } from "./settings/AccountsSection"
import { GeneralSection } from "./settings/GeneralSection"
import { McpSection } from "./settings/McpSection"
import { ModelsSection } from "./settings/ModelsSection"
import { AgentSection } from "./settings/AgentSection"
import { GitSection } from "./settings/GitSection"
import { MemorySection } from "./settings/MemorySection"
import { DeveloperSection } from "./settings/DeveloperSection"

export function Settings({
	isOpen = true,
	onClose,
	loggedInProviders,
	onLogin,
	onApiKey,
	onLogout,
	initialSection,
	onSectionChange,
}: SettingsProps) {
	if (!isOpen) return null
	const [state, setState] = useState<SettingsState | null>(null)
	const [models, setModels] = useState<ModelInfo[]>([])
	const [activeSection, setActiveSectionRaw] = useState(
		initialSection || "general",
	)
	const setActiveSection = useCallback(
		(s: string) => {
			setActiveSectionRaw(s)
			onSectionChange?.(s)
		},
		[onSectionChange],
	)

	// Sync when initialSection changes externally (e.g. sidebar "Manage accounts" click)
	useEffect(() => {
		if (initialSection) setActiveSectionRaw(initialSection)
	}, [initialSection])
	const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([])
	const [mcpLoading, setMcpLoading] = useState(false)

	// Load current state
	useEffect(() => {
		async function load() {
			const [s, m] = await Promise.all([
				window.api.invoke({ type: "getState" }),
				window.api.invoke({ type: "getAvailableModels" }),
			])
			const st = s as Record<string, unknown>
			setState({
				theme:
					(st?.theme as "light" | "dark" | "system") ??
					((typeof localStorage !== "undefined" &&
						localStorage.getItem("myagent-theme")) as
						| "light"
						| "dark"
						| "system") ??
					"light",
				notifications: (st?.notifications as NotificationMode) ?? "off",
				smartEditing: (st?.smartEditing as boolean) ?? true,
				thinkingLevel: (st?.thinkingLevel as ThinkingLevel) ?? "off",
				observerModelId:
					(st?.observerModelId as string) ||
					(st?.currentModelId as string) ||
					"",
				reflectorModelId:
					(st?.reflectorModelId as string) ||
					(st?.currentModelId as string) ||
					"",
				observationThreshold: (st?.observationThreshold as number) ?? 30000,
				reflectionThreshold: (st?.reflectionThreshold as number) ?? 40000,
				prInstructions: (st?.prInstructions as string) ?? "",
				defaultClonePath: (st?.defaultClonePath as string) ?? "",
			})
			if (Array.isArray(m)) setModels(m as ModelInfo[])
		}
		load()
	}, [])

	// Load MCP statuses when that section is active
	useEffect(() => {
		if (activeSection !== "mcp") return
		async function load() {
			setMcpLoading(true)
			try {
				const statuses = await window.api.invoke({ type: "getMcpStatuses" })
				setMcpStatuses((statuses as McpServerStatus[]) ?? [])
			} catch {
				// ignore
			} finally {
				setMcpLoading(false)
			}
		}
		load()
	}, [activeSection])

	// Persist a setting change
	const update = useCallback(
		async (key: keyof SettingsState, value: unknown) => {
			setState((prev) => (prev ? { ...prev, [key]: value } : prev))
			switch (key) {
				case "thinkingLevel":
					await window.api.invoke({ type: "setThinkingLevel", level: value })
					break
				case "notifications":
					await window.api.invoke({ type: "setNotifications", mode: value })
					break
				case "smartEditing":
					await window.api.invoke({ type: "setSmartEditing", enabled: value })
					break
				case "observerModelId":
					await window.api.invoke({ type: "setObserverModel", modelId: value })
					break
				case "reflectorModelId":
					await window.api.invoke({
						type: "setReflectorModel",
						modelId: value,
					})
					break
				case "theme": {
					await window.api.invoke({
						type: "setState",
						patch: { theme: value },
					})
					if (typeof localStorage !== "undefined") {
						localStorage.setItem("myagent-theme", value as string)
					}
					const effective =
						value === "system"
							? window.matchMedia("(prefers-color-scheme: dark)").matches
								? "dark"
								: "light"
							: (value as string)
					document.documentElement.setAttribute("data-theme", effective)
					break
				}
				default:
					await window.api.invoke({
						type: "setState",
						patch: { [key]: value },
					})
			}
		},
		[],
	)

	const handleReloadMcp = useCallback(async () => {
		setMcpLoading(true)
		try {
			const statuses = await window.api.invoke({ type: "reloadMcp" })
			setMcpStatuses((statuses as McpServerStatus[]) ?? [])
		} catch {
			// ignore
		} finally {
			setMcpLoading(false)
		}
	}, [])

	const handleAddServer = useCallback(
		async (server: {
			name: string
			command: string
			args: string
			scope: string
		}) => {
			if (!server.name || !server.command) return
			setMcpLoading(true)
			try {
				const statuses = await window.api.invoke({
					type: "addMcpServer",
					serverName: server.name,
					serverCommand: server.command,
					serverArgs: server.args
						? server.args.split(/\s+/).filter(Boolean)
						: [],
					scope: server.scope,
				})
				setMcpStatuses((statuses as McpServerStatus[]) ?? [])
			} catch {
				// ignore
			} finally {
				setMcpLoading(false)
			}
		},
		[],
	)

	const handleRemoveServer = useCallback(async (serverName: string) => {
		setMcpLoading(true)
		try {
			const statuses = await window.api.invoke({
				type: "removeMcpServer",
				serverName,
			})
			setMcpStatuses((statuses as McpServerStatus[]) ?? [])
		} catch {
			// ignore
		} finally {
			setMcpLoading(false)
		}
	}, [])

	/**
	 * Saving a key for a built-in server reconnects it, so the status list comes
	 * back fresh — the row should turn green (and list tools) without a reload.
	 * `mcpLoading` stays untouched here: blanking the whole list mid-save would
	 * hide the very row the user is editing.
	 */
	const handleSetMcpApiKey = useCallback(
		async (serverName: string, apiKey: string) => {
			try {
				const statuses = await window.api.invoke({
					type: "setMcpApiKey",
					serverName,
					apiKey,
				})
				setMcpStatuses((statuses as McpServerStatus[]) ?? [])
			} catch {
				// ignore
			}
		},
		[],
	)

	// Close on Escape (if used as closeable)
	useEffect(() => {
		if (!onClose) return
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [onClose])

	const sections = [
		{ id: "accounts", label: "Accounts" },
		{ id: "general", label: "General" },
		{ id: "mcp", label: "MCP" },
		{ id: "models", label: "Models" },
		{ id: "agent", label: "Agent" },
		{ id: "git", label: "Git" },
		{ id: "memory", label: "Memory" },
		{ id: "developer", label: "Developer" },
	]

	const modelsLoaded = models.length > 0

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				backgroundColor: "var(--scrim)",
				backdropFilter: "blur(4px)",
				zIndex: 1000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget && onClose) onClose()
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 840,
					height: "82vh",
					maxHeight: 680,
					display: "flex",
					flexDirection: "column",
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
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
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="3" />
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
							</svg>
						</div>
						<span
							style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
						>
							Settings
						</span>
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						{onClose && (
							<button
								onClick={onClose}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background: "transparent",
									border: "none",
									color: "var(--muted)",
									cursor: "pointer",
									padding: "4px",
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
						)}
					</div>
				</div>

				{/* Body */}
				<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
					{/* Nav */}
					<div
						style={{
							width: 150,
							borderRight: "1px solid var(--border-muted)",
							padding: "10px 8px",
							flexShrink: 0,
							display: "flex",
							flexDirection: "column",
							gap: 2,
							background: "var(--bg-surface)",
						}}
					>
						{sections.map((s) => (
							<button
								key={s.id}
								onClick={() => setActiveSection(s.id)}
								style={{
									display: "flex",
									alignItems: "center",
									width: "100%",
									textAlign: "left",
									padding: "8px 12px",
									fontSize: 12,
									fontWeight: activeSection === s.id ? 600 : 400,
									color:
										activeSection === s.id ? "var(--text)" : "var(--muted)",
									background:
										activeSection === s.id
											? "var(--selected-bg)"
											: "transparent",
									borderRadius: 6,
									border: "none",
									cursor: "pointer",
									transition: "all 0.15s ease",
								}}
							>
								{s.label}
							</button>
						))}
					</div>

					{/* Content */}
					<div
						style={{
							flex: 1,
							padding: "16px 28px 28px",
							overflowY: "auto",
							background: "var(--bg)",
						}}
					>
						{!state ? (
							<div
								style={{
									padding: 32,
									textAlign: "center",
									color: "var(--muted)",
									fontSize: 12,
								}}
							>
								Loading...
							</div>
						) : (
							<>
								{activeSection === "accounts" && (
									<AccountsSection
										loggedInProviders={loggedInProviders}
										onLogin={onLogin}
										onApiKey={onApiKey}
										onLogout={onLogout}
									/>
								)}

								{activeSection === "general" && (
									<GeneralSection state={state} update={update} />
								)}

								{activeSection === "mcp" && (
									<McpSection
										mcpStatuses={mcpStatuses}
										mcpLoading={mcpLoading}
										onReload={handleReloadMcp}
										onAddServer={handleAddServer}
										onRemoveServer={handleRemoveServer}
										onSetApiKey={handleSetMcpApiKey}
									/>
								)}

								{activeSection === "models" && (
									<ModelsSection state={state} update={update} />
								)}

								{activeSection === "agent" && (
									<AgentSection state={state} update={update} />
								)}

								{activeSection === "git" && (
									<GitSection
										state={state}
										setState={setState}
										update={update}
									/>
								)}

								{activeSection === "memory" && (
									<MemorySection
										state={state}
										models={models}
										modelsLoaded={modelsLoaded}
										update={update}
									/>
								)}

								{activeSection === "developer" && <DeveloperSection />}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
