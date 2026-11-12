import { useState, useEffect, useMemo } from "react"
import { ReactFlow, Background, Controls, type NodeTypes } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import {
	ExecutionMode,
	DEFAULT_EXECUTION_MODE,
	type GraphTopologyMetadata,
} from "../../types/ipc"
import { CustomGraphNode } from "./CustomGraphNode"
import { buildFlowElements } from "./graphLayout"

function matchMode(a?: string | null, b?: string | null): boolean {
	if (!a || !b) return false
	if (a === b) return true
	if (
		(a === ExecutionMode.REACT || a === "build") &&
		(b === ExecutionMode.REACT || b === "build")
	)
		return true
	if (
		(a === ExecutionMode.FAST || a === "chat") &&
		(b === ExecutionMode.FAST || b === "chat")
	)
		return true
	return false
}

interface GraphViewerModalProps {
	isOpen: boolean
	currentModeId: string
	isAgentActive?: boolean
	activeGraphNode?: { nodeId: string; nodeLabel: string; modeId: string } | null
	onClose: () => void
	onSelectMode: (modeId: string) => void
}

const nodeTypes: NodeTypes = {
	custom: CustomGraphNode,
}

export function GraphViewerModal({
	isOpen,
	currentModeId,
	isAgentActive,
	activeGraphNode,
	onClose,
	onSelectMode,
}: GraphViewerModalProps) {
	const [selectedModeId, setSelectedModeId] = useState(
		currentModeId || DEFAULT_EXECUTION_MODE,
	)
	const [topologies, setTopologies] = useState<GraphTopologyMetadata[]>([])
	const [loading, setLoading] = useState(false)

	const isBusy = Boolean(isAgentActive || activeGraphNode)

	useEffect(() => {
		setSelectedModeId(currentModeId || DEFAULT_EXECUTION_MODE)
	}, [currentModeId])

	const handleModeClick = (targetModeId: string) => {
		if (isBusy) return
		setSelectedModeId(targetModeId)
		onSelectMode(targetModeId)
	}

	// Fetch available topologies from IPC
	useEffect(() => {
		if (!isOpen) return
		let isMounted = true
		setLoading(true)

		window.api
			.invoke({ type: "listExecutionModes" })
			.then((res: any) => {
				if (!isMounted) return
				if (Array.isArray(res) && res.length > 0) {
					setTopologies(res)
				} else {
					window.api.invoke({ type: "getModes" }).then((modesRes: any) => {
						if (!isMounted) return
						if (Array.isArray(modesRes)) {
							const extracted = modesRes
								.map((m: any) => m.topology)
								.filter(Boolean)
							if (extracted.length > 0) {
								setTopologies(extracted)
							}
						}
					})
				}
			})
			.finally(() => {
				if (isMounted) setLoading(false)
			})

		return () => {
			isMounted = false
		}
	}, [isOpen])

	// Close on Escape key
	useEffect(() => {
		if (!isOpen) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose()
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [isOpen, onClose])

	// Strict deduplication of modes by modeName / modeId to prevent duplicate tab buttons
	const uniqueTopologies = useMemo(() => {
		const seenNames = new Set<string>()
		const result: GraphTopologyMetadata[] = []
		for (const t of topologies) {
			const key = t.modeName || t.modeId
			if (!seenNames.has(key)) {
				seenNames.add(key)
				result.push(t)
			}
		}
		return result
	}, [topologies])

	const currentTopology = useMemo(() => {
		return (
			uniqueTopologies.find((t) => matchMode(t.modeId, selectedModeId)) ||
			uniqueTopologies[0]
		)
	}, [uniqueTopologies, selectedModeId])

	// Build @xyflow/react nodes & edges for current topology
	const { flowNodes, flowEdges } = useMemo(() => {
		if (!currentTopology) return { flowNodes: [], flowEdges: [] }
		const activeId =
			activeGraphNode &&
			matchMode(activeGraphNode.modeId, currentTopology.modeId)
				? activeGraphNode.nodeId
				: null
		const { nodes, edges } = buildFlowElements(currentTopology, activeId)
		return { flowNodes: nodes, flowEdges: edges }
	}, [currentTopology, activeGraphNode])

	if (!isOpen) return null

	const isCurrentlyActiveMode = matchMode(currentModeId, selectedModeId)

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				backgroundColor: "var(--scrim)",
				backdropFilter: "blur(6px)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 9999,
				padding: 24,
			}}
			onClick={onClose}
		>
			<div
				style={{
					backgroundColor: "var(--bg)",
					border: "1px solid var(--border)",
					borderRadius: 14,
					width: "100%",
					maxWidth: 960,
					height: "85vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: "var(--shadow-modal)",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Top Header */}
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
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
								⚡
							</div>
							<span
								style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
							>
								Execution Modes
							</span>
						</div>

						{/* Subtle divider */}
						<div
							style={{
								width: 1,
								height: 16,
								background: "var(--border-muted)",
							}}
						/>

						{/* Mode Selector Tabs */}
						<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
							{uniqueTopologies.map((t) => {
								const isSelected = matchMode(t.modeId, selectedModeId)
								const isCurrent = matchMode(t.modeId, currentModeId)
								const isOtherDisabled = isBusy && !isCurrent

								return (
									<button
										key={t.modeId}
										onClick={() => handleModeClick(t.modeId)}
										disabled={isOtherDisabled}
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 5,
											padding: "3px 10px",
											borderRadius: 5,
											fontSize: 11,
											fontWeight: isCurrent ? 600 : 500,
											cursor: isOtherDisabled ? "not-allowed" : "pointer",
											border: isCurrent
												? isBusy
													? "1px solid var(--error)"
													: "1px solid var(--accent)"
												: "1px solid var(--border-muted)",
											background: isCurrent
												? isBusy
													? "var(--error-bg)"
													: "var(--accent)"
												: "var(--bg-elevated)",
											color: isOtherDisabled
												? "var(--muted)"
												: isCurrent
													? isBusy
														? "var(--error)"
														: "var(--on-accent)"
													: "var(--text)",
											boxShadow: isCurrent
												? "0 2px 6px color-mix(in srgb, var(--accent) 25%, transparent)"
												: "none",
											opacity: isOtherDisabled ? 0.35 : 1,
											transition: "all 0.15s ease",
										}}
										title={
											isBusy
												? isCurrent
													? "Current mode running a task"
													: "Cannot switch mode while a task is running"
												: `Click to switch to ${t.modeName}`
										}
									>
										<span>{t.modeName}</span>
										{isCurrent && (
											<span
												style={{
													width: 5,
													height: 5,
													borderRadius: "50%",
													background: isBusy
														? "var(--error)"
														: "var(--on-accent)",
													animation: isBusy ? "pulse 1.2s infinite" : "none",
												}}
												title={
													isBusy ? "Running task in this mode" : "Active mode"
												}
											/>
										)}
									</button>
								)
							})}
						</div>
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						{isBusy && (
							<div
								style={{
									fontSize: 11,
									color: "var(--error)",
									display: "inline-flex",
									alignItems: "center",
									gap: 5,
									fontWeight: 500,
								}}
							>
								<span
									style={{
										width: 5,
										height: 5,
										borderRadius: "50%",
										background: "var(--error)",
										animation: "pulse 1.2s infinite",
									}}
								/>
								<span>Task running — mode locked</span>
							</div>
						)}
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

				{/* Description bar */}
				{currentTopology && (
					<div
						style={{
							padding: "7px 16px",
							background: "var(--bg-surface)",
							borderBottom: "1px solid var(--border-muted)",
							display: "flex",
							alignItems: "flex-start",
							gap: 10,
							flexShrink: 0,
						}}
					>
						<span
							style={{
								fontSize: 10,
								lineHeight: "16px",
								padding: "0 6px",
								borderRadius: 4,
								background: "var(--selected-bg)",
								color: "var(--accent)",
								border: "1px solid var(--border-accent)",
								fontWeight: 600,
								flexShrink: 0,
								letterSpacing: "0.2px",
								whiteSpace: "nowrap",
							}}
						>
							Best for
						</span>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								fontSize: 12,
								color: "var(--text)",
								fontWeight: 400,
								lineHeight: 1.5,
								whiteSpace: "normal",
								overflowWrap: "anywhere",
							}}
						>
							{currentTopology.description}
						</div>
					</div>
				)}

				{/* @xyflow/react Canvas */}
				<div style={{ flex: 1, position: "relative", minHeight: 0 }}>
					{loading && uniqueTopologies.length === 0 ? (
						<div
							style={{
								height: "100%",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--muted)",
								fontSize: 13,
							}}
						>
							Loading LangGraph topologies...
						</div>
					) : (
						<ReactFlow
							key={selectedModeId}
							nodes={flowNodes}
							edges={flowEdges}
							nodeTypes={nodeTypes}
							fitView
							fitViewOptions={{ padding: 0.28 }}
							nodesDraggable={true}
							nodesConnectable={false}
							elementsSelectable={false}
							proOptions={{ hideAttribution: true }}
							style={{ background: "var(--bg)" }}
						>
							<Background color="var(--border)" gap={24} size={1} />
							<Controls showInteractive={false} position="bottom-right" />
						</ReactFlow>
					)}
				</div>
			</div>
		</div>
	)
}
