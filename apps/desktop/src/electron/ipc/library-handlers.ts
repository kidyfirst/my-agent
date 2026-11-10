import { dialog, shell } from "electron"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { getLibraryService, DEFAULT_OM_MODEL_ID } from "@my-agent/core"
import type { IpcCommandHandler } from "./types.js"

export function getLibraryHandlers(): Record<string, IpcCommandHandler> {
	const service = getLibraryService()

	return {
		listLibraryItems: async (command) => {
			const subfolder = (command.folder as string) || ""
			const items = service.listItems(subfolder)
			const isSag = await service.checkSagConnection()
			return {
				items,
				isSagConnected: isSag,
				libraryPath: service.getLibraryPath(),
			}
		},

		createLibraryFolder: async (command) => {
			const name = command.name as string
			const parent = (command.parent as string) || ""
			const folder = service.createFolder(name, parent)
			return { success: true, folder }
		},

		uploadLibraryFiles: async (command, ctx) => {
			const parent = (command.parent as string) || ""
			const filePaths = (command.filePaths as string[]) || []
			const uploaded = []

			if (filePaths.length > 0) {
				const items = await service.importPaths(filePaths, parent)
				uploaded.push(...items)
			}

			// Also support base64 encoded payloads (e.g. from browser drag/drop)
			const rawFiles =
				(command.files as Array<{ name: string; buffer: string }>) || []
			for (const f of rawFiles) {
				const buf = Buffer.from(f.buffer, "base64")
				const item = await service.addFile(f.name, buf, parent)
				uploaded.push(item)
			}

			// Auto-run OCR on uploaded images using the configured model
			const session = ctx.getActiveSession()
			const harness = session.harness as any
			const resolver =
				typeof harness?.resolveModel === "function"
					? harness.resolveModel.bind(harness)
					: undefined
			const state = harness?.getState?.() as any
			const modelId = state?.imageProcessModelId || DEFAULT_OM_MODEL_ID

			for (const item of uploaded) {
				if (item.type === "image" && resolver) {
					void service.analyzeImage(item.path, resolver, modelId).catch((e) => {
						console.warn("[uploadLibraryFiles] Auto-OCR error:", e)
					})
				}
			}

			return { success: true, count: uploaded.length, items: uploaded }
		},

		analyzeLibraryImage: async (command, ctx) => {
			const id = (command.id as string) || ""
			const fullPath = path.resolve(service.getLibraryPath(), id)
			const session = ctx.getActiveSession()
			const harness = session.harness as any
			const resolver =
				typeof harness?.resolveModel === "function"
					? harness.resolveModel.bind(harness)
					: undefined
			const state = harness?.getState?.() as any
			const modelId = state?.imageProcessModelId || DEFAULT_OM_MODEL_ID

			const result = await service.analyzeImage(fullPath, resolver, modelId)
			return {
				success: Boolean(result),
				data: result,
			}
		},

		deleteLibraryItem: async (command) => {
			const id = command.id as string
			const success = await service.deleteItem(id)
			return { success }
		},

		toggleLibraryFavorite: async (command) => {
			const id = command.id as string
			const isFavorite = service.toggleFavorite(id)
			return { success: true, isFavorite }
		},

		searchLibrary: async (command, ctx) => {
			const session = ctx.getActiveSession()
			const harness = session.harness as any
			if (typeof harness?.resolveModel === "function") {
				const state = harness.getState() as any
				service.setConfig({
					resolveModel: harness.resolveModel.bind(harness),
					libraryJudgeModelId:
						state?.libraryJudgeModelId || DEFAULT_OM_MODEL_ID,
					imageProcessModelId:
						state?.imageProcessModelId || DEFAULT_OM_MODEL_ID,
				})
			}
			const query = (command.query as string) || ""
			const category = command.category as any
			const limit = typeof command.limit === "number" ? command.limit : 50
			const maxTokens =
				typeof command.maxTokens === "number" ? command.maxTokens : 0
			const result = await service.search({
				query,
				category,
				limit,
				maxTokens,
			})
			return result
		},

		getLibraryImageIndexStatus: async () => {
			return service.getImageIndexStatus()
		},

		indexLibraryImages: async (_command, ctx) => {
			const session = ctx.getActiveSession()
			const harness = session.harness as any
			const resolver =
				typeof harness?.resolveModel === "function"
					? harness.resolveModel.bind(harness)
					: undefined
			const state = harness?.getState?.() as any
			const modelId = state?.imageProcessModelId || DEFAULT_OM_MODEL_ID

			const result = await service.batchIndexImages(resolver, modelId)
			return result
		},

		openLibraryItemInFolder: async (command) => {
			const id = (command.id as string) || ""
			const fullPath = path.resolve(service.getLibraryPath(), id)
			shell.showItemInFolder(fullPath)
			return { success: true }
		},

		openLibraryItemInDefaultApp: async (command) => {
			const id = (command.id as string) || ""
			const fullPath = path.resolve(service.getLibraryPath(), id)
			await shell.openPath(fullPath)
			return { success: true }
		},

		openLibraryItemInBrowser: async (command) => {
			const id = (command.id as string) || ""
			const fullPath = path.resolve(service.getLibraryPath(), id)
			const fileUrl = pathToFileURL(fullPath).href
			try {
				await shell.openExternal(fileUrl)
			} catch {
				await shell.openPath(fullPath)
			}
			return { success: true }
		},

		openInBrowser: async (command) => {
			const id = (command.id as string) || ""
			const fullPath = path.resolve(service.getLibraryPath(), id)
			const fileUrl = pathToFileURL(fullPath).href
			try {
				await shell.openExternal(fileUrl)
			} catch {
				await shell.openPath(fullPath)
			}
			return { success: true }
		},

		getLibraryItemContent: async (command) => {
			const id = (command.id as string) || ""
			const data = await service.getItemContent(id)
			return data
		},

		openLibraryFileDialog: async (command, ctx) => {
			const kind = (command.kind as "file" | "image" | "folder") || "file"
			let properties: Array<"openFile" | "openDirectory" | "multiSelections"> =
				["openFile", "multiSelections"]
			let filters: Array<{ name: string; extensions: string[] }> | undefined

			if (kind === "folder") {
				properties = ["openDirectory", "multiSelections"]
			} else if (kind === "image") {
				filters = [
					{
						name: "Images",
						extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"],
					},
				]
			}

			const res = await dialog.showOpenDialog(ctx.mainWindow!, {
				title: kind === "folder" ? "Choose Folder" : "Choose Files",
				properties,
				filters,
			})

			if (res.canceled || !res.filePaths.length) {
				return { cancelled: true, filePaths: [] }
			}

			return { cancelled: false, filePaths: res.filePaths }
		},
	}
}
