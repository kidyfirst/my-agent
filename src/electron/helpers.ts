import type { BrowserWindow } from "electron"
import { generateText } from "ai"
import type { Harness } from "@mastra/core/harness"
import type { AuthStorage } from "../auth/storage.js"

let mainWindowRef: BrowserWindow | null = null

export function setMainWindowRef(win: BrowserWindow | null) {
	mainWindowRef = win
}

export async function ensureAuthenticatedModel(
	h: Harness<any>,
	authStorage: AuthStorage,
) {
	authStorage.syncCredentials()

	let modelId = h.getCurrentModelId()

	// Automatically upgrade deprecated models (e.g. gemini-2.5-flash -> gemini-3.8-flash)
	if (modelId === "google/gemini-2.5-flash") {
		await h.switchModel({ modelId: "google/gemini-3.8-flash", scope: "thread" })
		await h.switchModel({ modelId: "google/gemini-3.8-flash", scope: "global" })
		await h.setState({
			currentModelId: "google/gemini-3.8-flash",
			subagentModelId: "google/gemini-3.8-flash",
			observerModelId: "google/gemini-3.8-flash",
			reflectorModelId: "google/gemini-3.8-flash",
		})
		mainWindowRef?.webContents.send("harness:event", {
			type: "model_changed",
			modelId: "google/gemini-3.8-flash",
			modeId: h.getCurrentModeId(),
		})
		console.log(
			`[model-auth] Automatically upgraded deprecated google/gemini-2.5-flash to google/gemini-3.8-flash`,
		)
		modelId = "google/gemini-3.8-flash"
	}

	const provider = modelId ? modelId.split("/")[0] : ""
	const authProviderId = provider === "openai" ? "openai-codex" : provider
	if (
		authProviderId &&
		authStorage.isLoggedIn(authProviderId) &&
		modelId !== "google/gemini-2.5-flash"
	) {
		await h.setState({
			currentModelId: modelId,
			subagentModelId: modelId,
			observerModelId: modelId,
			reflectorModelId: modelId,
			yolo: true,
		})
		if ((h as any).config?.modes) {
			for (const mode of (h as any).config.modes) {
				mode.defaultModelId = modelId
			}
		}
		return
	}

	const providerMapping: Array<{ authId: string; prefix: string }> = [
		{ authId: "google", prefix: "google" },
		{ authId: "openai-codex", prefix: "openai" },
		{ authId: "anthropic", prefix: "anthropic" },
	]
	for (const { authId } of providerMapping) {
		if (authStorage.isLoggedIn(authId)) {
			const fallback = authStorage.getDefaultModelForProvider(authId)
			if (fallback) {
				await h.switchModel({ modelId: fallback, scope: "thread" })
				await h.switchModel({ modelId: fallback, scope: "global" })
				await h.setState({
					currentModelId: fallback,
					subagentModelId: fallback,
					observerModelId: fallback,
					reflectorModelId: fallback,
					yolo: true,
				})
				if ((h as any).config?.modes) {
					for (const mode of (h as any).config.modes) {
						mode.defaultModelId = fallback
					}
				}
				mainWindowRef?.webContents.send("harness:event", {
					type: "model_changed",
					modelId: fallback,
					modeId: h.getCurrentModeId(),
				})
				console.log(
					`[model-auth] Switched unauthenticated ${provider || "none"} to ${fallback}`,
				)
				return
			}
		}
	}
}

export async function generateThreadTitle(
	h: Harness<any>,
	userMessage: string,
	resolveModel: (modelId: string) => any,
) {
	try {
		const modelId = h.getCurrentModelId()
		if (!modelId) return
		const model = resolveModel(modelId)
		if (!model) return

		let title = ""
		const promptText = `Generate a very short title (5-8 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or extra punctuation:\n\n${userMessage.slice(0, 500)}`

		if (typeof model.doStream === "function") {
			const res = await model.doStream({
				inputFormat: "prompt",
				mode: { type: "regular" },
				prompt: [
					{
						role: "user",
						content: [{ type: "text", text: promptText }],
					},
				],
			})

			const reader = res.stream.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				if (value?.type === "text-delta" && value.delta) {
					title += value.delta
				}
			}
		} else {
			const result = await generateText({
				model: model as any,
				prompt: promptText,
			})
			title = result.text ?? ""
		}

		title = title.trim().replace(/^["']|["']$/g, "")
		if (title) {
			await h.renameThread({ title })
			mainWindowRef?.webContents.send("harness:event", {
				type: "thread_title_updated",
				threadId: h.getCurrentThreadId(),
				title,
			})
		}
	} catch (err) {
		console.warn("Thread title generation failed:", err)
	}
}

export async function deleteThread(
	h: Harness<any>,
	threadId: string,
): Promise<void> {
	const currentThreadId = h.getCurrentThreadId()
	const isCurrent = currentThreadId === threadId
	let emitted = false

	try {
		if (typeof (h as any).deleteThread === "function") {
			await (h as any).deleteThread({ threadId })
			emitted = true
		} else {
			const memoryStorage = await (h as any).getMemoryStorage?.()
			if (memoryStorage && typeof memoryStorage.deleteThread === "function") {
				await memoryStorage.deleteThread({ threadId })
			}
		}
	} catch (err: any) {
		console.warn(
			`[deleteThread] harness.deleteThread error:`,
			err?.message || err,
		)
		try {
			const memoryStorage = await (h as any).getMemoryStorage?.()
			if (memoryStorage && typeof memoryStorage.deleteThread === "function") {
				await memoryStorage.deleteThread({ threadId })
			}
		} catch (storageErr) {
			console.error(
				`[deleteThread] memoryStorage.deleteThread fallback error:`,
				storageErr,
			)
		}
	}

	if (isCurrent) {
		try {
			await (h as any).config?.threadLock?.release?.(threadId)
		} catch {}
		;(h as any).currentThreadId = null
	}

	if (!emitted) {
		mainWindowRef?.webContents.send("harness:event", {
			type: "thread_deleted",
			threadId,
		})
	}
}
