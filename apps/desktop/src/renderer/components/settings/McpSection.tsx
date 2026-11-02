import { useState } from "react"
import type { McpServerStatus } from "../../types/settings"
import { SectionHeader, Select } from "./shared"

interface McpSectionProps {
	mcpStatuses: McpServerStatus[]
	mcpLoading: boolean
	onReload: () => void
	onAddServer: (server: {
		name: string
		command: string
		args: string
		scope: string
	}) => void
	onRemoveServer: (serverName: string) => void
	/** Save (empty string clears) the API key of a built-in server. */
	onSetApiKey: (serverName: string, apiKey: string) => Promise<void>
}

const inputStyle: React.CSSProperties = {
	padding: "6px 8px",
	background: "var(--bg-elevated)",
	color: "var(--text)",
	border: "1px solid var(--border)",
	borderRadius: 4,
	fontSize: 12,
	fontFamily: "inherit",
}

export function McpSection({
	mcpStatuses,
	mcpLoading,
	onReload,
	onAddServer,
	onRemoveServer,
	onSetApiKey,
}: McpSectionProps) {
	const [addingServer, setAddingServer] = useState(false)
	const [newServer, setNewServer] = useState({
		name: "",
		command: "",
		args: "",
		scope: "project",
	})
	// One draft per built-in server, kept here so typing never re-renders the list
	// from the parent and never leaks the key into app state.
	const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
	const [savingKey, setSavingKey] = useState<string | null>(null)

	const handleAdd = () => {
		if (!newServer.name || !newServer.command) return
		onAddServer(newServer)
		setNewServer({ name: "", command: "", args: "", scope: "project" })
		setAddingServer(false)
	}

	const handleSaveKey = async (serverName: string, key: string) => {
		setSavingKey(serverName)
		try {
			await onSetApiKey(serverName, key)
			setKeyDrafts((prev) => ({ ...prev, [serverName]: "" }))
		} finally {
			setSavingKey(null)
		}
	}

	return (
		<>
			<SectionHeader title="MCP Servers" />
			<div
				style={{
					fontSize: 11,
					color: "var(--muted)",
					padding: "4px 0 8px",
					lineHeight: 1.4,
				}}
			>
				External tool servers connected via Model Context Protocol.
			</div>

			{mcpLoading && (
				<div
					style={{
						padding: 16,
						textAlign: "center",
						color: "var(--muted)",
						fontSize: 12,
					}}
				>
					Loading...
				</div>
			)}

			{!mcpLoading && mcpStatuses.length === 0 && (
				<div
					style={{
						padding: "16px 0",
						color: "var(--muted)",
						fontSize: 12,
					}}
				>
					No MCP servers configured.
				</div>
			)}

			{!mcpLoading &&
				mcpStatuses.map((server) => {
					const draft = keyDrafts[server.name] ?? ""
					const saving = savingKey === server.name
					return (
						<div
							key={server.name}
							style={{
								padding: "10px 0",
								borderBottom: "1px solid var(--border-muted)",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										minWidth: 0,
									}}
								>
									<span
										style={{
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: server.connected
												? "var(--success)"
												: server.needsApiKey
													? "var(--warning)"
													: "var(--error)",
											flexShrink: 0,
										}}
									/>
									<span
										style={{
											fontSize: 13,
											fontWeight: 500,
											color: "var(--text)",
										}}
									>
										{server.title ?? server.name}
									</span>
									{server.builtin && (
										<span
											style={{
												fontSize: 9,
												fontWeight: 600,
												letterSpacing: "0.4px",
												textTransform: "uppercase",
												color: "var(--muted)",
												border: "1px solid var(--border-muted)",
												borderRadius: 4,
												padding: "0 4px",
												lineHeight: "14px",
											}}
										>
											Built-in
										</span>
									)}
									<span
										style={{
											fontSize: 10,
											color: server.needsApiKey
												? "var(--warning)"
												: "var(--muted)",
										}}
									>
										{server.connected
											? `${server.toolCount} tools`
											: server.needsApiKey
												? "Needs API key"
												: "disconnected"}
									</span>
								</div>
								{!server.builtin && (
									<button
										onClick={() => onRemoveServer(server.name)}
										style={{
											padding: "2px 8px",
											background: "transparent",
											color: "var(--muted)",
											borderRadius: 4,
											border: "1px solid var(--border-muted)",
											cursor: "pointer",
											fontSize: 10,
											flexShrink: 0,
										}}
									>
										Remove
									</button>
								)}
							</div>

							{/* Built-in: the endpoint and the one field the user owns. */}
							{server.builtin && (
								<div style={{ paddingLeft: 14, marginTop: 4 }}>
									{server.description && (
										<div
											style={{
												fontSize: 11,
												color: "var(--muted)",
												lineHeight: 1.5,
											}}
										>
											{server.description}
										</div>
									)}
									{server.url && (
										<div
											style={{
												fontSize: 10,
												color: "var(--dim)",
												fontFamily:
													"var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
												marginTop: 2,
											}}
										>
											{server.url}
										</div>
									)}
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											marginTop: 8,
											flexWrap: "wrap",
										}}
									>
										<input
											type="password"
											value={draft}
											onChange={(e) =>
												setKeyDrafts((prev) => ({
													...prev,
													[server.name]: e.target.value,
												}))
											}
											onKeyDown={(e) => {
												if (e.key === "Enter" && draft.trim() && !saving) {
													handleSaveKey(server.name, draft)
												}
											}}
											placeholder={
												server.hasApiKey
													? "•••••••• saved — paste a new key to replace"
													: "Paste your API key"
											}
											spellCheck={false}
											autoComplete="off"
											style={{ ...inputStyle, flex: 1, minWidth: 200 }}
										/>
										<button
											onClick={() => handleSaveKey(server.name, draft)}
											disabled={!draft.trim() || saving}
											style={{
												padding: "6px 14px",
												background: draft.trim()
													? "var(--accent)"
													: "var(--bg-elevated)",
												color: draft.trim()
													? "var(--on-accent)"
													: "var(--muted)",
												borderRadius: 6,
												border: "none",
												cursor: draft.trim() ? "pointer" : "default",
												fontSize: 12,
												fontWeight: 500,
												flexShrink: 0,
											}}
										>
											{saving ? "Saving…" : "Save"}
										</button>
										{server.hasApiKey && (
											<button
												onClick={() => handleSaveKey(server.name, "")}
												disabled={saving}
												style={{
													padding: "6px 10px",
													background: "transparent",
													color: "var(--muted)",
													borderRadius: 6,
													border: "1px solid var(--border-muted)",
													cursor: "pointer",
													fontSize: 11,
													flexShrink: 0,
												}}
											>
												Clear
											</button>
										)}
									</div>
									<div
										style={{
											display: "flex",
											gap: 12,
											marginTop: 6,
											fontSize: 11,
										}}
									>
										{server.apiKeyUrl && (
											<a
												href={server.apiKeyUrl}
												target="_blank"
												rel="noreferrer"
												style={{ color: "var(--accent)" }}
											>
												Get a free API key ↗
											</a>
										)}
										{server.docsUrl && (
											<a
												href={server.docsUrl}
												target="_blank"
												rel="noreferrer"
												style={{ color: "var(--muted)" }}
											>
												Docs
											</a>
										)}
									</div>
								</div>
							)}

							{server.error && (
								<div
									style={{
										fontSize: 11,
										color: "var(--error)",
										marginTop: 4,
										paddingLeft: 14,
										wordBreak: "break-word",
									}}
								>
									{server.error}
								</div>
							)}
							{server.connected && server.toolNames.length > 0 && (
								<div
									style={{
										fontSize: 10,
										color: "var(--muted)",
										marginTop: 4,
										paddingLeft: 14,
										lineHeight: 1.6,
									}}
								>
									{server.toolNames.join(", ")}
								</div>
							)}
						</div>
					)
				})}

			<div
				style={{
					paddingTop: 12,
					display: "flex",
					gap: 8,
				}}
			>
				<button
					onClick={() => setAddingServer(!addingServer)}
					style={{
						padding: "6px 12px",
						background: "var(--bg-surface)",
						color: "var(--accent)",
						borderRadius: 6,
						border: "1px solid var(--accent)",
						cursor: "pointer",
						fontSize: 11,
					}}
				>
					{addingServer ? "Cancel" : "Add server"}
				</button>
				<button
					onClick={onReload}
					style={{
						padding: "6px 12px",
						background: "var(--bg-surface)",
						color: "var(--muted)",
						borderRadius: 6,
						border: "1px solid var(--border)",
						cursor: "pointer",
						fontSize: 11,
					}}
				>
					Reload all
				</button>
			</div>

			{addingServer && (
				<div
					style={{
						marginTop: 12,
						padding: 12,
						background: "var(--bg-surface)",
						borderRadius: 8,
						border: "1px solid var(--border-muted)",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 8,
						}}
					>
						<input
							value={newServer.name}
							onChange={(e) =>
								setNewServer((p) => ({
									...p,
									name: e.target.value,
								}))
							}
							placeholder="Server name"
							style={inputStyle}
						/>
						<input
							value={newServer.command}
							onChange={(e) =>
								setNewServer((p) => ({
									...p,
									command: e.target.value,
								}))
							}
							placeholder="Command (e.g., npx)"
							style={inputStyle}
						/>
						<input
							value={newServer.args}
							onChange={(e) =>
								setNewServer((p) => ({
									...p,
									args: e.target.value,
								}))
							}
							placeholder="Arguments (space-separated)"
							style={inputStyle}
						/>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
							}}
						>
							<Select
								value={newServer.scope}
								options={[
									{
										value: "project",
										label: "Project",
									},
									{
										value: "global",
										label: "Global",
									},
								]}
								onChange={(v) =>
									setNewServer((p) => ({
										...p,
										scope: v,
									}))
								}
							/>
							<button
								onClick={handleAdd}
								disabled={!newServer.name || !newServer.command}
								style={{
									padding: "6px 16px",
									background:
										newServer.name && newServer.command
											? "var(--accent)"
											: "var(--bg-elevated)",
									color:
										newServer.name && newServer.command
											? "var(--on-accent)"
											: "var(--muted)",
									borderRadius: 6,
									cursor:
										newServer.name && newServer.command ? "pointer" : "default",
									fontSize: 12,
									fontWeight: 500,
								}}
							>
								Add
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	)
}
