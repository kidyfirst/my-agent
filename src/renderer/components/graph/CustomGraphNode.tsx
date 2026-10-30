import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { GraphNodeKind } from "../../types/ipc"

const KIND_COLORS: Record<
	string,
	{ bg: string; text: string; border: string }
> = {
	start: {
		bg: "var(--graph-node-start-bg)",
		text: "var(--graph-node-start-text)",
		border: "var(--graph-node-start-border)",
	},
	llm: {
		bg: "var(--graph-node-llm-bg)",
		text: "var(--graph-node-llm-text)",
		border: "var(--graph-node-llm-border)",
	},
	tool: {
		bg: "var(--graph-node-tool-bg)",
		text: "var(--graph-node-tool-text)",
		border: "var(--graph-node-tool-border)",
	},
	condition: {
		bg: "var(--graph-node-condition-bg)",
		text: "var(--graph-node-condition-text)",
		border: "var(--graph-node-condition-border)",
	},
	plan: {
		bg: "var(--graph-node-plan-bg)",
		text: "var(--graph-node-plan-text)",
		border: "var(--graph-node-plan-border)",
	},
	review: {
		bg: "var(--graph-node-review-bg)",
		text: "var(--graph-node-review-text)",
		border: "var(--graph-node-review-border)",
	},
	human: {
		bg: "var(--graph-node-human-bg)",
		text: "var(--graph-node-human-text)",
		border: "var(--graph-node-human-border)",
	},
	end: {
		bg: "var(--graph-node-end-bg)",
		text: "var(--graph-node-end-text)",
		border: "var(--graph-node-end-border)",
	},
}

export interface CustomNodeData {
	label: string
	description: string
	kind: GraphNodeKind
	configSummary?: string
	isRunning?: boolean
}

function CustomGraphNodeComponent({ data }: NodeProps) {
	const nodeData = data as unknown as CustomNodeData
	const kindStyle = KIND_COLORS[nodeData.kind] || KIND_COLORS.llm
	const isRunning = Boolean(nodeData.isRunning)

	return (
		<div
			style={{
				width: 270,
				padding: "10px 14px",
				borderRadius: 8,
				background: isRunning ? "var(--selected-bg)" : "var(--bg-surface)",
				border: isRunning
					? "2px solid var(--accent)"
					: "1px solid var(--border)",
				boxShadow: isRunning
					? "0 0 16px var(--accent)"
					: "var(--shadow-popover)",
				color: "var(--text)",
				fontFamily: "inherit",
				fontSize: 12,
				transition: "all 0.2s ease",
			}}
		>
			{/* Top Handle (Incoming forward flow) */}
			<Handle
				type="target"
				id="top"
				position={Position.Top}
				isConnectable={false}
				style={{
					background: kindStyle.border,
					width: 8,
					height: 8,
					border: "2px solid var(--bg-surface)",
				}}
			/>

			{/* Left Handles (Bypass routing) */}
			<Handle
				type="target"
				id="left-target"
				position={Position.Left}
				isConnectable={false}
				style={{
					top: "40%",
					background: kindStyle.border,
					width: 8,
					height: 8,
					border: "2px solid var(--bg-surface)",
				}}
			/>
			<Handle
				type="source"
				id="left-source"
				position={Position.Left}
				isConnectable={false}
				style={{
					top: "60%",
					background: kindStyle.border,
					width: 8,
					height: 8,
					border: "2px solid var(--bg-surface)",
				}}
			/>

			{/* Right Handles (Loopback routing) */}
			<Handle
				type="target"
				id="right-target"
				position={Position.Right}
				isConnectable={false}
				style={{
					top: "40%",
					background: "var(--graph-edge-loop)",
					width: 8,
					height: 8,
					border: "2px solid var(--bg-surface)",
				}}
			/>
			<Handle
				type="source"
				id="right-source"
				position={Position.Right}
				isConnectable={false}
				style={{
					top: "60%",
					background: "var(--graph-edge-loop)",
					width: 8,
					height: 8,
					border: "2px solid var(--bg-surface)",
				}}
			/>

			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 4,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<span
						style={{
							fontSize: 9,
							textTransform: "uppercase",
							fontWeight: 700,
							padding: "1px 5px",
							borderRadius: 3,
							background: kindStyle.bg,
							color: kindStyle.text,
							border: `1px solid ${kindStyle.border}`,
						}}
					>
						{nodeData.kind}
					</span>
					<span
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: "var(--text)",
						}}
					>
						{nodeData.label}
					</span>
				</div>

				{isRunning && (
					<span
						style={{
							fontSize: 10,
							color: "var(--accent)",
							display: "inline-flex",
							alignItems: "center",
							gap: 4,
							fontWeight: 600,
						}}
					>
						<span
							style={{
								width: 5,
								height: 5,
								borderRadius: "50%",
								background: "var(--accent)",
								animation: "pulse 1.2s infinite",
							}}
						/>
						Running
					</span>
				)}
			</div>

			{/* Description */}
			<div
				style={{
					fontSize: 11,
					color: "var(--thinking-text)",
					lineHeight: 1.35,
					marginTop: 4,
				}}
			>
				{nodeData.description}
			</div>

			{/* Config summary */}
			{nodeData.configSummary && (
				<div
					style={{
						fontSize: 10,
						color: "var(--text)",
						marginTop: 6,
						padding: "2px 6px",
						background: "var(--bg-hover)",
						border: "1px solid var(--border-muted)",
						borderRadius: 3,
						display: "inline-block",
					}}
				>
					⚙️ {nodeData.configSummary}
				</div>
			)}

			{/* Bottom Handle (Outgoing forward flow) */}
			<Handle
				type="source"
				id="bottom"
				position={Position.Bottom}
				isConnectable={false}
				style={{
					background: kindStyle.border,
					width: 8,
					height: 8,
					border: "2px solid var(--bg-surface)",
				}}
			/>
		</div>
	)
}

export const CustomGraphNode = memo(CustomGraphNodeComponent)
