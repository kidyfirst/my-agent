import { useEffect } from "react"
import type { EnrichedProject } from "../types/project-list"
import type { RightSidebarTab } from "../components/RightSidebar"
import type { ProjectInfo } from "../types/project"
import { hasGitRepo } from "../utils/project-list"

interface UseKeyboardShortcutsArgs {
	activeTab: string
	enrichedProjects: EnrichedProject[]
	projectInfo: ProjectInfo | null
	setShowCommandPalette: React.Dispatch<React.SetStateAction<boolean>>
	setRightSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
	setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
	setRightSidebarTab: React.Dispatch<React.SetStateAction<RightSidebarTab>>
	setActiveTab: React.Dispatch<React.SetStateAction<string>>
	setShowQuickFileOpen: React.Dispatch<React.SetStateAction<boolean>>
	/** ⌘K — hand the keyboard to the conversation search. */
	onOpenSearch?: () => void
	/** Fill the window with the right panel, or give the space back. */
	onToggleRightSidebarMaximized?: () => void
	handleOpenFolder: () => void
	handleCloseTab: (tabId: string) => void
	handleSwitchProject: (path: string) => void
	onToggleSettings?: () => void
}

export function useKeyboardShortcuts({
	activeTab,
	enrichedProjects,
	projectInfo,
	setShowCommandPalette,
	setRightSidebarVisible,
	setSidebarVisible,
	setRightSidebarTab,
	setActiveTab,
	setShowQuickFileOpen,
	handleOpenFolder,
	handleCloseTab,
	handleSwitchProject,
	onToggleSettings,
	onOpenSearch,
	onToggleRightSidebarMaximized,
}: UseKeyboardShortcutsArgs) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey
			// ⌘K — search sessions. The command palette moved to ⇧⌘P: searching
			// conversations is what people reach for this chord for.
			if (isMod && !e.shiftKey && e.key.toLowerCase() === "k") {
				e.preventDefault()
				if (onOpenSearch) onOpenSearch()
				else setShowCommandPalette((v) => !v)
				return
			}
			if (isMod && e.shiftKey && e.key.toLowerCase() === "p") {
				e.preventDefault()
				setShowCommandPalette((v) => !v)
				return
			}
			if (isMod && e.key === "`") {
				e.preventDefault()
				// Opening lands on the Overview list, same as the title-bar toggle.
				setRightSidebarTab("menu")
				setRightSidebarVisible((v) => !v)
			}
			// ⌘B / ⇧⌘B — the pair for the two side panels, same as Cursor.
			if (isMod && !e.shiftKey && e.key.toLowerCase() === "b") {
				e.preventDefault()
				setSidebarVisible((v) => !v)
				return
			}
			if (isMod && e.shiftKey && e.key.toLowerCase() === "b") {
				e.preventDefault()
				setRightSidebarTab("menu")
				setRightSidebarVisible((v) => !v)
				return
			}
			if (isMod && e.shiftKey && e.key === "E") {
				e.preventDefault()
				setRightSidebarTab("menu")
				setRightSidebarVisible((v) => !v)
			}
			// ⇧⌘M — same gesture as VS Code's maximize panel.
			if (isMod && e.shiftKey && e.key.toLowerCase() === "m") {
				e.preventDefault()
				onToggleRightSidebarMaximized?.()
			}
			if (isMod && e.shiftKey && e.key === "G") {
				// Git panel only exists for git-backed projects.
				if (!hasGitRepo(projectInfo)) return
				e.preventDefault()
				setRightSidebarVisible(true)
				setRightSidebarTab("git")
			}
			// ⌥⌘O — the right panel's landing list, by name.
			if (isMod && e.altKey && e.key.toLowerCase() === "o") {
				e.preventDefault()
				setRightSidebarTab("menu")
				setRightSidebarVisible((v) => !v)
				return
			}
			if (isMod && !e.altKey && e.key === "o") {
				e.preventDefault()
				handleOpenFolder()
			}
			if (isMod && e.key === ",") {
				e.preventDefault()
				if (onToggleSettings) {
					onToggleSettings()
				} else {
					setActiveTab(activeTab === "settings" ? "chat" : "settings")
				}
			}
			if (isMod && e.key === "w" && activeTab !== "chat") {
				e.preventDefault()
				handleCloseTab(activeTab)
			}
			if (isMod && e.key === "p") {
				e.preventDefault()
				setShowQuickFileOpen((v) => !v)
			}
			if (isMod && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
				e.preventDefault()
				const index = parseInt(e.key) - 1
				if (index < enrichedProjects.length) {
					handleSwitchProject(enrichedProjects[index].rootPath)
				}
			}
			if (isMod && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
				e.preventDefault()
				if (enrichedProjects.length > 1 && projectInfo?.rootPath) {
					const currentIdx = enrichedProjects.findIndex(
						(p) => p.rootPath === projectInfo.rootPath,
					)
					if (currentIdx !== -1) {
						const delta = e.key === "ArrowDown" ? 1 : -1
						const nextIdx =
							(currentIdx + delta + enrichedProjects.length) %
							enrichedProjects.length
						handleSwitchProject(enrichedProjects[nextIdx].rootPath)
					}
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [
		activeTab,
		enrichedProjects,
		projectInfo,
		onToggleRightSidebarMaximized,
		onOpenSearch,
	])
}
