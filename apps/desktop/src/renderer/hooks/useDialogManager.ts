import { useState, useCallback } from "react"

interface PendingApproval {
	threadId?: string
	toolCallId: string
	toolName: string
	args: unknown
	category: string | null
	categoryLabel: string | null
}

interface PendingQuestion {
	questionId: string
	question: string
	options?: Array<{ label: string; description?: string }>
}

interface PendingPlan {
	planId: string
	title: string
	plan: string
}

export type DialogManager = ReturnType<typeof useDialogManager>

export function useDialogManager() {
	const [pendingApproval, setPendingApproval] =
		useState<PendingApproval | null>(null)
	const [pendingQuestion, setPendingQuestion] =
		useState<PendingQuestion | null>(null)
	const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
	const [showModelSelector, setShowModelSelector] = useState(false)
	const [showCommandPalette, setShowCommandPalette] = useState(false)
	const [showQuickFileOpen, setShowQuickFileOpen] = useState(false)
	const [showGraphViewer, setShowGraphViewer] = useState(false)
	const [showSettings, setShowSettings] = useState(false)
	const [showAgents, setShowAgents] = useState(false)
	const [showLogConsole, setShowLogConsole] = useState(false)
	const [settingsSection, setSettingsSection] = useState<string | undefined>(
		undefined,
	)
	const [activeGraphNode, setActiveGraphNode] = useState<{
		nodeId: string
		nodeLabel: string
		modeId: string
	} | null>(null)

	const handleRespondToApproval = useCallback(
		async (options: {
			decision: "approve" | "decline"
			scope?: "once" | "conversation" | "project" | "global"
			toolCallId?: string
			threadId?: string
			toolName?: string
			category?: string | null
			args?: unknown
			reason?: string
		}) => {
			const toolCallId = options.toolCallId || pendingApproval?.toolCallId
			const threadId = options.threadId || pendingApproval?.threadId
			if (!toolCallId) return
			await window.api.invoke({
				type: "respondToToolApproval",
				decision: options.decision,
				scope: options.scope ?? "once",
				toolCallId,
				threadId,
				toolName: options.toolName || pendingApproval?.toolName,
				category:
					options.category !== undefined
						? options.category
						: pendingApproval?.category,
				args: options.args !== undefined ? options.args : pendingApproval?.args,
				...(options.reason ? { reason: options.reason } : {}),
			})
			setPendingApproval((prev) => {
				if (!prev || prev.toolCallId === toolCallId) return null
				return prev
			})
		},
		[pendingApproval],
	)

	const handleApprove = useCallback(
		async (toolCallId: string, threadId?: string) => {
			await handleRespondToApproval({
				decision: "approve",
				scope: "once",
				toolCallId,
				threadId,
			})
		},
		[handleRespondToApproval],
	)

	const handleDecline = useCallback(
		async (toolCallId: string, threadId?: string) => {
			await handleRespondToApproval({
				decision: "decline",
				scope: "once",
				toolCallId,
				threadId,
			})
		},
		[handleRespondToApproval],
	)

	const handleAlwaysAllow = useCallback(
		async (toolCallId: string, category: string, threadId?: string) => {
			await handleRespondToApproval({
				decision: "approve",
				scope: "project",
				toolCallId,
				category,
				threadId,
			})
		},
		[handleRespondToApproval],
	)

	const handleQuestionResponse = useCallback(
		async (questionId: string, answer: string) => {
			await window.api.invoke({
				type: "respondToQuestion",
				questionId,
				answer,
			})
			setPendingQuestion(null)
		},
		[],
	)

	const handlePlanResponse = useCallback(
		async (
			planId: string,
			response: { action: "approved" | "rejected"; feedback?: string },
		) => {
			await window.api.invoke({
				type: "respondToPlanApproval",
				planId,
				response,
			})
			setPendingPlan(null)
		},
		[],
	)

	const handleSwitchModel = useCallback(async (newModelId: string) => {
		await window.api.invoke({
			type: "switchModel",
			modelId: newModelId,
			scope: "global",
		})
		setShowModelSelector(false)
	}, [])

	const handleOpenModelSelector = useCallback(() => {
		setShowModelSelector(true)
	}, [])

	const handleOpenGraphViewer = useCallback(() => {
		setShowGraphViewer(true)
	}, [])

	const handleCloseGraphViewer = useCallback(() => {
		setShowGraphViewer(false)
	}, [])

	const handleOpenSettings = useCallback((section?: string) => {
		if (section) setSettingsSection(section)
		setShowSettings(true)
	}, [])

	const handleCloseSettings = useCallback(() => {
		setShowSettings(false)
	}, [])

	const handleToggleSettings = useCallback((section?: string) => {
		setShowSettings((prev) => {
			if (!prev && section) setSettingsSection(section)
			return !prev
		})
	}, [])

	const handleOpenAgents = useCallback(() => {
		setShowAgents(true)
	}, [])

	const handleCloseAgents = useCallback(() => {
		setShowAgents(false)
	}, [])

	const handleToggleAgents = useCallback(() => {
		setShowAgents((prev) => !prev)
	}, [])

	const handleOpenLogConsole = useCallback(() => {
		setShowLogConsole(true)
	}, [])

	const handleCloseLogConsole = useCallback(() => {
		setShowLogConsole(false)
	}, [])

	const handleToggleLogConsole = useCallback(() => {
		setShowLogConsole((prev) => !prev)
	}, [])

	return {
		pendingApproval,
		setPendingApproval,
		pendingQuestion,
		setPendingQuestion,
		pendingPlan,
		setPendingPlan,
		showModelSelector,
		setShowModelSelector,
		showCommandPalette,
		setShowCommandPalette,
		showQuickFileOpen,
		setShowQuickFileOpen,
		showGraphViewer,
		setShowGraphViewer,
		showSettings,
		setShowSettings,
		showAgents,
		setShowAgents,
		handleOpenAgents,
		handleCloseAgents,
		handleToggleAgents,
		showLogConsole,
		setShowLogConsole,
		handleOpenLogConsole,
		handleCloseLogConsole,
		handleToggleLogConsole,
		settingsSection,
		setSettingsSection,
		handleOpenSettings,
		handleCloseSettings,
		handleToggleSettings,
		activeGraphNode,
		setActiveGraphNode,
		handleOpenGraphViewer,
		handleCloseGraphViewer,
		handleRespondToApproval,
		handleApprove,
		handleDecline,
		handleAlwaysAllow,
		handleQuestionResponse,
		handlePlanResponse,
		handleSwitchModel,
		handleOpenModelSelector,
	}
}
