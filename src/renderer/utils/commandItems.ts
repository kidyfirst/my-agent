import type { CommandItem } from "../components/CommandPalette"
import type { ThreadInfo } from "../types/ipc"

interface BuildCommandItemsArgs {
	close: () => void
	openThreadTabs: string[]
	openFiles: string[]
	threads: ThreadInfo[]
	enrichedProjects: { name: string; rootPath: string; gitBranch?: string }[]
	modeId: string
	thinkingLevel: string
	setActiveTab: (tab: string) => void
	setRightSidebarVisible: (visible: boolean) => void
	setRightSidebarTab: (tab: any) => void
	setSidebarVisible: (updater: (v: boolean) => boolean) => void
	setRightSidebarVisibleUpdater: (updater: (v: boolean) => boolean) => void
	setShowQuickFileOpen: (v: boolean) => void
	setShowModelSelector: (v: boolean) => void
	handleNewThread: () => void
	handleOpenFolder: () => void
	handleShowCloneModal: () => void
	handleBrowserOpen: (url: string) => void
	handleToggleThinking: () => void
	handleTogglePlanning: () => void
	handleSwitchProject: (rootPath: string) => void
}

/** Builds the ⌘K command palette entries. */
export function buildCommandItems(args: BuildCommandItemsArgs): CommandItem[] {
	const { close } = args
	const items: CommandItem[] = []

	items.push({
		id: "settings",
		label: "Open Settings",
		group: "Navigation",
		shortcut: "\u2318,",
		action: () => {
			args.setActiveTab("settings")
			close()
		},
	})
	items.push({
		id: "agents",
		label: "Open Agent Dashboard",
		group: "Navigation",
		action: () => {
			args.setActiveTab("agents")
			close()
		},
	})
	items.push({
		id: "focus-git",
		label: "Focus Git Panel",
		group: "Navigation",
		shortcut: "\u2318\u21e7G",
		action: () => {
			args.setRightSidebarVisible(true)
			args.setRightSidebarTab("git")
			close()
		},
	})
	items.push({
		id: "focus-files",
		label: "Focus File Tree",
		group: "Navigation",
		action: () => {
			args.setRightSidebarVisible(true)
			args.setRightSidebarTab("files")
			close()
		},
	})
	items.push({
		id: "focus-context",
		label: "Focus Context Panel",
		group: "Navigation",
		action: () => {
			args.setRightSidebarVisible(true)
			args.setRightSidebarTab("context")
			close()
		},
	})

	items.push({
		id: "search-files",
		label: "Search Files",
		group: "Actions",
		shortcut: "\u2318P",
		action: () => {
			args.setShowQuickFileOpen(true)
			close()
		},
	})
	items.push({
		id: "new-thread",
		label: "New Thread",
		group: "Actions",
		action: () => {
			args.handleNewThread()
			close()
		},
	})
	items.push({
		id: "switch-model",
		label: "Switch Model",
		group: "Actions",
		action: () => {
			args.setShowModelSelector(true)
			close()
		},
	})
	items.push({
		id: "open-folder",
		label: "Open Folder",
		group: "Actions",
		shortcut: "\u2318O",
		action: () => {
			args.handleOpenFolder()
			close()
		},
	})
	items.push({
		id: "clone-repo",
		label: "Clone from URL",
		group: "Actions",
		action: () => {
			args.handleShowCloneModal()
			close()
		},
	})
	items.push({
		id: "toggle-left-sidebar",
		label: "Toggle Left Sidebar",
		group: "Actions",
		shortcut: "\u2318B",
		action: () => {
			args.setSidebarVisible((v) => !v)
			close()
		},
	})
	items.push({
		id: "toggle-right-sidebar",
		label: "Toggle Right Sidebar",
		group: "Actions",
		shortcut: "\u2318`",
		action: () => {
			args.setRightSidebarVisibleUpdater((v) => !v)
			close()
		},
	})
	items.push({
		id: "open-browser",
		label: "Open Browser",
		group: "Actions",
		action: () => {
			args.handleBrowserOpen("about:blank")
			close()
		},
	})
	items.push({
		id: "toggle-thinking",
		label:
			args.thinkingLevel === "off" ? "Enable Thinking" : "Disable Thinking",
		group: "Actions",
		action: () => {
			args.handleToggleThinking()
			close()
		},
	})
	items.push({
		id: "toggle-planning",
		label:
			args.modeId === "plan" ? "Switch to Build Mode" : "Switch to Plan Mode",
		group: "Actions",
		action: () => {
			args.handleTogglePlanning()
			close()
		},
	})
	items.push({
		id: "toggle-theme",
		label: "Toggle Theme",
		group: "Actions",
		action: () => {
			const current =
				document.documentElement.getAttribute("data-theme") === "dark"
					? "light"
					: "dark"
			document.documentElement.setAttribute("data-theme", current)
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("myagent-theme", current)
			}
			window.api.invoke({ type: "setState", patch: { theme: current } })
			close()
		},
	})

	for (const threadId of args.openThreadTabs) {
		const thread = args.threads.find((t) => t.id === threadId)
		items.push({
			id: `tab-thread-${threadId}`,
			label: thread?.title || "New Thread",
			group: "Open Tabs",
			action: () => {
				args.setActiveTab(`thread:${threadId}`)
				close()
			},
		})
	}
	for (const fileTab of args.openFiles) {
		const name = fileTab.split("/").pop() || fileTab
		items.push({
			id: `tab-file-${fileTab}`,
			label: name,
			description: fileTab,
			group: "Open Tabs",
			action: () => {
				args.setActiveTab(fileTab)
				close()
			},
		})
	}

	for (const p of args.enrichedProjects) {
		items.push({
			id: `project-${p.rootPath}`,
			label: p.name,
			description: p.gitBranch || "",
			group: "Workspaces",
			action: () => {
				args.handleSwitchProject(p.rootPath)
				close()
			},
		})
	}

	return items
}
